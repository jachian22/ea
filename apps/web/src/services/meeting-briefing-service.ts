import type {
  GoogleIntegration,
  CalendarEventData,
  MeetingAttendeeInfo,
  PreviousMeetingInfo,
  RelatedEmailThread,
  BriefingCommitmentInfo,
  SuggestedPrepItem,
  MeetingBriefing,
} from '~/db/schema';
import { fetchEventsForDailyBrief } from '~/services/google-calendar';
import { findGoogleIntegrationByUserId } from '~/data-access/google-integration';
import {
  createMeetingBriefing,
  findMeetingBriefingByEventId,
  updateMeetingBriefing,
  updateMeetingBriefingStatus,
  findMeetingsNeedingBriefings,
  findBriefingsNeedingNotification,
  markBriefingNotificationSent,
} from '~/data-access/meeting-briefings';
import { findPersonByUserIdAndEmail, findOrCreatePerson } from '~/data-access/persons';
import { findCommitmentsWithPerson, type CommitmentWithPerson } from '~/data-access/commitments';
import { findRecentInteractionsForPerson } from '~/data-access/interactions';
import { sendMeetingBriefingNotification } from '~/services/notification-service';
import { GoogleAuthError, isIntegrationValid } from '~/lib/google-client';

// ============================================================================
// Types
// ============================================================================

export interface BriefingGenerationResult {
  success: boolean;
  briefing?: MeetingBriefing;
  error?: {
    code: string;
    message: string;
  };
}

export interface BriefingGenerationOptions {
  timeZone?: string;
}

// ============================================================================
// Meeting Briefing Service
// ============================================================================

/**
 * Service for generating pre-meeting briefings.
 *
 * This service:
 * - Creates briefing records for upcoming calendar events
 * - Enriches briefings with attendee information from the knowledge graph
 * - Includes relevant commitments and interaction history
 * - Generates suggested prep items
 */
export class MeetingBriefingService {
  private userId: string;
  private integration: GoogleIntegration | null = null;
  private options: Required<BriefingGenerationOptions>;

  constructor(userId: string, options: BriefingGenerationOptions = {}) {
    this.userId = userId;
    this.options = {
      timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Generate a briefing for a specific meeting
   */
  async generateBriefing(event: CalendarEventData): Promise<BriefingGenerationResult> {
    try {
      // Check if briefing already exists and is completed
      const existing = await findMeetingBriefingByEventId(this.userId, event.id);
      if (existing && existing.status === 'completed') {
        return { success: true, briefing: existing };
      }

      // Create or update briefing record
      const briefingId = existing?.id || crypto.randomUUID();
      let briefing = existing;

      if (!briefing) {
        briefing = await createMeetingBriefing({
          id: briefingId,
          userId: this.userId,
          calendarEventId: event.id,
          meetingTitle: event.title,
          meetingStartTime: new Date(event.startTime),
          meetingEndTime: new Date(event.endTime),
          meetingLocation: event.location,
          meetingLink: event.meetingLink,
          status: 'generating',
        });
      } else {
        await updateMeetingBriefingStatus(briefingId, 'generating');
      }

      // Gather attendee information
      const attendees = await this.gatherAttendeeInfo(event.attendees || []);

      // Gather related context
      const upcomingCommitments = await this.gatherCommitments(attendees);
      const suggestedPrep = this.generateSuggestedPrep(attendees, upcomingCommitments);

      // Generate briefing content
      const briefingContent = this.formatBriefingContent({
        event,
        attendees,
        upcomingCommitments,
        suggestedPrep,
      });

      // Update briefing with all data
      briefing = await updateMeetingBriefing(briefingId, {
        attendees,
        upcomingCommitments,
        suggestedPrep,
        briefingContent,
        status: 'completed',
        generatedAt: new Date(),
      });

      return { success: true, briefing: briefing! };
    } catch (error) {
      console.error('Failed to generate meeting briefing:', error);

      return {
        success: false,
        error: {
          code: 'BRIEFING_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * Generate briefings for all upcoming meetings
   */
  async generateBriefingsForUpcomingMeetings(
    hoursAhead: number = 24
  ): Promise<BriefingGenerationResult[]> {
    // Load Google integration
    this.integration = await findGoogleIntegrationByUserId(this.userId);

    if (!isIntegrationValid(this.integration)) {
      return [
        {
          success: false,
          error: {
            code: 'INTEGRATION_NOT_CONNECTED',
            message: 'Google account is not connected',
          },
        },
      ];
    }

    // Fetch upcoming events
    const events = await fetchEventsForDailyBrief(this.integration!, this.options.timeZone);

    // Filter to events within the time window
    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() + hoursAhead);

    const upcomingEvents = events.filter((event) => {
      const startTime = new Date(event.startTime);
      return startTime >= now && startTime <= cutoff && !event.isAllDay;
    });

    // Generate briefings for each event
    const results: BriefingGenerationResult[] = [];

    for (const event of upcomingEvents) {
      const result = await this.generateBriefing(event);
      results.push(result);
    }

    return results;
  }

  /**
   * Gather detailed attendee information from the knowledge graph
   */
  private async gatherAttendeeInfo(
    eventAttendees: CalendarEventData['attendees']
  ): Promise<MeetingAttendeeInfo[]> {
    if (!eventAttendees || eventAttendees.length === 0) {
      return [];
    }

    const attendeeInfo: MeetingAttendeeInfo[] = [];

    for (const attendee of eventAttendees) {
      // Look up person in knowledge graph
      const person = await findPersonByUserIdAndEmail(this.userId, attendee.email);

      if (person) {
        // Get recent interactions
        const recentInteractions = await findRecentInteractionsForPerson(person.id, 3);

        // Get open commitments
        const allCommitments = await findCommitmentsWithPerson(this.userId, {
          status: ['pending', 'in_progress'],
        });

        const personCommitments = allCommitments.filter((c) => c.personId === person.id);

        const openCommitmentsYouOwe = personCommitments
          .filter((c) => c.direction === 'user_owes')
          .map((c) => ({
            description: c.description,
            dueDate: c.dueDate?.toISOString(),
          }));

        const openCommitmentsTheyOwe = personCommitments
          .filter((c) => c.direction === 'they_owe')
          .map((c) => ({
            description: c.description,
            dueDate: c.dueDate?.toISOString(),
          }));

        attendeeInfo.push({
          email: attendee.email,
          name: person.name || attendee.name,
          personId: person.id,
          role: person.role || undefined,
          company: person.company || undefined,
          domain: person.domain || undefined,
          lastContactAt: person.lastContactAt?.toISOString(),
          lastContactChannel: person.lastContactChannel || undefined,
          openCommitmentsYouOwe,
          openCommitmentsTheyOwe,
          recentInteractions: recentInteractions.map((i) => ({
            date: i.occurredAt.toISOString(),
            summary: i.summary || i.subject || `${i.type} via ${i.channel}`,
          })),
          personalNotes: person.personalNotes || undefined,
        });
      } else {
        // Create a basic entry for unknown attendees
        attendeeInfo.push({
          email: attendee.email,
          name: attendee.name,
        });
      }
    }

    return attendeeInfo;
  }

  /**
   * Gather commitments relevant to meeting attendees
   */
  private async gatherCommitments(
    attendees: MeetingAttendeeInfo[]
  ): Promise<BriefingCommitmentInfo[]> {
    const personIds = attendees.filter((a) => a.personId).map((a) => a.personId!);

    if (personIds.length === 0) {
      return [];
    }

    const allCommitments = await findCommitmentsWithPerson(this.userId, {
      status: ['pending', 'in_progress'],
    });

    const relevantCommitments = allCommitments
      .filter((c) => c.personId && personIds.includes(c.personId))
      .map((c) => ({
        id: c.id,
        description: c.description,
        direction: c.direction as 'user_owes' | 'they_owe',
        personName: c.person?.name || c.person?.email,
        dueDate: c.dueDate?.toISOString(),
        isOverdue: c.dueDate ? c.dueDate < new Date() : false,
      }));

    // Sort: overdue first, then by due date
    relevantCommitments.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      return 0;
    });

    return relevantCommitments;
  }

  /**
   * Generate suggested prep items based on attendee info and commitments
   */
  private generateSuggestedPrep(
    attendees: MeetingAttendeeInfo[],
    commitments: BriefingCommitmentInfo[]
  ): SuggestedPrepItem[] {
    const prepItems: SuggestedPrepItem[] = [];

    // Add follow-ups for overdue commitments
    for (const commitment of commitments) {
      if (commitment.isOverdue && commitment.direction === 'user_owes') {
        prepItems.push({
          type: 'follow_up',
          description: `Follow up on: ${commitment.description}`,
          personName: commitment.personName,
          relatedCommitmentId: commitment.id,
        });
      }
    }

    // Add items to ask about (things they owe you)
    for (const commitment of commitments) {
      if (commitment.direction === 'they_owe') {
        prepItems.push({
          type: 'ask_about',
          description: `Ask about: ${commitment.description}`,
          personName: commitment.personName,
          relatedCommitmentId: commitment.id,
        });
      }
    }

    // Add personal notes reminders
    for (const attendee of attendees) {
      if (attendee.personalNotes) {
        prepItems.push({
          type: 'remember',
          description: attendee.personalNotes,
          personName: attendee.name,
        });
      }
    }

    return prepItems;
  }

  /**
   * Format the briefing content as readable text
   */
  private formatBriefingContent(data: {
    event: CalendarEventData;
    attendees: MeetingAttendeeInfo[];
    upcomingCommitments: BriefingCommitmentInfo[];
    suggestedPrep: SuggestedPrepItem[];
  }): string {
    const { event, attendees, upcomingCommitments, suggestedPrep } = data;
    const lines: string[] = [];

    // Header
    lines.push(`Meeting: ${event.title}`);
    lines.push(`Time: ${this.formatTime(event.startTime)} - ${this.formatTime(event.endTime)}`);
    if (event.location) {
      lines.push(`Location: ${event.location}`);
    }
    if (event.meetingLink) {
      lines.push(`Link: ${event.meetingLink}`);
    }
    lines.push('');

    // Attendees
    if (attendees.length > 0) {
      lines.push('ATTENDEES');
      lines.push('─────────');

      for (const attendee of attendees) {
        const name = attendee.name || attendee.email;
        const roleCompany = [attendee.role, attendee.company].filter(Boolean).join(' at ');

        lines.push(`• ${name}${roleCompany ? ` - ${roleCompany}` : ''}`);

        if (attendee.domain) {
          lines.push(`  Domain: ${attendee.domain}`);
        }

        if (attendee.lastContactAt) {
          const lastContact = new Date(attendee.lastContactAt);
          const daysAgo = Math.round((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24));
          lines.push(
            `  Last contact: ${daysAgo} days ago via ${attendee.lastContactChannel || 'unknown'}`
          );
        }

        if (attendee.openCommitmentsYouOwe && attendee.openCommitmentsYouOwe.length > 0) {
          lines.push(`  You owe them:`);
          for (const c of attendee.openCommitmentsYouOwe) {
            lines.push(`    - ${c.description}`);
          }
        }

        if (attendee.openCommitmentsTheyOwe && attendee.openCommitmentsTheyOwe.length > 0) {
          lines.push(`  They owe you:`);
          for (const c of attendee.openCommitmentsTheyOwe) {
            lines.push(`    - ${c.description}`);
          }
        }

        if (attendee.recentInteractions && attendee.recentInteractions.length > 0) {
          lines.push(`  Recent interactions:`);
          for (const i of attendee.recentInteractions) {
            const date = new Date(i.date).toLocaleDateString();
            lines.push(`    - ${date}: ${i.summary}`);
          }
        }

        if (attendee.personalNotes) {
          lines.push(`  Notes: ${attendee.personalNotes}`);
        }

        lines.push('');
      }
    }

    // Suggested Prep
    if (suggestedPrep.length > 0) {
      lines.push('SUGGESTED PREP');
      lines.push('──────────────');

      const followUps = suggestedPrep.filter((p) => p.type === 'follow_up');
      const askAbout = suggestedPrep.filter((p) => p.type === 'ask_about');
      const remember = suggestedPrep.filter((p) => p.type === 'remember');

      if (followUps.length > 0) {
        lines.push('Follow up on:');
        for (const item of followUps) {
          lines.push(`• ${item.description}`);
        }
      }

      if (askAbout.length > 0) {
        lines.push('Ask about:');
        for (const item of askAbout) {
          lines.push(`• ${item.description}`);
        }
      }

      if (remember.length > 0) {
        lines.push('Remember:');
        for (const item of remember) {
          lines.push(`• ${item.personName}: ${item.description}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format time for display
   */
  private formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: this.options.timeZone,
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate a meeting briefing for a user
 */
export async function generateMeetingBriefing(
  userId: string,
  event: CalendarEventData,
  options?: BriefingGenerationOptions
): Promise<BriefingGenerationResult> {
  const service = new MeetingBriefingService(userId, options);
  return service.generateBriefing(event);
}

/**
 * Generate briefings for all upcoming meetings
 */
export async function generateUpcomingMeetingBriefings(
  userId: string,
  hoursAhead: number = 24,
  options?: BriefingGenerationOptions
): Promise<BriefingGenerationResult[]> {
  const service = new MeetingBriefingService(userId, options);
  return service.generateBriefingsForUpcomingMeetings(hoursAhead);
}

/**
 * Process pending meeting briefings (for background job)
 */
export async function processPendingMeetingBriefings(minutesBefore: number = 30): Promise<void> {
  const pendingBriefings = await findMeetingsNeedingBriefings(minutesBefore);

  for (const briefing of pendingBriefings) {
    try {
      const service = new MeetingBriefingService(briefing.userId);

      // Create a minimal event object for generation
      const event: CalendarEventData = {
        id: briefing.calendarEventId,
        title: briefing.meetingTitle,
        startTime: briefing.meetingStartTime.toISOString(),
        endTime: briefing.meetingEndTime.toISOString(),
        location: briefing.meetingLocation || undefined,
        meetingLink: briefing.meetingLink || undefined,
      };

      await service.generateBriefing(event);
    } catch (error) {
      console.error(`Failed to generate briefing ${briefing.id}:`, error);
      await updateMeetingBriefingStatus(
        briefing.id,
        'failed',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

/**
 * Send notifications for ready briefings (for background job)
 */
export async function sendBriefingNotifications(minutesBefore: number = 15): Promise<void> {
  const readyBriefings = await findBriefingsNeedingNotification(minutesBefore);

  for (const briefing of readyBriefings) {
    try {
      await sendMeetingBriefingNotification(
        briefing.userId,
        briefing.id,
        briefing.meetingTitle,
        briefing.meetingStartTime
      );

      await markBriefingNotificationSent(briefing.id);
    } catch (error) {
      console.error(`Failed to send notification for briefing ${briefing.id}:`, error);
    }
  }
}

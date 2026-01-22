import type {
  GoogleIntegration,
  CalendarEventData,
  EmailData,
  DailyBrief,
  Commitment,
  Person,
} from "~/db/schema";
import { fetchEmailsForDailyBrief } from "~/services/gmail";
import { fetchEventsForDailyBrief } from "~/services/google-calendar";
import {
  analyzeEmailsForBrief,
  getTopPriorityEmails,
  hasUrgentEmails,
  type EmailAnalysis,
} from "~/utils/email-analyzer";
import {
  findGoogleIntegrationByUserId,
  updateGoogleIntegrationLastSynced,
} from "~/data-access/google-integration";
import {
  upsertDailyBrief,
  getTodayDateString,
} from "~/data-access/daily-briefs";
import {
  findCommitmentsDueToday,
  findOverdueCommitments,
  findUpcomingCommitments,
  findCommitmentsWithPerson,
  type CommitmentWithPerson,
} from "~/data-access/commitments";
import {
  findStaleContacts,
  findHighImportancePersons,
} from "~/data-access/persons";
import { findTodaysMeetingBriefings } from "~/data-access/meeting-briefings";
import {
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
  markIntegrationDisconnected,
} from "~/lib/google-client";

// ============================================================================
// Types
// ============================================================================

export interface EnhancedBriefGenerationOptions {
  timeZone?: string;
  topPriorityLimit?: number;
  includeCommitments?: boolean;
  includeFollowUpRadar?: boolean;
  staleContactDaysThreshold?: number;
}

export interface EnhancedBriefGenerationResult {
  success: boolean;
  brief?: DailyBrief;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface EnhancedBriefData {
  // Calendar & Email (existing)
  calendarEvents: CalendarEventData[];
  emails: EmailData[];
  emailAnalysis: {
    grouped: { needsResponse: EmailAnalysis[]; awaitingReply: EmailAnalysis[]; fyi: EmailAnalysis[] };
    summary: { total: number; needsResponse: number; awaitingReply: number; fyi: number };
    all: EmailAnalysis[];
  };
  topPriorityEmails: EmailAnalysis[];
  hasUrgentEmails: boolean;

  // Commitments (new)
  commitmentsDueToday: CommitmentWithPerson[];
  overdueCommitments: CommitmentWithPerson[];
  upcomingCommitments: CommitmentWithPerson[];

  // Follow-up Radar (new)
  staleContacts: Array<Person & { daysSinceContact: number }>;

  // Meeting Briefings (new)
  meetingsWithBriefings: number;
}

// ============================================================================
// Enhanced Brief Generator Service
// ============================================================================

/**
 * Enhanced service for generating daily briefs that now include:
 * - Commitment tracking (due today, overdue, upcoming)
 * - Follow-up radar (stale contacts)
 * - Meeting briefing status
 */
export class EnhancedBriefGeneratorService {
  private userId: string;
  private integration: GoogleIntegration | null = null;
  private options: Required<EnhancedBriefGenerationOptions>;

  constructor(userId: string, options: EnhancedBriefGenerationOptions = {}) {
    this.userId = userId;
    this.options = {
      timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      topPriorityLimit: options.topPriorityLimit ?? 5,
      includeCommitments: options.includeCommitments ?? true,
      includeFollowUpRadar: options.includeFollowUpRadar ?? true,
      staleContactDaysThreshold: options.staleContactDaysThreshold ?? 30,
    };
  }

  /**
   * Generate an enhanced daily brief
   */
  async generateBrief(): Promise<EnhancedBriefGenerationResult> {
    const briefDate = getTodayDateString();

    try {
      // Validate Google integration
      this.integration = await findGoogleIntegrationByUserId(this.userId);

      if (!isIntegrationValid(this.integration)) {
        return {
          success: false,
          error: {
            code: "INTEGRATION_NOT_CONNECTED",
            message: "Google account is not connected.",
            retryable: false,
          },
        };
      }

      // Create brief record with generating status
      let brief = await upsertDailyBrief(this.userId, briefDate, {
        id: crypto.randomUUID(),
        status: "generating",
      });

      // Fetch all data
      const briefData = await this.fetchEnhancedBriefData();

      // Generate enhanced brief content
      const briefContent = this.generateEnhancedBriefContent(briefData, briefDate);

      // Persist the completed brief
      brief = await upsertDailyBrief(this.userId, briefDate, {
        id: brief.id,
        calendarEvents: briefData.calendarEvents,
        emails: briefData.emails,
        briefContent,
        status: "completed",
        totalEvents: String(briefData.calendarEvents.length),
        totalEmails: String(briefData.emails.length),
        emailsNeedingResponse: String(briefData.emailAnalysis.summary.needsResponse),
        generatedAt: new Date(),
      });

      // Update last synced
      await updateGoogleIntegrationLastSynced(this.userId);

      return { success: true, brief };
    } catch (error) {
      console.error("Failed to generate enhanced brief:", error);

      if (error instanceof GoogleAuthError) {
        if (
          error.code === GoogleAuthErrorCodes.TOKEN_REFRESH_FAILED ||
          error.code === GoogleAuthErrorCodes.INVALID_CREDENTIALS
        ) {
          await markIntegrationDisconnected(this.userId);
        }
      }

      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await upsertDailyBrief(this.userId, briefDate, {
        id: crypto.randomUUID(),
        status: "failed",
        errorMessage,
      });

      return {
        success: false,
        error: {
          code: "GENERATION_FAILED",
          message: errorMessage,
          retryable: true,
        },
      };
    }
  }

  /**
   * Fetch all data for the enhanced brief
   */
  private async fetchEnhancedBriefData(): Promise<EnhancedBriefData> {
    // Fetch calendar and email data in parallel with commitment data
    const [
      calendarEvents,
      emails,
      commitmentsDueToday,
      overdueCommitments,
      upcomingCommitments,
      staleContacts,
      todaysBriefings,
    ] = await Promise.all([
      fetchEventsForDailyBrief(this.integration!, this.options.timeZone),
      fetchEmailsForDailyBrief(this.integration!),
      this.options.includeCommitments
        ? findCommitmentsWithPerson(this.userId, {
            status: ["pending", "in_progress"],
          }).then((all) =>
            all.filter((c) => {
              if (!c.dueDate) return false;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const tomorrow = new Date(today);
              tomorrow.setDate(tomorrow.getDate() + 1);
              return c.dueDate >= today && c.dueDate < tomorrow;
            })
          )
        : Promise.resolve([]),
      this.options.includeCommitments
        ? findCommitmentsWithPerson(this.userId, {
            status: ["pending", "in_progress"],
          }).then((all) =>
            all.filter((c) => c.dueDate && c.dueDate < new Date())
          )
        : Promise.resolve([]),
      this.options.includeCommitments
        ? findCommitmentsWithPerson(this.userId, {
            status: ["pending", "in_progress"],
          }).then((all) => {
            const now = new Date();
            const weekLater = new Date();
            weekLater.setDate(weekLater.getDate() + 7);
            return all.filter(
              (c) => c.dueDate && c.dueDate >= now && c.dueDate <= weekLater
            );
          })
        : Promise.resolve([]),
      this.options.includeFollowUpRadar
        ? findStaleContacts(this.userId, this.options.staleContactDaysThreshold, 10)
        : Promise.resolve([]),
      findTodaysMeetingBriefings(this.userId),
    ]);

    // Analyze emails
    const emailAnalysis = analyzeEmailsForBrief(emails, this.integration!.googleEmail);
    const topPriorityEmails = getTopPriorityEmails(emailAnalysis.all, this.options.topPriorityLimit);
    const urgent = hasUrgentEmails(emailAnalysis.all);

    // Calculate days since contact for stale contacts
    const staleContactsWithDays = staleContacts.map((person) => ({
      ...person,
      daysSinceContact: person.lastContactAt
        ? Math.round((Date.now() - person.lastContactAt.getTime()) / (1000 * 60 * 60 * 24))
        : 999,
    }));

    return {
      calendarEvents,
      emails,
      emailAnalysis,
      topPriorityEmails,
      hasUrgentEmails: urgent,
      commitmentsDueToday,
      overdueCommitments,
      upcomingCommitments,
      staleContacts: staleContactsWithDays,
      meetingsWithBriefings: todaysBriefings.filter((b) => b.status === "completed").length,
    };
  }

  /**
   * Generate enhanced brief content with commitment sections
   */
  private generateEnhancedBriefContent(data: EnhancedBriefData, briefDate: string): string {
    const sections: string[] = [];

    // Header
    const greeting = this.getGreeting();
    sections.push(`# ${greeting}`);
    sections.push(`**${this.formatDate(briefDate)}**`);
    sections.push("");

    // Summary
    sections.push("## Today at a Glance");
    sections.push("");
    sections.push(`- **Meetings:** ${data.calendarEvents.length}`);
    sections.push(`- **Emails:** ${data.emails.length} (${data.emailAnalysis.summary.needsResponse} need response)`);

    if (this.options.includeCommitments) {
      sections.push(`- **Commitments Due Today:** ${data.commitmentsDueToday.length}`);
      if (data.overdueCommitments.length > 0) {
        sections.push(`- **Overdue:** ${data.overdueCommitments.length} (action required)`);
      }
    }
    sections.push("");

    // Commitments Due Today
    if (this.options.includeCommitments && data.commitmentsDueToday.length > 0) {
      sections.push("## COMMITMENTS DUE TODAY");
      sections.push("─────────────────────");
      sections.push("");

      const userOwes = data.commitmentsDueToday.filter((c) => c.direction === "user_owes");
      const theyOwe = data.commitmentsDueToday.filter((c) => c.direction === "they_owe");

      if (userOwes.length > 0) {
        sections.push("**Things you promised:**");
        for (const c of userOwes) {
          const person = c.person?.name || c.person?.email || "someone";
          sections.push(`• ${c.description} → ${person}`);
        }
        sections.push("");
      }

      if (theyOwe.length > 0) {
        sections.push("**Things promised to you:**");
        for (const c of theyOwe) {
          const person = c.person?.name || c.person?.email || "someone";
          sections.push(`• ${person}: ${c.description}`);
        }
        sections.push("");
      }
    }

    // Overdue Commitments
    if (this.options.includeCommitments && data.overdueCommitments.length > 0) {
      sections.push("## OVERDUE (Action Required)");
      sections.push("─────────────────────────");
      sections.push("");

      const userOwes = data.overdueCommitments
        .filter((c) => c.direction === "user_owes")
        .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));

      const theyOwe = data.overdueCommitments
        .filter((c) => c.direction === "they_owe")
        .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));

      if (userOwes.length > 0) {
        sections.push("**Your overdue promises (oldest first):**");
        for (const c of userOwes) {
          const person = c.person?.name || c.person?.email || "someone";
          const daysOverdue = c.dueDate
            ? Math.round((Date.now() - c.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          sections.push(`• ${c.description} → ${person} - ${daysOverdue} days overdue`);
        }
        sections.push("");
      }

      if (theyOwe.length > 0) {
        sections.push("**Waiting on others:**");
        for (const c of theyOwe) {
          const person = c.person?.name || c.person?.email || "someone";
          const daysOverdue = c.dueDate
            ? Math.round((Date.now() - c.dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
          sections.push(`• ${person}: ${c.description} - ${daysOverdue} days overdue`);
        }
        sections.push("");
      }
    }

    // Follow-up Radar
    if (this.options.includeFollowUpRadar && data.staleContacts.length > 0) {
      sections.push("## FOLLOW-UP RADAR");
      sections.push("───────────────");
      sections.push("");
      sections.push("**People you haven't contacted in a while:**");

      for (const person of data.staleContacts.slice(0, 5)) {
        const name = person.name || person.email;
        const domain = person.domain || "contact";
        sections.push(`• ${name} (${domain}) - last contact ${person.daysSinceContact} days ago`);
      }
      sections.push("");
    }

    // Upcoming This Week
    if (this.options.includeCommitments && data.upcomingCommitments.length > 0) {
      sections.push("## UPCOMING THIS WEEK");
      sections.push("──────────────────");
      sections.push("");

      for (const c of data.upcomingCommitments.slice(0, 5)) {
        const person = c.person?.name || c.person?.email || "";
        const dueStr = c.dueDate
          ? c.dueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
          : "";
        const direction = c.direction === "user_owes" ? "→" : "←";
        sections.push(`• ${c.description} ${direction} ${person} (${dueStr})`);
      }
      sections.push("");
    }

    // Calendar Section (existing)
    sections.push("## Calendar");
    sections.push("");

    if (data.calendarEvents.length === 0) {
      sections.push("No meetings scheduled for today. Great time for focused work!");
    } else {
      for (const event of data.calendarEvents) {
        const time = event.isAllDay
          ? "All Day"
          : `${this.formatTime(event.startTime)} - ${this.formatTime(event.endTime)}`;

        sections.push(`### ${event.title}`);
        sections.push(`**Time:** ${time}`);

        if (event.meetingLink) {
          sections.push(`**Link:** [Join Meeting](${event.meetingLink})`);
        }
        sections.push("");
      }
    }

    // Email Section (existing)
    sections.push("## Email Summary");
    sections.push("");

    if (data.emails.length === 0) {
      sections.push("No new emails in the past 24 hours. Inbox zero!");
    } else {
      if (data.emailAnalysis.grouped.needsResponse.length > 0) {
        sections.push("### Needs Response");
        for (const analysis of data.emailAnalysis.grouped.needsResponse.slice(0, 3)) {
          const from = analysis.email.from.name || analysis.email.from.email;
          sections.push(`• **${analysis.email.subject}** from ${from}`);
        }
        sections.push("");
      }

      if (data.emailAnalysis.grouped.awaitingReply.length > 0) {
        sections.push(`### Awaiting Reply: ${data.emailAnalysis.grouped.awaitingReply.length} emails`);
        sections.push("");
      }

      if (data.emailAnalysis.grouped.fyi.length > 0) {
        sections.push(`### FYI: ${data.emailAnalysis.grouped.fyi.length} emails`);
        sections.push("");
      }
    }

    return sections.join("\n");
  }

  private getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString + "T00:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  private formatTime(isoString: string): string {
    return new Date(isoString).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate an enhanced daily brief for a user
 */
export async function generateEnhancedDailyBrief(
  userId: string,
  options?: EnhancedBriefGenerationOptions
): Promise<EnhancedBriefGenerationResult> {
  const generator = new EnhancedBriefGeneratorService(userId, options);
  return generator.generateBrief();
}

import type {
  GoogleIntegration,
  CalendarEventData,
  EmailData,
  DailyBrief,
  Commitment,
  Person,
} from '~/db/schema';
import { fetchEmailsForDailyBrief } from '~/services/gmail';
import { fetchEventsForDailyBrief } from '~/services/google-calendar';
import { fetchWeatherForUser, formatWeatherForBrief, type WeatherData } from '~/services/weather';
import { getUserProfile } from '~/data-access/profiles';
import {
  analyzeEmailsForBrief,
  type GroupedEmails,
  type EmailAnalysisSummary,
  type EmailAnalysis,
  getTopPriorityEmails,
  hasUrgentEmails,
  groupEmailsByThread,
  groupThreadsByState,
  generateThreadSummary,
  type EmailThread,
  type GroupedThreads,
  type ThreadAnalysisSummary,
} from '~/utils/email-analyzer';
import {
  findGoogleIntegrationByUserId,
  updateGoogleIntegrationLastSynced,
} from '~/data-access/google-integration';
import {
  upsertDailyBrief,
  updateDailyBriefStatus,
  getTodayDateString,
} from '~/data-access/daily-briefs';
import {
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
  markIntegrationDisconnected,
} from '~/lib/google-client';
import {
  findCommitmentsDueToday,
  findOverdueCommitments,
  findUpcomingCommitments,
} from '~/data-access/commitments';
import { findStaleContacts } from '~/data-access/persons';
import { enrichBriefData } from '~/services/brief-enrichment';

/**
 * Configuration options for brief generation
 */
export interface BriefGenerationOptions {
  /** User's timezone for date calculations (default: system timezone) */
  timeZone?: string;
  /** Maximum number of top priority emails to highlight (default: 5) */
  topPriorityLimit?: number;
  /** Include detailed email analysis in the brief (default: true) */
  includeEmailDetails?: boolean;
  /** Maximum retries for API calls (default: 3) */
  maxRetries?: number;
}

/**
 * Result of a brief generation attempt
 */
export interface BriefGenerationResult {
  success: boolean;
  brief?: DailyBrief;
  error?: BriefGenerationError;
}

/**
 * Error details for failed brief generation
 */
export interface BriefGenerationError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Commitment with person info for display
 */
export interface CommitmentWithPerson extends Commitment {
  person?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
}

/**
 * Follow-up radar item
 */
export interface FollowUpItem {
  person: Person;
  daysSinceContact: number;
}

/**
 * Raw data collected for brief generation
 */
export interface BriefData {
  calendarEvents: CalendarEventData[];
  emails: EmailData[];
  emailAnalysis: {
    grouped: GroupedEmails;
    summary: EmailAnalysisSummary;
    all: EmailAnalysis[];
  };
  topPriorityEmails: EmailAnalysis[];
  hasUrgentEmails: boolean;
  // Thread/conversation data (Phase 2 of Brief v2)
  threads: EmailThread[];
  threadAnalysis: {
    grouped: GroupedThreads;
    summary: ThreadAnalysisSummary;
  };
  // Knowledge graph data
  commitmentsDueToday: CommitmentWithPerson[];
  overdueCommitments: CommitmentWithPerson[];
  upcomingCommitments: CommitmentWithPerson[];
  followUpRadar: FollowUpItem[];
  // Weather data
  weather: WeatherData | null;
}

/**
 * Brief content structure for rendering
 */
export interface BriefContent {
  greeting: string;
  date: string;
  // Weather (Phase 1 of Brief v2)
  weather?: {
    temperature: number;
    temperatureCelsius: number;
    condition: string;
    feelsLike?: number;
    humidity?: number;
    windSpeed?: number;
    uvIndex?: number;
    precipitationProbability?: number;
    recommendation: string;
    locationName: string;
  };
  summary: {
    totalMeetings: number;
    totalEmails: number;
    emailsNeedingResponse: number;
    hasUrgentItems: boolean;
    overdueCommitments: number;
    commitmentsDueToday: number;
  };
  calendar: {
    events: CalendarEventData[];
    isEmpty: boolean;
    message?: string;
  };
  emails: {
    needsResponse: EmailAnalysis[];
    awaitingReply: EmailAnalysis[];
    fyi: EmailAnalysis[];
    topPriority: EmailAnalysis[];
    isEmpty: boolean;
    message?: string;
  };
  // Conversations/threads (Phase 2 of Brief v2)
  conversations: {
    needsResponse: EmailThread[];
    awaitingReply: EmailThread[];
    resolved: EmailThread[];
    summary: ThreadAnalysisSummary;
    isEmpty: boolean;
  };
  commitments: {
    dueToday: CommitmentWithPerson[];
    overdue: CommitmentWithPerson[];
    upcoming: CommitmentWithPerson[];
    isEmpty: boolean;
  };
  followUpRadar: {
    items: FollowUpItem[];
    isEmpty: boolean;
  };
  actionItems: ActionItem[];
}

/**
 * Action item for the brief
 */
export interface ActionItem {
  type: 'email' | 'meeting' | 'followup';
  priority: 'high' | 'medium' | 'low';
  description: string;
  source: string;
}

// ============================================================================
// Brief Generator Service
// ============================================================================

/**
 * Service for generating daily briefs that combine calendar and email data.
 *
 * This service:
 * - Fetches calendar events for today
 * - Fetches emails from the past 24 hours
 * - Analyzes email importance and categorizes them
 * - Generates a structured brief with actionable insights
 * - Persists the brief to the database
 */
export class BriefGeneratorService {
  private userId: string;
  private integration: GoogleIntegration | null = null;
  private options: Required<BriefGenerationOptions>;

  constructor(userId: string, options: BriefGenerationOptions = {}) {
    this.userId = userId;
    this.options = {
      timeZone: options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      topPriorityLimit: options.topPriorityLimit ?? 5,
      includeEmailDetails: options.includeEmailDetails ?? true,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  /**
   * Generates a daily brief for the user.
   *
   * This is the main entry point for brief generation. It:
   * 1. Validates the user's Google integration
   * 2. Fetches calendar and email data
   * 3. Analyzes and categorizes emails
   * 4. Generates the brief content
   * 5. Persists the brief to the database
   *
   * @returns The generation result with the brief or error details
   */
  async generateBrief(): Promise<BriefGenerationResult> {
    const briefDate = getTodayDateString();

    try {
      // Step 1: Validate Google integration
      this.integration = await findGoogleIntegrationByUserId(this.userId);

      if (!isIntegrationValid(this.integration)) {
        return this.createErrorResult(
          'INTEGRATION_NOT_CONNECTED',
          'Google account is not connected. Please connect your Google account to generate briefs.',
          false
        );
      }

      // Step 2: Create or update brief record with "generating" status
      let brief = await upsertDailyBrief(this.userId, briefDate, {
        id: crypto.randomUUID(),
        status: 'generating',
      });

      // Step 3: Fetch data with retries
      const briefData = await this.fetchBriefData();

      // Step 4: Generate brief content
      const briefContent = this.generateBriefContent(briefData, briefDate);

      // Step 5: Convert content to markdown
      const markdownContent = this.formatBriefAsMarkdown(briefContent);

      // Step 6: Persist the completed brief (including weather data)
      brief = await upsertDailyBrief(this.userId, briefDate, {
        id: brief.id, // Reuse existing ID if updating
        calendarEvents: briefData.calendarEvents,
        emails: briefData.emails,
        weather: briefData.weather
          ? {
              temperature: briefData.weather.temperature,
              temperatureCelsius: briefData.weather.temperatureCelsius,
              condition: briefData.weather.condition,
              conditionCode: briefData.weather.conditionCode,
              feelsLike: briefData.weather.feelsLike,
              humidity: briefData.weather.humidity,
              windSpeed: briefData.weather.windSpeed,
              uvIndex: briefData.weather.uvIndex,
              precipitationProbability: briefData.weather.precipitationProbability,
              recommendation: briefData.weather.recommendation,
              locationName: briefData.weather.locationName,
              fetchedAt: briefData.weather.fetchedAt.toISOString(),
            }
          : null,
        briefContent: markdownContent,
        status: 'completed',
        totalEvents: String(briefData.calendarEvents.length),
        totalEmails: String(briefData.emails.length),
        emailsNeedingResponse: String(briefData.emailAnalysis.summary.needsResponse),
        generatedAt: new Date(),
      });

      // Step 7: Update last synced timestamp
      await updateGoogleIntegrationLastSynced(this.userId);

      // Step 8: Enrich brief with AI insights (non-blocking - failures don't affect brief)
      try {
        const enrichedData = await enrichBriefData({
          briefDate,
          emails: briefData.emails,
          calendarEvents: briefData.calendarEvents,
        });

        if (enrichedData) {
          // Update brief with enriched content
          brief = await upsertDailyBrief(this.userId, briefDate, {
            id: brief.id,
            enrichedContent: enrichedData,
            enrichedAt: new Date(),
          });
          console.log(`[BriefGenerator] Brief enriched for ${briefDate}`);
        }
      } catch (enrichError) {
        // Log but don't fail - enrichment is optional
        console.warn('[BriefGenerator] Enrichment failed:', enrichError);
      }

      return {
        success: true,
        brief,
      };
    } catch (error) {
      // Handle specific error types
      if (error instanceof GoogleAuthError) {
        if (
          error.code === GoogleAuthErrorCodes.TOKEN_REFRESH_FAILED ||
          error.code === GoogleAuthErrorCodes.INVALID_CREDENTIALS
        ) {
          // Mark integration as disconnected
          await markIntegrationDisconnected(this.userId);

          // Update brief status to failed
          const failedBrief = await upsertDailyBrief(this.userId, briefDate, {
            id: crypto.randomUUID(),
            status: 'failed',
            errorMessage: error.message,
          });

          return {
            success: false,
            brief: failedBrief,
            error: {
              code: error.code,
              message: error.message,
              retryable: false,
            },
          };
        }

        // API errors might be retryable
        const failedBrief = await upsertDailyBrief(this.userId, briefDate, {
          id: crypto.randomUUID(),
          status: 'failed',
          errorMessage: error.message,
        });

        return {
          success: false,
          brief: failedBrief,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.code === GoogleAuthErrorCodes.API_ERROR,
          },
        };
      }

      // Unknown error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      const failedBrief = await upsertDailyBrief(this.userId, briefDate, {
        id: crypto.randomUUID(),
        status: 'failed',
        errorMessage,
      });

      return this.createErrorResult('GENERATION_FAILED', errorMessage, true, failedBrief);
    }
  }

  /**
   * Fetches all data needed for brief generation.
   * Implements retry logic for transient failures.
   */
  private async fetchBriefData(): Promise<BriefData> {
    if (!this.integration) {
      throw new GoogleAuthError(
        'Google integration not initialized',
        GoogleAuthErrorCodes.INTEGRATION_NOT_FOUND
      );
    }

    // Fetch calendar, email, knowledge graph, and weather data in parallel
    const [
      calendarEvents,
      emails,
      commitmentsDueToday,
      overdueCommitments,
      upcomingCommitments,
      followUpRadar,
      userProfile,
    ] = await Promise.all([
      this.fetchWithRetry(
        () => fetchEventsForDailyBrief(this.integration!, this.options.timeZone),
        'calendar'
      ),
      this.fetchWithRetry(() => fetchEmailsForDailyBrief(this.integration!), 'email'),
      // Knowledge graph data - these don't need retry logic as they're local DB queries
      findCommitmentsDueToday(this.userId).catch(() => []),
      findOverdueCommitments(this.userId).catch(() => []),
      findUpcomingCommitments(this.userId, 7).catch(() => []),
      findStaleContacts(this.userId, 30, 10).catch(() => []),
      // User profile for weather location
      getUserProfile(this.userId).catch(() => null),
    ]);

    // Fetch weather based on user's configured location
    const weather = await fetchWeatherForUser(userProfile?.location);

    // Analyze emails
    const emailAnalysis = analyzeEmailsForBrief(emails, this.integration.googleEmail);

    // Get top priority emails
    const topPriorityEmails = getTopPriorityEmails(
      emailAnalysis.all,
      this.options.topPriorityLimit
    );

    // Check for urgent emails
    const urgent = hasUrgentEmails(emailAnalysis.all);

    // Group emails by thread (Phase 2 of Brief v2)
    const threads = groupEmailsByThread(emails, this.integration.googleEmail);
    const groupedThreads = groupThreadsByState(threads);
    const threadSummary = generateThreadSummary(threads);

    return {
      calendarEvents,
      emails,
      emailAnalysis,
      topPriorityEmails,
      hasUrgentEmails: urgent,
      threads,
      threadAnalysis: {
        grouped: groupedThreads,
        summary: threadSummary,
      },
      commitmentsDueToday: commitmentsDueToday as CommitmentWithPerson[],
      overdueCommitments: overdueCommitments as CommitmentWithPerson[],
      upcomingCommitments: upcomingCommitments as CommitmentWithPerson[],
      followUpRadar: followUpRadar as FollowUpItem[],
      weather,
    };
  }

  /**
   * Fetches data with retry logic for transient failures.
   */
  private async fetchWithRetry<T>(fetchFn: () => Promise<T>, dataType: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        return await fetchFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (
          error instanceof GoogleAuthError &&
          (error.code === GoogleAuthErrorCodes.TOKEN_REFRESH_FAILED ||
            error.code === GoogleAuthErrorCodes.INVALID_CREDENTIALS ||
            error.code === GoogleAuthErrorCodes.INTEGRATION_DISCONNECTED)
        ) {
          // Non-retryable auth errors
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.options.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await this.sleep(delay);
          console.warn(
            `Retry ${attempt}/${this.options.maxRetries} for ${dataType} fetch after error: ${lastError.message}`
          );
        }
      }
    }

    throw new GoogleAuthError(
      `Failed to fetch ${dataType} data after ${this.options.maxRetries} attempts: ${lastError?.message}`,
      GoogleAuthErrorCodes.API_ERROR,
      lastError
    );
  }

  /**
   * Generates structured brief content from the raw data.
   */
  private generateBriefContent(data: BriefData, briefDate: string): BriefContent {
    const {
      calendarEvents,
      emailAnalysis,
      topPriorityEmails,
      hasUrgentEmails,
      threadAnalysis,
      commitmentsDueToday,
      overdueCommitments,
      upcomingCommitments,
      followUpRadar,
      weather,
    } = data;

    // Filter out "free" events (self-notes/reminders marked as transparent)
    const busyEvents = calendarEvents.filter((e) => e.transparency !== 'transparent');

    // Generate greeting based on time of day
    const greeting = this.getGreeting();

    // Generate action items (using filtered events)
    const actionItems = this.generateActionItems({ ...data, calendarEvents: busyEvents });

    // Build weather content if available
    const weatherContent = weather
      ? {
          temperature: weather.temperature,
          temperatureCelsius: weather.temperatureCelsius,
          condition: weather.condition,
          feelsLike: weather.feelsLike,
          humidity: weather.humidity,
          windSpeed: weather.windSpeed,
          uvIndex: weather.uvIndex,
          precipitationProbability: weather.precipitationProbability,
          recommendation: weather.recommendation,
          locationName: weather.locationName,
        }
      : undefined;

    return {
      greeting,
      date: this.formatDate(briefDate),
      weather: weatherContent,
      summary: {
        totalMeetings: busyEvents.length,
        totalEmails: emailAnalysis.summary.total,
        emailsNeedingResponse: emailAnalysis.summary.needsResponse,
        hasUrgentItems:
          hasUrgentEmails ||
          actionItems.some((a) => a.priority === 'high') ||
          overdueCommitments.length > 0,
        overdueCommitments: overdueCommitments.length,
        commitmentsDueToday: commitmentsDueToday.length,
      },
      calendar: {
        events: busyEvents,
        isEmpty: busyEvents.length === 0,
        message:
          busyEvents.length === 0
            ? 'No meetings scheduled for today. Great time for focused work!'
            : undefined,
      },
      emails: {
        needsResponse: emailAnalysis.grouped.needsResponse,
        awaitingReply: emailAnalysis.grouped.awaitingReply,
        fyi: emailAnalysis.grouped.fyi,
        topPriority: topPriorityEmails,
        isEmpty: emailAnalysis.summary.total === 0,
        message:
          emailAnalysis.summary.total === 0
            ? 'No new emails in the past 24 hours. Inbox zero!'
            : undefined,
      },
      conversations: {
        needsResponse: threadAnalysis.grouped.needsResponse,
        awaitingReply: threadAnalysis.grouped.awaitingReply,
        resolved: threadAnalysis.grouped.resolved,
        summary: threadAnalysis.summary,
        isEmpty: threadAnalysis.summary.totalThreads === 0,
      },
      commitments: {
        dueToday: commitmentsDueToday,
        overdue: overdueCommitments,
        upcoming: upcomingCommitments,
        isEmpty:
          commitmentsDueToday.length === 0 &&
          overdueCommitments.length === 0 &&
          upcomingCommitments.length === 0,
      },
      followUpRadar: {
        items: followUpRadar,
        isEmpty: followUpRadar.length === 0,
      },
      actionItems,
    };
  }

  /**
   * Generates action items from the brief data.
   */
  private generateActionItems(data: BriefData): ActionItem[] {
    const actionItems: ActionItem[] = [];

    // Add action items from overdue commitments (highest priority)
    for (const commitment of data.overdueCommitments.slice(0, 3)) {
      const personName = commitment.person?.name || commitment.person?.email || 'someone';
      actionItems.push({
        type: 'followup',
        priority: 'high',
        description: `Overdue: "${commitment.description}" to ${personName}`,
        source: `Commitment ID: ${commitment.id}`,
      });
    }

    // Add action items from commitments due today
    for (const commitment of data.commitmentsDueToday.slice(0, 3)) {
      const personName = commitment.person?.name || commitment.person?.email || 'someone';
      actionItems.push({
        type: 'followup',
        priority: commitment.priority === 'high' ? 'high' : 'medium',
        description: `Due today: "${commitment.description}" to ${personName}`,
        source: `Commitment ID: ${commitment.id}`,
      });
    }

    // Add action items from high priority emails
    for (const analysis of data.topPriorityEmails) {
      if (analysis.email.actionStatus === 'needs_response') {
        actionItems.push({
          type: 'email',
          priority: analysis.score >= 70 ? 'high' : 'medium',
          description: `Respond to "${analysis.email.subject}" from ${analysis.email.from.name || analysis.email.from.email}`,
          source: `Email ID: ${analysis.email.id}`,
        });
      }
    }

    // Add action items from upcoming meetings (next 2 hours)
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    for (const event of data.calendarEvents) {
      const eventStart = new Date(event.startTime);

      if (eventStart >= now && eventStart <= twoHoursLater && !event.isAllDay) {
        actionItems.push({
          type: 'meeting',
          priority: 'high',
          description: `Upcoming: "${event.title}" at ${this.formatTime(event.startTime)}`,
          source: event.meetingLink || event.location || 'No location specified',
        });
      }
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    actionItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return actionItems;
  }

  /**
   * Formats the brief content as markdown for display.
   */
  private formatBriefAsMarkdown(content: BriefContent): string {
    const sections: string[] = [];

    // Header
    sections.push(`# ${content.greeting}`);
    sections.push(`**${content.date}**`);
    sections.push('');

    // Weather Section (if available)
    if (content.weather) {
      sections.push('## Weather');
      sections.push('');
      const { weather } = content;
      const feelsLikePart =
        weather.feelsLike && Math.abs(weather.feelsLike - weather.temperature) >= 3
          ? ` (feels like ${weather.feelsLike}°F)`
          : '';
      sections.push(
        `**${weather.temperature}°F${feelsLikePart}** - ${weather.condition.toLowerCase()}`
      );
      sections.push(`*${weather.locationName}*`);
      sections.push('');
      // Additional weather details
      const details: string[] = [];
      if (weather.humidity !== undefined) {
        details.push(`Humidity: ${weather.humidity}%`);
      }
      if (weather.windSpeed !== undefined) {
        details.push(`Wind: ${weather.windSpeed} mph`);
      }
      if (weather.uvIndex !== undefined) {
        details.push(`UV Index: ${weather.uvIndex}`);
      }
      if (weather.precipitationProbability !== undefined && weather.precipitationProbability > 0) {
        details.push(`Precipitation: ${weather.precipitationProbability}%`);
      }
      if (details.length > 0) {
        sections.push(details.join(' | '));
        sections.push('');
      }
      // Dress recommendation
      sections.push(`**Recommendation:** ${weather.recommendation}`);
      sections.push('');
    }

    // Summary
    sections.push('## Today at a Glance');
    sections.push('');

    if (content.summary.hasUrgentItems) {
      sections.push('**Attention needed on urgent items below**');
      sections.push('');
    }

    sections.push(`- **Meetings:** ${content.summary.totalMeetings}`);
    sections.push(`- **Emails:** ${content.summary.totalEmails}`);
    sections.push(`- **Emails needing response:** ${content.summary.emailsNeedingResponse}`);
    if (content.summary.overdueCommitments > 0) {
      sections.push(`- **Overdue commitments:** ${content.summary.overdueCommitments}`);
    }
    if (content.summary.commitmentsDueToday > 0) {
      sections.push(`- **Commitments due today:** ${content.summary.commitmentsDueToday}`);
    }
    sections.push('');

    // Action Items (if any)
    if (content.actionItems.length > 0) {
      sections.push('## Action Items');
      sections.push('');

      for (const item of content.actionItems) {
        const priorityIcon =
          item.priority === 'high' ? '!!!' : item.priority === 'medium' ? '!!' : '!';
        sections.push(`- ${priorityIcon} ${item.description}`);
      }
      sections.push('');
    }

    // Calendar Section
    sections.push('## Calendar');
    sections.push('');

    if (content.calendar.isEmpty) {
      sections.push(content.calendar.message || 'No events today.');
    } else {
      for (const event of content.calendar.events) {
        const time = event.isAllDay
          ? 'All Day'
          : `${this.formatTime(event.startTime)} - ${this.formatTime(event.endTime)}`;

        sections.push(`### ${event.title}`);
        sections.push(`**Time:** ${time}`);

        if (event.location) {
          sections.push(`**Location:** ${event.location}`);
        }

        if (event.meetingLink) {
          sections.push(`**Meeting Link:** [Join Meeting](${event.meetingLink})`);
        }

        if (event.attendees && event.attendees.length > 0) {
          const attendeeList = event.attendees
            .slice(0, 5)
            .map((a) => a.name || a.email)
            .join(', ');
          const moreCount =
            event.attendees.length > 5 ? ` +${event.attendees.length - 5} more` : '';
          sections.push(`**Attendees:** ${attendeeList}${moreCount}`);
        }

        sections.push('');
      }
    }

    // Email Section
    sections.push('## Email Summary');
    sections.push('');

    if (content.emails.isEmpty) {
      sections.push(content.emails.message || 'No new emails.');
    } else {
      // Top Priority / Needs Response
      if (content.emails.needsResponse.length > 0) {
        sections.push('### Needs Response');
        sections.push('');

        for (const analysis of content.emails.needsResponse.slice(0, 5)) {
          const { email } = analysis;
          const from = email.from.name || email.from.email;
          const importance = analysis.score >= 70 ? '!!!' : '!!';
          sections.push(`- ${importance} **${email.subject}** from ${from}`);
          sections.push(
            `  > ${email.snippet.slice(0, 100)}${email.snippet.length > 100 ? '...' : ''}`
          );
        }
        sections.push('');
      }

      // Awaiting Reply
      if (content.emails.awaitingReply.length > 0) {
        sections.push('### Awaiting Reply');
        sections.push('');

        for (const analysis of content.emails.awaitingReply.slice(0, 3)) {
          const { email } = analysis;
          sections.push(`- **${email.subject}**`);
        }
        sections.push('');
      }

      // FYI (just count)
      if (content.emails.fyi.length > 0) {
        sections.push(`### FYI Emails: ${content.emails.fyi.length} emails`);
        sections.push('');
      }
    }

    // Commitments Section
    if (!content.commitments.isEmpty) {
      sections.push('## Commitments');
      sections.push('');

      // Overdue (urgent)
      if (content.commitments.overdue.length > 0) {
        sections.push('### Overdue');
        sections.push('');
        for (const commitment of content.commitments.overdue.slice(0, 5)) {
          const personName = commitment.person?.name || commitment.person?.email || 'someone';
          sections.push(`- !!! **${commitment.description}** → ${personName}`);
        }
        sections.push('');
      }

      // Due Today
      if (content.commitments.dueToday.length > 0) {
        sections.push('### Due Today');
        sections.push('');
        for (const commitment of content.commitments.dueToday.slice(0, 5)) {
          const personName = commitment.person?.name || commitment.person?.email || 'someone';
          sections.push(`- !! **${commitment.description}** → ${personName}`);
        }
        sections.push('');
      }

      // Upcoming this week
      if (content.commitments.upcoming.length > 0) {
        sections.push('### Upcoming This Week');
        sections.push('');
        for (const commitment of content.commitments.upcoming.slice(0, 3)) {
          const personName = commitment.person?.name || commitment.person?.email || 'someone';
          const dueDate = commitment.dueDate
            ? new Date(commitment.dueDate).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })
            : '';
          sections.push(`- **${commitment.description}** → ${personName} (${dueDate})`);
        }
        sections.push('');
      }
    }

    // Follow-up Radar Section
    if (!content.followUpRadar.isEmpty) {
      sections.push('## Follow-up Radar');
      sections.push('');
      sections.push("People you haven't contacted in a while:");
      sections.push('');
      for (const item of content.followUpRadar.items.slice(0, 5)) {
        const name = item.person.name || item.person.email || 'Unknown';
        const domain = item.person.domain ? ` (${item.person.domain})` : '';
        sections.push(`- **${name}**${domain} - ${item.daysSinceContact} days since contact`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Gets a greeting based on time of day.
   */
  private getGreeting(): string {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'Good Morning';
    } else if (hour < 17) {
      return 'Good Afternoon';
    } else {
      return 'Good Evening';
    }
  }

  /**
   * Formats a date string for display.
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  /**
   * Formats an ISO time string for display.
   */
  private formatTime(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  /**
   * Creates an error result object.
   */
  private createErrorResult(
    code: string,
    message: string,
    retryable: boolean,
    brief?: DailyBrief
  ): BriefGenerationResult {
    return {
      success: false,
      brief,
      error: {
        code,
        message,
        retryable,
      },
    };
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generates a daily brief for a user.
 *
 * This is the main entry point for brief generation from other services.
 *
 * @param userId The user ID to generate a brief for
 * @param options Optional configuration for brief generation
 * @returns The generation result with the brief or error details
 */
export async function generateDailyBrief(
  userId: string,
  options?: BriefGenerationOptions
): Promise<BriefGenerationResult> {
  const generator = new BriefGeneratorService(userId, options);
  return generator.generateBrief();
}

/**
 * Generates daily briefs for all users with connected Google integrations.
 *
 * This is typically called by the scheduler for batch processing.
 *
 * @param options Optional configuration for brief generation
 * @returns Array of generation results for each user
 */
export async function generateDailyBriefsForAllUsers(
  options?: BriefGenerationOptions
): Promise<{ userId: string; result: BriefGenerationResult }[]> {
  // Import here to avoid circular dependency
  const { findAllConnectedGoogleIntegrations } = await import('~/data-access/google-integration');

  const integrations = await findAllConnectedGoogleIntegrations();
  const results: { userId: string; result: BriefGenerationResult }[] = [];

  // Process users sequentially to avoid overwhelming Google APIs
  // Could be parallelized with rate limiting in the future
  for (const integration of integrations) {
    try {
      const result = await generateDailyBrief(integration.userId, options);
      results.push({ userId: integration.userId, result });
    } catch (error) {
      // Log but don't fail the entire batch
      console.error(`Failed to generate brief for user ${integration.userId}:`, error);
      results.push({
        userId: integration.userId,
        result: {
          success: false,
          error: {
            code: 'BATCH_PROCESSING_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            retryable: true,
          },
        },
      });
    }
  }

  return results;
}

/**
 * Gets the brief data without persisting to database.
 *
 * Useful for previewing or testing brief generation.
 *
 * @param userId The user ID to generate brief data for
 * @param options Optional configuration
 * @returns The raw brief data
 */
export async function getBriefDataWithoutPersisting(
  userId: string,
  options?: BriefGenerationOptions
): Promise<BriefData | null> {
  const integration = await findGoogleIntegrationByUserId(userId);

  if (!isIntegrationValid(integration)) {
    return null;
  }

  const resolvedOptions = {
    timeZone: options?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    topPriorityLimit: options?.topPriorityLimit ?? 5,
    includeEmailDetails: options?.includeEmailDetails ?? true,
    maxRetries: options?.maxRetries ?? 3,
  };

  // Fetch calendar, email, knowledge graph, and user profile data in parallel
  const [
    calendarEvents,
    emails,
    commitmentsDueToday,
    overdueCommitments,
    upcomingCommitments,
    staleContacts,
    userProfile,
  ] = await Promise.all([
    fetchEventsForDailyBrief(integration!, resolvedOptions.timeZone),
    fetchEmailsForDailyBrief(integration!),
    // Knowledge graph data
    findCommitmentsDueToday(userId).catch(() => []),
    findOverdueCommitments(userId).catch(() => []),
    findUpcomingCommitments(userId, 7).catch(() => []),
    findStaleContacts(userId, 30, 10).catch(() => []),
    // User profile for weather location
    getUserProfile(userId).catch(() => null),
  ]);

  // Fetch weather based on user's configured location
  const weather = await fetchWeatherForUser(userProfile?.location);

  // Analyze emails
  const emailAnalysis = analyzeEmailsForBrief(emails, integration!.googleEmail);

  // Get top priority emails
  const topPriorityEmails = getTopPriorityEmails(
    emailAnalysis.all,
    resolvedOptions.topPriorityLimit
  );

  // Check for urgent emails
  const urgent = hasUrgentEmails(emailAnalysis.all);

  // Group emails by thread (Phase 2 of Brief v2)
  const threads = groupEmailsByThread(emails, integration!.googleEmail);
  const groupedThreads = groupThreadsByState(threads);
  const threadSummary = generateThreadSummary(threads);

  // Transform stale contacts to follow-up radar items
  const followUpRadar: FollowUpItem[] = staleContacts.map((person) => ({
    person,
    daysSinceContact: person.lastContactAt
      ? Math.floor((Date.now() - new Date(person.lastContactAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999,
  }));

  return {
    calendarEvents,
    emails,
    emailAnalysis,
    topPriorityEmails,
    hasUrgentEmails: urgent,
    threads,
    threadAnalysis: {
      grouped: groupedThreads,
      summary: threadSummary,
    },
    commitmentsDueToday: commitmentsDueToday as CommitmentWithPerson[],
    overdueCommitments: overdueCommitments as CommitmentWithPerson[],
    upcomingCommitments: upcomingCommitments as CommitmentWithPerson[],
    followUpRadar,
    weather,
  };
}

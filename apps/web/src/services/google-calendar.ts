import { google, type calendar_v3 } from 'googleapis';
import type { Auth } from 'googleapis';
import type { CalendarEventData, GoogleIntegration } from '~/db/schema';
import {
  createAuthenticatedClient,
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
} from '~/lib/google-client';
import {
  withRetry,
  createGoogleAPIRetryChecker,
  createRetryLogger,
  GoogleAPIErrorCheckers,
  type RetryOptions,
} from '~/utils/retry';

/**
 * Configuration options for fetching calendar events
 */
export interface FetchEventsOptions {
  /** Maximum number of events to fetch (default: 100) */
  maxResults?: number;
  /** The start of the time range to fetch events (default: start of today) */
  timeMin?: Date;
  /** The end of the time range to fetch events (default: end of today) */
  timeMax?: Date;
  /** The user's timezone (default: system timezone) */
  timeZone?: string;
  /** Whether to include single events from recurring series (default: true) */
  singleEvents?: boolean;
  /** Order by start time or updated time (default: startTime) */
  orderBy?: 'startTime' | 'updated';
  /** Retry configuration (default: 3 retries with exponential backoff) */
  retryOptions?: RetryOptions;
}

/**
 * Default retry options for Google Calendar API calls
 */
const DEFAULT_CALENDAR_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  isRetryable: createGoogleAPIRetryChecker(),
  onRetry: createRetryLogger('GoogleCalendarService'),
};

/**
 * Google Calendar API service for fetching and processing calendar events.
 *
 * This service handles:
 * - Fetching calendar events for today (or a configured time range)
 * - Parsing event details including attendees and meeting links
 * - Transforming Calendar API responses to our CalendarEventData format
 * - Automatic retry with exponential backoff for transient failures
 * - Proper error handling for different failure types
 */
export class GoogleCalendarService {
  private calendar: calendar_v3.Calendar;
  private userEmail: string;
  private retryOptions: RetryOptions;

  constructor(auth: Auth.OAuth2Client, userEmail: string, retryOptions: RetryOptions = {}) {
    this.calendar = google.calendar({ version: 'v3', auth });
    this.userEmail = userEmail;
    this.retryOptions = { ...DEFAULT_CALENDAR_RETRY_OPTIONS, ...retryOptions };
  }

  /**
   * Creates a GoogleCalendarService instance from a user's Google integration.
   *
   * @param integration The user's Google integration record
   * @param retryOptions Optional retry configuration
   * @returns A configured GoogleCalendarService instance
   * @throws GoogleAuthError if the integration is invalid or token refresh fails
   */
  static async fromIntegration(
    integration: GoogleIntegration,
    retryOptions?: RetryOptions
  ): Promise<GoogleCalendarService> {
    if (!isIntegrationValid(integration)) {
      throw new GoogleAuthError(
        'Google integration is not valid or connected',
        GoogleAuthErrorCodes.INTEGRATION_DISCONNECTED
      );
    }

    const authClient = await createAuthenticatedClient(integration);
    return new GoogleCalendarService(authClient, integration.googleEmail, retryOptions);
  }

  /**
   * Fetches calendar events for today (or a configured time range).
   *
   * Implements retry logic with exponential backoff for transient failures.
   * Rate limit errors (429) and server errors (5xx) are automatically retried.
   * Authentication and permission errors are not retried.
   *
   * @param options Configuration options for fetching events
   * @returns Array of CalendarEventData objects
   * @throws GoogleAuthError for authentication or API errors
   */
  async fetchEvents(options: FetchEventsOptions = {}): Promise<CalendarEventData[]> {
    const {
      maxResults = 100,
      timeMin = this.getStartOfDay(),
      timeMax = this.getEndOfDay(),
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
      singleEvents = true,
      orderBy = 'startTime',
      retryOptions,
    } = options;

    // Merge retry options
    const effectiveRetryOptions = { ...this.retryOptions, ...retryOptions };

    try {
      const response = await withRetry(async () => {
        return this.calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          timeZone,
          singleEvents,
          orderBy,
          maxResults,
        });
      }, effectiveRetryOptions);

      const events = response.data.items || [];

      return events.map((event) => this.transformToCalendarEventData(event));
    } catch (error) {
      throw this.handleCalendarError(error);
    }
  }

  /**
   * Fetches events for today's daily brief.
   *
   * @param timeZone Optional timezone for the user
   * @param retryOptions Optional retry configuration override
   * @returns Array of CalendarEventData objects for today
   */
  async fetchTodaysEvents(
    timeZone?: string,
    retryOptions?: RetryOptions
  ): Promise<CalendarEventData[]> {
    return this.fetchEvents({
      timeMin: this.getStartOfDay(),
      timeMax: this.getEndOfDay(),
      timeZone,
      singleEvents: true,
      orderBy: 'startTime',
      retryOptions,
    });
  }

  /**
   * Gets the start of the current day (midnight).
   *
   * @returns Date object representing the start of today
   */
  private getStartOfDay(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  /**
   * Gets the end of the current day (23:59:59.999).
   *
   * @returns Date object representing the end of today
   */
  private getEndOfDay(): Date {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now;
  }

  /**
   * Transforms a Google Calendar API event to our CalendarEventData format.
   *
   * @param event The raw Google Calendar event
   * @returns Transformed CalendarEventData object
   */
  private transformToCalendarEventData(event: calendar_v3.Schema$Event): CalendarEventData {
    const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);

    // Handle all-day events (date only) vs timed events (dateTime)
    const startTime = isAllDay ? event.start?.date || '' : event.start?.dateTime || '';
    const endTime = isAllDay ? event.end?.date || '' : event.end?.dateTime || '';

    // Extract meeting link from various sources
    const meetingLink = this.extractMeetingLink(event);

    // Transform attendees list
    const attendees = this.transformAttendees(event.attendees);

    return {
      id: event.id || '',
      title: event.summary || '(No Title)',
      description: event.description || undefined,
      startTime,
      endTime,
      location: event.location || undefined,
      meetingLink,
      attendees: attendees.length > 0 ? attendees : undefined,
      isAllDay,
      // "transparent" = free, "opaque" = busy (default)
      transparency: (event.transparency as 'opaque' | 'transparent') || 'opaque',
    };
  }

  /**
   * Extracts the meeting link from an event.
   * Checks for Google Meet links, conference data, and embedded links in location.
   *
   * @param event The raw Google Calendar event
   * @returns The meeting link URL or undefined
   */
  private extractMeetingLink(event: calendar_v3.Schema$Event): string | undefined {
    // Check for Google Meet or other conference data
    if (event.conferenceData?.entryPoints) {
      const videoEntry = event.conferenceData.entryPoints.find(
        (entry) => entry.entryPointType === 'video'
      );
      if (videoEntry?.uri) {
        return videoEntry.uri;
      }
    }

    // Check for hangoutLink (older Google Meet format)
    if (event.hangoutLink) {
      return event.hangoutLink;
    }

    // Check location for common meeting URLs
    if (event.location) {
      const meetingUrlMatch = event.location.match(
        /(https?:\/\/[^\s]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com)[^\s]*)/i
      );
      if (meetingUrlMatch) {
        return meetingUrlMatch[1];
      }
    }

    // Check description for meeting URLs
    if (event.description) {
      const meetingUrlMatch = event.description.match(
        /(https?:\/\/[^\s]*(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com)[^\s<]*)/i
      );
      if (meetingUrlMatch) {
        return meetingUrlMatch[1];
      }
    }

    return undefined;
  }

  /**
   * Transforms Google Calendar attendees to our format.
   *
   * @param attendees Array of Google Calendar attendees
   * @returns Transformed attendees array
   */
  private transformAttendees(
    attendees: calendar_v3.Schema$EventAttendee[] | undefined
  ): { email: string; name?: string; responseStatus?: string }[] {
    if (!attendees) {
      return [];
    }

    return attendees
      .filter((attendee) => {
        // Filter out resource rooms and the user themselves
        if (!attendee.email) return false;
        if (attendee.resource) return false;
        if (attendee.self) return false;
        return true;
      })
      .map((attendee) => ({
        email: attendee.email!,
        name: attendee.displayName || undefined,
        responseStatus: attendee.responseStatus || undefined,
      }));
  }

  /**
   * Handles Google Calendar API errors and converts them to GoogleAuthError.
   *
   * Provides specific error handling for:
   * - Authentication errors (401): User needs to reconnect
   * - Permission errors (403): Check scopes/permissions
   * - Rate limit errors (429): Temporary, but all retries exhausted
   * - Server errors (5xx): Google service issues
   * - Not found errors (404): Calendar doesn't exist
   * - Quota exceeded: User/project quota limits
   *
   * @param error The caught error
   * @returns A GoogleAuthError with appropriate code and message
   */
  private handleCalendarError(error: unknown): GoogleAuthError {
    if (error instanceof GoogleAuthError) {
      return error;
    }

    // Check for specific Google API errors
    const apiError = error as {
      code?: number;
      message?: string;
      errors?: Array<{ reason?: string }>;
    };

    // Authentication failed (401)
    if (apiError.code === 401) {
      return new GoogleAuthError(
        'Calendar authentication failed. Please reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    // Permission denied (403) - could be various reasons
    if (apiError.code === 403) {
      // Check if it's a quota/rate limit issue vs permission issue
      if (GoogleAPIErrorCheckers.isQuotaExceededError(error)) {
        return new GoogleAuthError(
          'Calendar API quota exceeded. Please try again later.',
          GoogleAuthErrorCodes.API_ERROR,
          error
        );
      }

      return new GoogleAuthError(
        'Access to Calendar was denied. Please check your permissions and reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    // Not found (404)
    if (apiError.code === 404) {
      return new GoogleAuthError(
        'Calendar not found. Please check your calendar settings.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Rate limited (429)
    if (apiError.code === 429) {
      return new GoogleAuthError(
        'Calendar API rate limit exceeded. Please try again in a few minutes.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Server errors (5xx)
    if (apiError.code && apiError.code >= 500 && apiError.code < 600) {
      return new GoogleAuthError(
        `Calendar service temporarily unavailable (${apiError.code}). Please try again later.`,
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Network errors
    if (GoogleAPIErrorCheckers.isNetworkError(error)) {
      return new GoogleAuthError(
        'Network error while connecting to Calendar. Please check your connection and try again.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    // Generic API error
    return new GoogleAuthError(
      `Calendar API error: ${apiError.message || 'Unknown error'}`,
      GoogleAuthErrorCodes.API_ERROR,
      error
    );
  }
}

/**
 * Convenience function to fetch calendar events for a user.
 *
 * Includes automatic retry with exponential backoff for transient failures.
 *
 * @param integration The user's Google integration
 * @param options Optional fetch configuration (including retry options)
 * @returns Array of CalendarEventData objects
 * @throws GoogleAuthError for authentication or API errors
 */
export async function fetchUserCalendarEvents(
  integration: GoogleIntegration,
  options?: FetchEventsOptions
): Promise<CalendarEventData[]> {
  const calendarService = await GoogleCalendarService.fromIntegration(
    integration,
    options?.retryOptions
  );
  return calendarService.fetchEvents(options);
}

/**
 * Fetches today's calendar events for a user's daily brief.
 *
 * Includes automatic retry with exponential backoff for transient failures.
 * Default configuration:
 * - All events for today
 * - Single events from recurring series
 * - Ordered by start time
 * - Up to 3 retries with exponential backoff
 *
 * @param integration The user's Google integration
 * @param timeZone Optional timezone for the user
 * @param retryOptions Optional retry configuration override
 * @returns Array of CalendarEventData objects for today
 * @throws GoogleAuthError for authentication or API errors
 */
export async function fetchEventsForDailyBrief(
  integration: GoogleIntegration,
  timeZone?: string,
  retryOptions?: RetryOptions
): Promise<CalendarEventData[]> {
  const calendarService = await GoogleCalendarService.fromIntegration(integration, retryOptions);
  return calendarService.fetchTodaysEvents(timeZone, retryOptions);
}

// Re-export retry utilities for consumers who want to customize retry behavior
export { type RetryOptions } from '~/utils/retry';

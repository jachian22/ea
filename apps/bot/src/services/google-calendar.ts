/**
 * Google Calendar API service for fetching and processing calendar events.
 */

import { google, type calendar_v3 } from 'googleapis';
import type { Auth } from 'googleapis';
import type { CalendarEventData, GoogleIntegration } from '../db/schema.js';
import {
  createAuthenticatedClient,
  GoogleAuthError,
  GoogleAuthErrorCodes,
  isIntegrationValid,
} from './google-client.js';
import {
  withRetry,
  createGoogleAPIRetryChecker,
  createRetryLogger,
  GoogleAPIErrorCheckers,
  type RetryOptions,
} from '../utils/retry.js';

/**
 * Configuration options for fetching calendar events
 */
export interface FetchEventsOptions {
  maxResults?: number;
  timeMin?: Date;
  timeMax?: Date;
  timeZone?: string;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
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

  private getStartOfDay(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private getEndOfDay(): Date {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    return now;
  }

  private transformToCalendarEventData(event: calendar_v3.Schema$Event): CalendarEventData {
    const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);

    const startTime = isAllDay ? event.start?.date || '' : event.start?.dateTime || '';
    const endTime = isAllDay ? event.end?.date || '' : event.end?.dateTime || '';

    const meetingLink = this.extractMeetingLink(event);
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
      transparency: (event.transparency as 'opaque' | 'transparent') || 'opaque',
    };
  }

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

    // Check for hangoutLink
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

  private transformAttendees(
    attendees: calendar_v3.Schema$EventAttendee[] | undefined
  ): { email: string; name?: string; responseStatus?: string }[] {
    if (!attendees) {
      return [];
    }

    return attendees
      .filter((attendee) => {
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

  private handleCalendarError(error: unknown): GoogleAuthError {
    if (error instanceof GoogleAuthError) {
      return error;
    }

    const apiError = error as { code?: number; message?: string };

    if (apiError.code === 401) {
      return new GoogleAuthError(
        'Calendar authentication failed. Please reconnect your Google account.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    if (apiError.code === 403) {
      if (GoogleAPIErrorCheckers.isQuotaExceededError(error)) {
        return new GoogleAuthError(
          'Calendar API quota exceeded. Please try again later.',
          GoogleAuthErrorCodes.API_ERROR,
          error
        );
      }
      return new GoogleAuthError(
        'Access to Calendar was denied. Please check your permissions.',
        GoogleAuthErrorCodes.INVALID_CREDENTIALS,
        error
      );
    }

    if (apiError.code === 404) {
      return new GoogleAuthError(
        'Calendar not found. Please check your calendar settings.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    if (apiError.code === 429) {
      return new GoogleAuthError(
        'Calendar API rate limit exceeded. Please try again in a few minutes.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    if (apiError.code && apiError.code >= 500 && apiError.code < 600) {
      return new GoogleAuthError(
        `Calendar service temporarily unavailable (${apiError.code}).`,
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    if (GoogleAPIErrorCheckers.isNetworkError(error)) {
      return new GoogleAuthError(
        'Network error while connecting to Calendar.',
        GoogleAuthErrorCodes.API_ERROR,
        error
      );
    }

    return new GoogleAuthError(
      `Calendar API error: ${apiError.message || 'Unknown error'}`,
      GoogleAuthErrorCodes.API_ERROR,
      error
    );
  }
}

/**
 * Convenience function to fetch calendar events for a user.
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
 */
export async function fetchEventsForDailyBrief(
  integration: GoogleIntegration,
  timeZone?: string,
  retryOptions?: RetryOptions
): Promise<CalendarEventData[]> {
  const calendarService = await GoogleCalendarService.fromIntegration(integration, retryOptions);
  return calendarService.fetchTodaysEvents(timeZone, retryOptions);
}

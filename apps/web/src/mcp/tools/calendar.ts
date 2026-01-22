/**
 * Calendar Tools
 *
 * Tools for managing calendar events, getting meeting briefings, and finding free time.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findGoogleIntegrationByUserId } from '~/data-access/google-integration';
import { GoogleCalendarService } from '~/services/google-calendar';
import {
  findMeetingBriefingByEventId,
  findUpcomingMeetingBriefings,
} from '~/data-access/meeting-briefings';
import type { CalendarEventData, MeetingBriefing } from '~/db/schema';

/**
 * Register calendar tools with the MCP server
 */
export function registerCalendarTools(server: McpServer, userId: string) {
  // ea_get_calendar - Get calendar events for a date range
  server.tool(
    'ea_get_calendar',
    'Get calendar events for a date range. Returns events with attendee context and meeting links.',
    {
      startDate: z.string().optional().describe('Start date (ISO format). Defaults to today.'),
      endDate: z
        .string()
        .optional()
        .describe('End date (ISO format). Defaults to end of start date.'),
      maxResults: z.number().optional().default(100).describe('Maximum number of events to return'),
    },
    async ({ startDate, endDate, maxResults }) => {
      try {
        // Get Google integration
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Google Calendar not connected. Please connect your Google account.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Parse dates
        const start = startDate ? new Date(startDate) : getStartOfDay();
        const end = endDate ? new Date(endDate) : getEndOfDay(start);

        // Create calendar service and fetch events
        const calendarService = await GoogleCalendarService.fromIntegration(integration);
        const events = await calendarService.fetchEvents({
          timeMin: start,
          timeMax: end,
          maxResults,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  dateRange: {
                    start: start.toISOString(),
                    end: end.toISOString(),
                  },
                  count: events.length,
                  events: events.map(formatCalendarEvent),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_get_today_schedule - Get today's schedule
  server.tool(
    'ea_get_today_schedule',
    "Get today's calendar schedule with all events and meeting details.",
    {},
    async () => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Google Calendar not connected. Please connect your Google account.',
                }),
              },
            ],
            isError: true,
          };
        }

        const calendarService = await GoogleCalendarService.fromIntegration(integration);
        const events = await calendarService.fetchTodaysEvents();

        // Calculate summary stats
        const totalEvents = events.length;
        const meetingsWithLinks = events.filter((e) => e.meetingLink).length;
        const allDayEvents = events.filter((e) => e.isAllDay).length;

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  date: new Date().toISOString().split('T')[0],
                  summary: {
                    totalEvents,
                    meetingsWithLinks,
                    allDayEvents,
                    timedEvents: totalEvents - allDayEvents,
                  },
                  events: events.map(formatCalendarEvent),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_get_meeting_briefing - Get pre-generated meeting briefing
  server.tool(
    'ea_get_meeting_briefing',
    'Get a pre-generated briefing for an upcoming meeting, including attendee context, past interactions, and preparation suggestions.',
    {
      eventId: z.string().describe('The calendar event ID to get a briefing for'),
    },
    async ({ eventId }) => {
      try {
        const briefing = await findMeetingBriefingByEventId(userId, eventId);

        if (!briefing) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'No briefing found for this meeting. It may not have been generated yet.',
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  briefing: formatMeetingBriefing(briefing),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_get_upcoming_briefings - Get all upcoming meeting briefings
  server.tool(
    'ea_get_upcoming_briefings',
    'Get all upcoming meeting briefings for the next few days.',
    {
      hoursAhead: z.number().optional().default(24).describe('Hours ahead to look for meetings'),
      limit: z.number().optional().default(10).describe('Maximum briefings to return'),
    },
    async ({ hoursAhead, limit }) => {
      try {
        const allBriefings = await findUpcomingMeetingBriefings(userId, hoursAhead);
        const briefings = allBriefings.slice(0, limit);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  count: briefings.length,
                  briefings: briefings.map((b) => ({
                    eventId: b.calendarEventId,
                    title: b.meetingTitle,
                    startTime: b.meetingStartTime?.toISOString(),
                    status: b.status,
                    hasContent: Boolean(b.briefingContent),
                    attendeeCount: b.attendees?.length || 0,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ea_find_free_time - Find available time slots
  server.tool(
    'ea_find_free_time',
    'Find free time slots in the calendar based on constraints.',
    {
      duration: z.number().describe('Required duration in minutes'),
      startDate: z
        .string()
        .optional()
        .describe('Start of search range (ISO format). Defaults to now.'),
      endDate: z
        .string()
        .optional()
        .describe('End of search range (ISO format). Defaults to 7 days from start.'),
      workingHoursOnly: z.boolean().optional().default(true).describe('Only search during 9am-6pm'),
      excludeWeekends: z.boolean().optional().default(true).describe('Exclude Saturday and Sunday'),
    },
    async ({ duration, startDate, endDate, workingHoursOnly, excludeWeekends }) => {
      try {
        const integration = await findGoogleIntegrationByUserId(userId);
        if (!integration || !integration.isConnected) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  success: false,
                  error: 'Google Calendar not connected. Please connect your Google account.',
                }),
              },
            ],
            isError: true,
          };
        }

        // Parse dates
        const start = startDate ? new Date(startDate) : new Date();
        const end = endDate
          ? new Date(endDate)
          : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

        // Fetch events in the range
        const calendarService = await GoogleCalendarService.fromIntegration(integration);
        const events = await calendarService.fetchEvents({
          timeMin: start,
          timeMax: end,
          maxResults: 250,
        });

        // Find free slots
        const freeSlots = findFreeSlots(
          events,
          start,
          end,
          duration,
          workingHoursOnly,
          excludeWeekends
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  searchRange: {
                    start: start.toISOString(),
                    end: end.toISOString(),
                  },
                  duration: `${duration} minutes`,
                  constraints: {
                    workingHoursOnly,
                    excludeWeekends,
                  },
                  slotsFound: freeSlots.length,
                  freeSlots: freeSlots.slice(0, 20).map((slot) => ({
                    start: slot.start.toISOString(),
                    end: slot.end.toISOString(),
                    date: slot.start.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    }),
                    time: `${formatTime(slot.start)} - ${formatTime(slot.end)}`,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Helper functions

function getStartOfDay(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatCalendarEvent(event: CalendarEventData) {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    meetingLink: event.meetingLink,
    isAllDay: event.isAllDay,
    attendees: event.attendees?.map((a) => ({
      email: a.email,
      name: a.name,
      status: a.responseStatus,
    })),
    attendeeCount: event.attendees?.length || 0,
  };
}

function formatMeetingBriefing(briefing: MeetingBriefing) {
  return {
    eventId: briefing.calendarEventId,
    title: briefing.meetingTitle,
    startTime: briefing.meetingStartTime?.toISOString(),
    endTime: briefing.meetingEndTime?.toISOString(),
    location: briefing.meetingLocation,
    meetingLink: briefing.meetingLink,
    status: briefing.status,

    // Attendee info with context
    attendees: briefing.attendees?.map((a) => ({
      email: a.email,
      name: a.name,
      personId: a.personId,
      role: a.role,
      company: a.company,
      domain: a.domain,
      lastContactAt: a.lastContactAt,
      personalNotes: a.personalNotes,
      commitmentsYouOwe: a.openCommitmentsYouOwe,
      commitmentsTheyOwe: a.openCommitmentsTheyOwe,
      recentInteractions: a.recentInteractions,
    })),

    // Historical context
    previousMeetings: briefing.previousMeetings,
    relatedEmailThreads: briefing.relatedEmailThreads,
    upcomingCommitments: briefing.upcomingCommitments,

    // Prep suggestions
    suggestedPrep: briefing.suggestedPrep,

    // Generated content
    briefingContent: briefing.briefingContent,
    generatedAt: briefing.generatedAt?.toISOString(),
  };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

interface TimeSlot {
  start: Date;
  end: Date;
}

function findFreeSlots(
  events: CalendarEventData[],
  rangeStart: Date,
  rangeEnd: Date,
  durationMinutes: number,
  workingHoursOnly: boolean,
  excludeWeekends: boolean
): TimeSlot[] {
  const freeSlots: TimeSlot[] = [];
  const durationMs = durationMinutes * 60 * 1000;

  // Sort events by start time
  const sortedEvents = [...events]
    .filter((e) => !e.isAllDay)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  // Create busy periods from events
  const busyPeriods = sortedEvents.map((e) => ({
    start: new Date(e.startTime),
    end: new Date(e.endTime),
  }));

  // Iterate through each day in the range
  const current = new Date(rangeStart);
  while (current < rangeEnd) {
    // Skip weekends if requested
    if (excludeWeekends && (current.getDay() === 0 || current.getDay() === 6)) {
      current.setDate(current.getDate() + 1);
      current.setHours(0, 0, 0, 0);
      continue;
    }

    // Determine working hours for this day
    const dayStart = new Date(current);
    const dayEnd = new Date(current);
    if (workingHoursOnly) {
      dayStart.setHours(9, 0, 0, 0);
      dayEnd.setHours(18, 0, 0, 0);
    } else {
      dayStart.setHours(0, 0, 0, 0);
      dayEnd.setHours(23, 59, 59, 999);
    }

    // Adjust for range boundaries
    const effectiveStart = new Date(Math.max(dayStart.getTime(), rangeStart.getTime()));
    const effectiveEnd = new Date(Math.min(dayEnd.getTime(), rangeEnd.getTime()));

    // Find busy periods for this day
    const dayBusy = busyPeriods.filter((b) => b.start < effectiveEnd && b.end > effectiveStart);

    // Find free slots
    let slotStart = effectiveStart;
    for (const busy of dayBusy) {
      if (busy.start > slotStart) {
        const slotEnd = busy.start;
        if (slotEnd.getTime() - slotStart.getTime() >= durationMs) {
          freeSlots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }
      }
      slotStart = new Date(Math.max(slotStart.getTime(), busy.end.getTime()));
    }

    // Check for free time after last event
    if (slotStart < effectiveEnd) {
      if (effectiveEnd.getTime() - slotStart.getTime() >= durationMs) {
        freeSlots.push({ start: new Date(slotStart), end: new Date(effectiveEnd) });
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return freeSlots;
}

/**
 * Briefing Tools
 *
 * Tools for accessing daily briefs and weekly summaries.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  findLatestDailyBrief,
  findDailyBriefByUserAndDate,
  findDailyBriefsByUserId,
  getTodayDateString,
} from '~/data-access/daily-briefs';
import {
  findOverdueCommitments,
  findCommitmentsDueToday,
  findUpcomingCommitments,
} from '~/data-access/commitments';
import { findGoogleIntegrationByUserId } from '~/data-access/google-integration';
import { GoogleCalendarService } from '~/services/google-calendar';
import { GmailService } from '~/services/gmail';
import type { DailyBrief, EmailData, CalendarEventData } from '~/db/schema';

/**
 * Register briefing tools with the MCP server
 */
export function registerBriefingTools(server: McpServer, userId: string) {
  // ea_get_daily_brief - Get today's comprehensive brief
  server.tool(
    'ea_get_daily_brief',
    "Get today's comprehensive daily brief including calendar, emails, and commitments.",
    {
      date: z
        .string()
        .optional()
        .describe('Date to get brief for (ISO format). Defaults to today.'),
    },
    async ({ date }) => {
      try {
        const briefDate = date || getTodayDateString();

        // Check for pre-generated brief
        let brief = await findDailyBriefByUserAndDate(userId, briefDate);

        // If no brief or not completed, generate a quick summary
        if (!brief || brief.status !== 'completed') {
          // Get live data
          const integration = await findGoogleIntegrationByUserId(userId);

          let events: CalendarEventData[] = [];
          let emails: EmailData[] = [];

          if (integration && integration.isConnected) {
            try {
              const calendarService = await GoogleCalendarService.fromIntegration(integration);
              events = await calendarService.fetchTodaysEvents();
            } catch (e) {
              console.error('Failed to fetch calendar:', e);
            }

            try {
              const gmailService = await GmailService.fromIntegration(integration);
              emails = await gmailService.fetchRecentEmails({
                maxResults: 50,
                hoursBack: 24,
              });
            } catch (e) {
              console.error('Failed to fetch emails:', e);
            }
          }

          // Get commitments
          const overdue = await findOverdueCommitments(userId);
          const dueToday = await findCommitmentsDueToday(userId);
          const upcoming = await findUpcomingCommitments(userId, 7);

          // Calculate email stats
          const needsResponse = emails.filter((e) => e.actionStatus === 'needs_response');
          const highPriority = emails.filter((e) => e.importance === 'high' && !e.isRead);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    date: briefDate,
                    source: 'live',
                    brief: {
                      // Calendar summary
                      calendar: {
                        eventCount: events.length,
                        events: events.slice(0, 10).map((e) => ({
                          title: e.title,
                          startTime: e.startTime,
                          endTime: e.endTime,
                          location: e.location,
                          meetingLink: e.meetingLink,
                          attendeeCount: e.attendees?.length || 0,
                          isAllDay: e.isAllDay,
                        })),
                      },

                      // Email summary
                      email: {
                        total: emails.length,
                        needsResponse: needsResponse.length,
                        highPriority: highPriority.length,
                        priorityEmails: needsResponse.slice(0, 5).map((e) => ({
                          subject: e.subject,
                          from: e.from,
                          importance: e.importance,
                          receivedAt: e.receivedAt,
                        })),
                      },

                      // Commitments summary
                      commitments: {
                        overdue: overdue.length,
                        dueToday: dueToday.length,
                        upcomingWeek: upcoming.length,
                        overdueItems: overdue.slice(0, 5).map((c) => ({
                          description: c.description,
                          direction: c.direction,
                          dueDate: c.dueDate?.toISOString(),
                        })),
                        todayItems: dueToday.map((c) => ({
                          description: c.description,
                          direction: c.direction,
                        })),
                      },
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Return pre-generated brief
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  date: briefDate,
                  source: 'generated',
                  generatedAt: brief.generatedAt?.toISOString(),
                  brief: {
                    content: brief.briefContent,
                    calendar: {
                      eventCount: parseInt(brief.totalEvents || '0'),
                      events: brief.calendarEvents?.slice(0, 10),
                    },
                    email: {
                      total: parseInt(brief.totalEmails || '0'),
                      needsResponse: parseInt(brief.emailsNeedingResponse || '0'),
                      emails: brief.emails?.slice(0, 10),
                    },
                  },
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

  // ea_get_weekly_summary - Get weekly overview
  server.tool(
    'ea_get_weekly_summary',
    'Get a summary of the week across all domains - calendar, emails, and commitments.',
    {
      startDate: z
        .string()
        .optional()
        .describe('Start of week (ISO format). Defaults to start of current week.'),
    },
    async ({ startDate }) => {
      try {
        // Calculate week boundaries
        const now = new Date();
        const start = startDate ? new Date(startDate) : getStartOfWeek(now);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);

        // Get calendar events for the week
        const integration = await findGoogleIntegrationByUserId(userId);

        let events: CalendarEventData[] = [];
        if (integration && integration.isConnected) {
          try {
            const calendarService = await GoogleCalendarService.fromIntegration(integration);
            events = await calendarService.fetchEvents({
              timeMin: start,
              timeMax: end,
              maxResults: 200,
            });
          } catch (e) {
            console.error('Failed to fetch calendar:', e);
          }
        }

        // Get commitment stats
        const overdue = await findOverdueCommitments(userId);
        const upcoming = await findUpcomingCommitments(userId, 7);

        // Get daily briefs for the week
        const briefs = await findDailyBriefsByUserId(userId, 7);
        const weekBriefs = briefs.filter((b) => {
          const briefDate = new Date(b.briefDate);
          return briefDate >= start && briefDate < end;
        });

        // Calculate event stats by day
        const eventsByDay: Record<string, number> = {};
        for (const event of events) {
          const day = new Date(event.startTime).toISOString().split('T')[0];
          eventsByDay[day] = (eventsByDay[day] || 0) + 1;
        }

        // Calculate meeting hours
        let totalMeetingMinutes = 0;
        for (const event of events) {
          if (!event.isAllDay) {
            const start = new Date(event.startTime);
            const end = new Date(event.endTime);
            totalMeetingMinutes += (end.getTime() - start.getTime()) / (1000 * 60);
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  week: {
                    start: start.toISOString().split('T')[0],
                    end: end.toISOString().split('T')[0],
                  },
                  summary: {
                    calendar: {
                      totalEvents: events.length,
                      meetingHours: Math.round((totalMeetingMinutes / 60) * 10) / 10,
                      eventsByDay,
                      upcomingEvents: events.slice(0, 10).map((e) => ({
                        title: e.title,
                        startTime: e.startTime,
                        attendeeCount: e.attendees?.length || 0,
                      })),
                    },
                    commitments: {
                      overdue: overdue.length,
                      upcomingWeek: upcoming.length,
                    },
                    briefs: {
                      generated: weekBriefs.length,
                      completed: weekBriefs.filter((b) => b.status === 'completed').length,
                    },
                  },
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

  // ea_get_domain_status - Get domain-specific summary
  server.tool(
    'ea_get_domain_status',
    'Get a summary for a specific domain (family, business, or job).',
    {
      domain: z.enum(['family', 'business', 'job']).describe('The domain to get status for'),
    },
    async ({ domain }) => {
      try {
        const { findPersonsByDomain } = await import('~/data-access/persons');
        const { findCommitmentsWithPerson } = await import('~/data-access/commitments');
        const { findInteractionsWithPerson } = await import('~/data-access/interactions');

        // Get people in this domain
        const people = await findPersonsByDomain(userId, domain, 50);
        const domainPersonIds = new Set(people.map((p) => p.id));

        // Get commitments with these people
        const commitments = await findCommitmentsWithPerson(userId, {
          status: ['pending', 'in_progress'],
          limit: 100,
        });
        const domainCommitments = commitments.filter(
          (c) => c.personId && domainPersonIds.has(c.personId)
        );

        // Get recent interactions
        const interactions = await findInteractionsWithPerson(userId, 100);
        const domainInteractions = interactions
          .filter((i) => i.personId && domainPersonIds.has(i.personId))
          .slice(0, 20);

        // Calculate stats
        const overdueCommitments = domainCommitments.filter(
          (c) => c.dueDate && c.dueDate < new Date()
        );

        // Find people not contacted recently
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const staleContacts = people.filter(
          (p) => !p.lastContactAt || p.lastContactAt < thirtyDaysAgo
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  domain,
                  summary: {
                    people: {
                      total: people.length,
                      staleContacts: staleContacts.length,
                      topContacts: people.slice(0, 5).map((p) => ({
                        name: p.name,
                        email: p.email,
                        company: p.company,
                        lastContactAt: p.lastContactAt?.toISOString(),
                        importanceScore: p.importanceScore,
                      })),
                    },
                    commitments: {
                      total: domainCommitments.length,
                      overdue: overdueCommitments.length,
                      youOwe: domainCommitments.filter((c) => c.direction === 'user_owes').length,
                      theyOwe: domainCommitments.filter((c) => c.direction === 'they_owe').length,
                      items: domainCommitments.slice(0, 5).map((c) => ({
                        description: c.description,
                        direction: c.direction,
                        personName: c.person?.name,
                        dueDate: c.dueDate?.toISOString(),
                      })),
                    },
                    recentInteractions: domainInteractions.slice(0, 5).map((i) => ({
                      type: i.type,
                      subject: i.subject,
                      personName: i.person?.name,
                      date: i.occurredAt?.toISOString(),
                    })),
                  },
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

  // ea_get_brief_history - Get historical briefs
  server.tool(
    'ea_get_brief_history',
    'Get a list of past daily briefs.',
    {
      limit: z.number().optional().default(14).describe('Number of briefs to return'),
    },
    async ({ limit }) => {
      try {
        const briefs = await findDailyBriefsByUserId(userId, limit);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  count: briefs.length,
                  briefs: briefs.map((b) => ({
                    date: b.briefDate,
                    status: b.status,
                    generatedAt: b.generatedAt?.toISOString(),
                    stats: {
                      events: b.totalEvents,
                      emails: b.totalEmails,
                      needsResponse: b.emailsNeedingResponse,
                    },
                    hasContent: Boolean(b.briefContent),
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

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

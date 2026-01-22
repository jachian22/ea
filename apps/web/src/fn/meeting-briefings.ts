import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import {
  findMeetingBriefingById,
  findMeetingBriefingsByUserId,
  findUpcomingMeetingBriefings,
  findTodaysMeetingBriefings,
  getBriefingStatusSummary,
} from '~/data-access/meeting-briefings';
import {
  generateMeetingBriefing,
  generateUpcomingMeetingBriefings,
} from '~/services/meeting-briefing-service';
import { fetchEventsForDailyBrief } from '~/services/google-calendar';
import { findGoogleIntegrationByUserId } from '~/data-access/google-integration';
import { isIntegrationValid } from '~/lib/google-client';

// ============================================================================
// Get Meeting Briefings
// ============================================================================

export const getMeetingBriefingsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        filter: z.enum(['all', 'upcoming', 'today']).optional().default('upcoming'),
        hoursAhead: z.number().min(1).max(168).optional().default(24),
        limit: z.number().min(1).max(100).optional().default(50),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const filter = data?.filter || 'upcoming';
    const hoursAhead = data?.hoursAhead || 24;
    const limit = data?.limit || 50;

    try {
      let briefings;

      switch (filter) {
        case 'all':
          briefings = await findMeetingBriefingsByUserId(userId, limit);
          break;
        case 'upcoming':
          briefings = await findUpcomingMeetingBriefings(userId, hoursAhead);
          break;
        case 'today':
          briefings = await findTodaysMeetingBriefings(userId);
          break;
        default:
          briefings = await findUpcomingMeetingBriefings(userId, hoursAhead);
      }

      return {
        success: true,
        data: briefings,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get meeting briefings:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get meeting briefings',
      };
    }
  });

// ============================================================================
// Get Meeting Briefing by ID
// ============================================================================

export const getMeetingBriefingByIdFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const briefing = await findMeetingBriefingById(data.id);

      if (!briefing || briefing.userId !== userId) {
        return {
          success: false,
          data: null,
          error: 'Meeting briefing not found',
        };
      }

      return {
        success: true,
        data: briefing,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get meeting briefing:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get meeting briefing',
      };
    }
  });

// ============================================================================
// Generate Meeting Briefings
// ============================================================================

export const generateMeetingBriefingsFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z
      .object({
        hoursAhead: z.number().min(1).max(168).optional().default(24),
        timeZone: z.string().optional(),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const hoursAhead = data?.hoursAhead || 24;

    try {
      // Check if user has a connected Google integration
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          data: null,
          error:
            'Google account is not connected. Please connect your Google account to generate meeting briefings.',
        };
      }

      // Generate briefings for upcoming meetings
      const results = await generateUpcomingMeetingBriefings(userId, hoursAhead, {
        timeZone: data?.timeZone,
      });

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      return {
        success: true,
        data: {
          generated: successful.length,
          failed: failed.length,
          briefings: successful.map((r) => r.briefing),
          errors: failed.map((r) => r.error),
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to generate meeting briefings:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to generate meeting briefings',
      };
    }
  });

// ============================================================================
// Get Briefing Status Summary
// ============================================================================

export const getBriefingStatusSummaryFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        hoursAhead: z.number().min(1).max(168).optional().default(24),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const hoursAhead = data?.hoursAhead || 24;

    try {
      const summary = await getBriefingStatusSummary(userId, hoursAhead);

      return {
        success: true,
        data: summary,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get briefing status summary:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get briefing status summary',
      };
    }
  });

// ============================================================================
// Get Upcoming Meetings (Calendar Events)
// ============================================================================

export const getUpcomingMeetingsFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        timeZone: z.string().optional(),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const timeZone = data?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      // Check if user has a connected Google integration
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          data: null,
          error: 'Google account is not connected.',
        };
      }

      // Fetch calendar events
      const events = await fetchEventsForDailyBrief(integration!, timeZone);

      // Filter to non-all-day events
      const meetings = events.filter((event) => !event.isAllDay);

      return {
        success: true,
        data: meetings,
        error: null,
      };
    } catch (error) {
      console.error('Failed to get upcoming meetings:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get upcoming meetings',
      };
    }
  });

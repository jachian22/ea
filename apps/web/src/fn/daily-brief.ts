import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { authenticatedMiddleware } from './middleware';
import { generateDailyBrief, type BriefGenerationOptions } from '~/services/brief-generator';
import {
  findLatestDailyBrief,
  findDailyBriefsByUserId,
  findDailyBriefByUserAndDate,
  getTodayDateString,
} from '~/data-access/daily-briefs';
import { findGoogleIntegrationByUserId } from '~/data-access/google-integration';
import { isIntegrationValid } from '~/lib/google-client';

/**
 * Manually triggers brief generation for the authenticated user.
 *
 * This function:
 * 1. Validates that the user has a connected Google integration
 * 2. Generates a new daily brief using the brief generator service
 * 3. Returns the generated brief or error details
 *
 * Use this for manual "refresh" functionality or when the user
 * wants to regenerate their brief on-demand.
 *
 * @param timeZone Optional timezone override (defaults to server timezone)
 * @returns The generation result with the brief or error details
 */
export const generateBriefFn = createServerFn({ method: 'POST' })
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

    try {
      // Check if user has a connected Google integration
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          data: null,
          error:
            'Google account is not connected. Please connect your Google account to generate briefs.',
        };
      }

      // Build generation options
      const options: BriefGenerationOptions = {};
      if (data?.timeZone) {
        options.timeZone = data.timeZone;
      }

      // Generate the brief
      const result = await generateDailyBrief(userId, options);

      if (!result.success) {
        return {
          success: false,
          data: result.brief
            ? {
                briefId: result.brief.id,
                status: result.brief.status,
                errorMessage: result.brief.errorMessage,
              }
            : null,
          error: result.error?.message || 'Failed to generate brief',
        };
      }

      return {
        success: true,
        data: {
          briefId: result.brief!.id,
          briefDate: result.brief!.briefDate,
          status: result.brief!.status,
          totalEvents: result.brief!.totalEvents,
          totalEmails: result.brief!.totalEmails,
          emailsNeedingResponse: result.brief!.emailsNeedingResponse,
          generatedAt: result.brief!.generatedAt,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to generate brief:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to generate brief',
      };
    }
  });

/**
 * Gets the latest daily brief for the authenticated user.
 *
 * Returns the most recent brief regardless of date, useful for
 * displaying the current brief on the dashboard.
 *
 * @returns The latest brief or null if none exists
 */
export const getLatestBriefFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const brief = await findLatestDailyBrief(userId);

      if (!brief) {
        return {
          success: true,
          data: null,
          error: null,
        };
      }

      return {
        success: true,
        data: {
          id: brief.id,
          briefDate: brief.briefDate,
          status: brief.status,
          briefContent: brief.briefContent,
          calendarEvents: brief.calendarEvents,
          emails: brief.emails,
          weather: brief.weather,
          enrichedContent: brief.enrichedContent,
          enrichedAt: brief.enrichedAt,
          totalEvents: brief.totalEvents,
          totalEmails: brief.totalEmails,
          emailsNeedingResponse: brief.emailsNeedingResponse,
          generatedAt: brief.generatedAt,
          errorMessage: brief.errorMessage,
          createdAt: brief.createdAt,
          updatedAt: brief.updatedAt,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get latest brief:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get latest brief',
      };
    }
  });

/**
 * Gets today's daily brief for the authenticated user.
 *
 * Returns the brief specifically for today's date, useful for
 * checking if today's brief has been generated.
 *
 * @returns Today's brief or null if not generated yet
 */
export const getTodaysBriefFn = createServerFn({ method: 'GET' })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const today = getTodayDateString();
      const brief = await findDailyBriefByUserAndDate(userId, today);

      if (!brief) {
        return {
          success: true,
          data: null,
          error: null,
        };
      }

      return {
        success: true,
        data: {
          id: brief.id,
          briefDate: brief.briefDate,
          status: brief.status,
          briefContent: brief.briefContent,
          calendarEvents: brief.calendarEvents,
          emails: brief.emails,
          weather: brief.weather,
          enrichedContent: brief.enrichedContent,
          enrichedAt: brief.enrichedAt,
          totalEvents: brief.totalEvents,
          totalEmails: brief.totalEmails,
          emailsNeedingResponse: brief.emailsNeedingResponse,
          generatedAt: brief.generatedAt,
          errorMessage: brief.errorMessage,
          createdAt: brief.createdAt,
          updatedAt: brief.updatedAt,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to get today's brief:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get today's brief",
      };
    }
  });

/**
 * Gets the brief history for the authenticated user.
 *
 * Returns a paginated list of past briefs, useful for
 * viewing historical briefs.
 *
 * @param limit Maximum number of briefs to return (default: 30)
 * @returns Array of past briefs (most recent first)
 */
export const getBriefHistoryFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(30),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 30;

    try {
      const briefs = await findDailyBriefsByUserId(userId, limit);

      return {
        success: true,
        data: briefs.map((brief) => ({
          id: brief.id,
          briefDate: brief.briefDate,
          status: brief.status,
          totalEvents: brief.totalEvents,
          totalEmails: brief.totalEmails,
          emailsNeedingResponse: brief.emailsNeedingResponse,
          generatedAt: brief.generatedAt,
          createdAt: brief.createdAt,
        })),
        error: null,
      };
    } catch (error) {
      console.error('Failed to get brief history:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get brief history',
      };
    }
  });

/**
 * Gets a specific brief by date for the authenticated user.
 *
 * @param briefDate The date of the brief in YYYY-MM-DD format
 * @returns The brief for the specified date or null if not found
 */
export const getBriefByDateFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      briefDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const brief = await findDailyBriefByUserAndDate(userId, data.briefDate);

      if (!brief) {
        return {
          success: true,
          data: null,
          error: null,
        };
      }

      return {
        success: true,
        data: {
          id: brief.id,
          briefDate: brief.briefDate,
          status: brief.status,
          briefContent: brief.briefContent,
          calendarEvents: brief.calendarEvents,
          emails: brief.emails,
          weather: brief.weather,
          enrichedContent: brief.enrichedContent,
          enrichedAt: brief.enrichedAt,
          totalEvents: brief.totalEvents,
          totalEmails: brief.totalEmails,
          emailsNeedingResponse: brief.emailsNeedingResponse,
          generatedAt: brief.generatedAt,
          errorMessage: brief.errorMessage,
          createdAt: brief.createdAt,
          updatedAt: brief.updatedAt,
        },
        error: null,
      };
    } catch (error) {
      console.error('Failed to get brief by date:', error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Failed to get brief by date',
      };
    }
  });

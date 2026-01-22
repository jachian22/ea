import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedMiddleware } from "./middleware";
import { findGoogleIntegrationByUserId } from "~/data-access/google-integration";
import { isIntegrationValid } from "~/lib/google-client";
import {
  setupGmailWatch,
  stopGmailWatch,
  setupCalendarWatch,
  stopCalendarWatch,
} from "~/services/webhook-ingestion-service";
import {
  getIngestionStatistics,
  findIngestionEventsByUserId,
  cleanupOldIngestionEvents,
} from "~/data-access/ingestion-events";
import type { IngestionEvent } from "~/db/schema";

// Type for ingestion events response
type GetIngestionEventsResponse =
  | { success: true; data: IngestionEvent[]; error: null }
  | { success: false; data: null; error: string };

// ============================================================================
// Setup Gmail Watch
// ============================================================================

export const setupGmailWatchFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      topicName: z.string(), // Google Cloud Pub/Sub topic name
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          data: null,
          error: "Google account is not connected.",
        };
      }

      const result = await setupGmailWatch(integration!, data.topicName);

      if (!result) {
        return {
          success: false,
          data: null,
          error: "Failed to setup Gmail watch.",
        };
      }

      return {
        success: true,
        data: {
          historyId: result.historyId,
          expiration: result.expiration,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to setup Gmail watch:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to setup Gmail watch",
      };
    }
  });

// ============================================================================
// Stop Gmail Watch
// ============================================================================

export const stopGmailWatchFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          error: "Google account is not connected.",
        };
      }

      const stopped = await stopGmailWatch(integration!);

      if (!stopped) {
        return {
          success: false,
          error: "Failed to stop Gmail watch.",
        };
      }

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error("Failed to stop Gmail watch:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop Gmail watch",
      };
    }
  });

// ============================================================================
// Setup Calendar Watch
// ============================================================================

export const setupCalendarWatchFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      webhookUrl: z.string().url(), // URL to receive calendar notifications
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          data: null,
          error: "Google account is not connected.",
        };
      }

      const result = await setupCalendarWatch(integration!, data.webhookUrl);

      if (!result) {
        return {
          success: false,
          data: null,
          error: "Failed to setup Calendar watch.",
        };
      }

      return {
        success: true,
        data: {
          channelId: result.channelId,
          resourceId: result.resourceId,
          expiration: result.expiration,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to setup Calendar watch:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to setup Calendar watch",
      };
    }
  });

// ============================================================================
// Stop Calendar Watch
// ============================================================================

export const stopCalendarWatchFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      channelId: z.string(),
      resourceId: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!isIntegrationValid(integration)) {
        return {
          success: false,
          error: "Google account is not connected.",
        };
      }

      const stopped = await stopCalendarWatch(
        integration!,
        data.channelId,
        data.resourceId
      );

      if (!stopped) {
        return {
          success: false,
          error: "Failed to stop Calendar watch.",
        };
      }

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error("Failed to stop Calendar watch:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop Calendar watch",
      };
    }
  });

// ============================================================================
// Get Ingestion Statistics
// ============================================================================

export const getIngestionStatsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        hoursBack: z.number().min(1).max(168).optional().default(24),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const hoursBack = data?.hoursBack || 24;

    try {
      const stats = await getIngestionStatistics(userId, hoursBack);

      return {
        success: true,
        data: stats,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get ingestion statistics:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get ingestion statistics",
      };
    }
  });

// ============================================================================
// Get Ingestion Events
// ============================================================================

export const getIngestionEventsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(100).optional().default(50),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }): Promise<GetIngestionEventsResponse> => {
    const { userId } = context;
    const limit = data?.limit || 50;

    try {
      const events = await findIngestionEventsByUserId(userId, limit);

      return {
        success: true,
        data: events,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get ingestion events:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get ingestion events",
      };
    }
  });

// ============================================================================
// Cleanup Old Ingestion Events
// ============================================================================

export const cleanupIngestionEventsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        daysToKeep: z.number().min(1).max(30).optional().default(7),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const daysToKeep = data?.daysToKeep || 7;

    try {
      const deletedCount = await cleanupOldIngestionEvents(userId, daysToKeep);

      return {
        success: true,
        data: {
          deletedCount,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to cleanup ingestion events:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to cleanup ingestion events",
      };
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authenticatedMiddleware } from "./middleware";
import {
  findBackfillJobsByUserId,
  findBackfillJobById,
  findActiveBackfillJob,
  pauseBackfillJob,
  deleteBackfillJob,
} from "~/data-access/backfill-jobs";
import { startBackfill, runBackfillJob } from "~/services/backfill-service";

// ============================================================================
// Start Backfill Job
// ============================================================================

export const startBackfillJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sourceType: z.enum(["gmail", "calendar", "all"]),
      startDate: z.string(), // ISO date string
      endDate: z.string(), // ISO date string
      saveCommitments: z.boolean().optional().default(true),
      minCommitmentConfidence: z.number().min(0).max(1).optional().default(0.6),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      // Check for existing active job
      const existingJob = await findActiveBackfillJob(userId);
      if (existingJob) {
        return {
          success: false,
          data: null,
          error: `A backfill job is already ${existingJob.status}. Please wait for it to complete or cancel it.`,
        };
      }

      // Start the backfill
      const result = await startBackfill(
        userId,
        data.sourceType,
        new Date(data.startDate),
        new Date(data.endDate),
        {
          saveCommitments: data.saveCommitments,
          minCommitmentConfidence: data.minCommitmentConfidence,
        }
      );

      return {
        success: result.success,
        data: {
          job: result.job,
          stats: result.stats,
        },
        error: result.error || null,
      };
    } catch (error) {
      console.error("Failed to start backfill:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to start backfill",
      };
    }
  });

// ============================================================================
// Get Backfill Jobs
// ============================================================================

export const getBackfillJobsFn = createServerFn({ method: "GET" })
  .inputValidator(
    z
      .object({
        limit: z.number().min(1).max(50).optional().default(20),
      })
      .optional()
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const limit = data?.limit ?? 20;

    try {
      const jobs = await findBackfillJobsByUserId(userId, limit);

      return {
        success: true,
        data: jobs,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get backfill jobs:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get backfill jobs",
      };
    }
  });

// ============================================================================
// Get Active Backfill Job
// ============================================================================

export const getActiveBackfillJobFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const job = await findActiveBackfillJob(userId);

      return {
        success: true,
        data: job,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get active backfill job:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get active backfill job",
      };
    }
  });

// ============================================================================
// Get Backfill Job by ID
// ============================================================================

export const getBackfillJobByIdFn = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const job = await findBackfillJobById(data.id);

      if (!job || job.userId !== userId) {
        return {
          success: false,
          data: null,
          error: "Backfill job not found",
        };
      }

      return {
        success: true,
        data: job,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get backfill job:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to get backfill job",
      };
    }
  });

// ============================================================================
// Pause Backfill Job
// ============================================================================

export const pauseBackfillJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const job = await findBackfillJobById(data.id);

      if (!job || job.userId !== userId) {
        return {
          success: false,
          data: null,
          error: "Backfill job not found",
        };
      }

      if (job.status !== "running") {
        return {
          success: false,
          data: null,
          error: "Can only pause running jobs",
        };
      }

      const updated = await pauseBackfillJob(data.id);

      return {
        success: true,
        data: updated,
        error: null,
      };
    } catch (error) {
      console.error("Failed to pause backfill job:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to pause backfill job",
      };
    }
  });

// ============================================================================
// Resume Backfill Job
// ============================================================================

export const resumeBackfillJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const job = await findBackfillJobById(data.id);

      if (!job || job.userId !== userId) {
        return {
          success: false,
          data: null,
          error: "Backfill job not found",
        };
      }

      if (job.status !== "paused") {
        return {
          success: false,
          data: null,
          error: "Can only resume paused jobs",
        };
      }

      // Resume the job (this runs in the background)
      const result = await runBackfillJob(data.id);

      return {
        success: result.success,
        data: result.job,
        error: result.error || null,
      };
    } catch (error) {
      console.error("Failed to resume backfill job:", error);
      return {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : "Failed to resume backfill job",
      };
    }
  });

// ============================================================================
// Delete Backfill Job
// ============================================================================

export const deleteBackfillJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      id: z.string(),
    })
  )
  .middleware([authenticatedMiddleware])
  .handler(async ({ data, context }) => {
    const { userId } = context;

    try {
      const job = await findBackfillJobById(data.id);

      if (!job || job.userId !== userId) {
        return {
          success: false,
          error: "Backfill job not found",
        };
      }

      if (job.status === "running") {
        return {
          success: false,
          error: "Cannot delete running jobs. Pause it first.",
        };
      }

      await deleteBackfillJob(data.id);

      return {
        success: true,
        error: null,
      };
    } catch (error) {
      console.error("Failed to delete backfill job:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete backfill job",
      };
    }
  });

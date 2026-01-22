import * as cron from 'node-cron';
import { generateDailyBriefsForAllUsers } from '~/services/brief-generator';

/**
 * Configuration options for the daily brief scheduler
 */
export interface DailyBriefSchedulerOptions {
  /**
   * Cron expression for when to run the scheduler.
   * Default: "0 7 * * *" (7:00 AM every day)
   *
   * Cron format: minute hour day-of-month month day-of-week
   * Examples:
   *   - "0 7 * * *"  = 7:00 AM every day
   *   - "0 6 * * *"  = 6:00 AM every day
   *   - "30 7 * * 1-5" = 7:30 AM Monday-Friday
   */
  cronExpression?: string;

  /**
   * Timezone for the cron schedule.
   * Default: system timezone
   */
  timezone?: string;

  /**
   * Whether to run immediately on startup (in addition to scheduled runs).
   * Default: false
   */
  runOnStartup?: boolean;

  /**
   * Callback function called after each scheduler run with results.
   * Useful for logging or monitoring.
   */
  onComplete?: (results: DailyBriefSchedulerRunResult) => void;

  /**
   * Callback function called when the scheduler encounters an error.
   */
  onError?: (error: Error) => void;
}

/**
 * Result of a single scheduler run
 */
export interface DailyBriefSchedulerRunResult {
  /** Timestamp when the run started */
  startedAt: Date;
  /** Timestamp when the run completed */
  completedAt: Date;
  /** Total number of users processed */
  totalUsers: number;
  /** Number of successful brief generations */
  successCount: number;
  /** Number of failed brief generations */
  failureCount: number;
  /** Individual results for each user */
  results: Array<{
    userId: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Daily Brief Scheduler
 *
 * Manages the cron job for automatically generating daily briefs
 * for all users with connected Google integrations.
 *
 * Features:
 * - Configurable schedule via cron expression
 * - Timezone support
 * - Optional run-on-startup
 * - Callbacks for monitoring and logging
 * - Graceful start/stop
 *
 * @example
 * ```typescript
 * const scheduler = new DailyBriefScheduler({
 *   cronExpression: "0 7 * * *", // 7 AM daily
 *   timezone: "America/New_York",
 *   onComplete: (results) => console.log(`Generated ${results.successCount} briefs`),
 * });
 *
 * scheduler.start();
 *
 * // Later, to stop:
 * scheduler.stop();
 * ```
 */
export class DailyBriefScheduler {
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private options: Required<Omit<DailyBriefSchedulerOptions, 'onComplete' | 'onError'>> &
    Pick<DailyBriefSchedulerOptions, 'onComplete' | 'onError'>;

  constructor(options: DailyBriefSchedulerOptions = {}) {
    this.options = {
      cronExpression: options.cronExpression ?? '0 7 * * *',
      timezone: options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      runOnStartup: options.runOnStartup ?? false,
      onComplete: options.onComplete,
      onError: options.onError,
    };
  }

  /**
   * Starts the scheduler.
   *
   * Schedules the cron job and optionally runs immediately
   * if runOnStartup was enabled.
   */
  start(): void {
    if (this.task) {
      console.warn('[DailyBriefScheduler] Scheduler is already running');
      return;
    }

    console.log(
      `[DailyBriefScheduler] Starting scheduler with cron: "${this.options.cronExpression}" (timezone: ${this.options.timezone})`
    );

    // Validate cron expression
    if (!cron.validate(this.options.cronExpression)) {
      const error = new Error(`Invalid cron expression: ${this.options.cronExpression}`);
      console.error('[DailyBriefScheduler]', error.message);
      this.options.onError?.(error);
      throw error;
    }

    // Schedule the cron job
    this.task = cron.schedule(
      this.options.cronExpression,
      () => {
        this.runBriefGeneration().catch((error) => {
          console.error('[DailyBriefScheduler] Unhandled error:', error);
          this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
        });
      },
      {
        scheduled: true,
        timezone: this.options.timezone,
      }
    );

    console.log('[DailyBriefScheduler] Scheduler started successfully');

    // Run immediately if configured
    if (this.options.runOnStartup) {
      console.log('[DailyBriefScheduler] Running initial brief generation...');
      this.runBriefGeneration().catch((error) => {
        console.error('[DailyBriefScheduler] Error during startup run:', error);
        this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
      });
    }
  }

  /**
   * Stops the scheduler.
   *
   * Cancels any scheduled runs. Does not cancel an in-progress run.
   */
  stop(): void {
    if (!this.task) {
      console.warn('[DailyBriefScheduler] Scheduler is not running');
      return;
    }

    this.task.stop();
    this.task = null;
    console.log('[DailyBriefScheduler] Scheduler stopped');
  }

  /**
   * Checks if the scheduler is currently active.
   */
  isActive(): boolean {
    return this.task !== null;
  }

  /**
   * Checks if brief generation is currently in progress.
   */
  isGenerating(): boolean {
    return this.isRunning;
  }

  /**
   * Manually triggers a brief generation run outside of the schedule.
   *
   * Useful for testing or forcing a refresh.
   *
   * @returns The run result
   */
  async triggerManualRun(): Promise<DailyBriefSchedulerRunResult> {
    console.log('[DailyBriefScheduler] Manual run triggered');
    return this.runBriefGeneration();
  }

  /**
   * Gets the next scheduled run time.
   *
   * @returns The next run time, or null if scheduler is not active
   */
  getNextRunTime(): Date | null {
    // node-cron doesn't expose next run time directly,
    // so we need to calculate it ourselves
    if (!this.task) {
      return null;
    }

    return calculateNextCronRun(this.options.cronExpression, this.options.timezone);
  }

  /**
   * Internal method to run the brief generation for all users.
   */
  private async runBriefGeneration(): Promise<DailyBriefSchedulerRunResult> {
    // Prevent concurrent runs
    if (this.isRunning) {
      console.warn(
        '[DailyBriefScheduler] Brief generation is already in progress, skipping this run'
      );
      return {
        startedAt: new Date(),
        completedAt: new Date(),
        totalUsers: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      };
    }

    this.isRunning = true;
    const startedAt = new Date();

    console.log(
      `[DailyBriefScheduler] Starting daily brief generation at ${startedAt.toISOString()}`
    );

    try {
      // Generate briefs for all connected users
      const userResults = await generateDailyBriefsForAllUsers({
        timeZone: this.options.timezone,
      });

      const completedAt = new Date();

      // Calculate statistics
      const successCount = userResults.filter((r) => r.result.success).length;
      const failureCount = userResults.filter((r) => !r.result.success).length;

      const runResult: DailyBriefSchedulerRunResult = {
        startedAt,
        completedAt,
        totalUsers: userResults.length,
        successCount,
        failureCount,
        results: userResults.map((r) => ({
          userId: r.userId,
          success: r.result.success,
          error: r.result.error?.message,
        })),
      };

      // Log summary
      const durationMs = completedAt.getTime() - startedAt.getTime();
      console.log(
        `[DailyBriefScheduler] Completed in ${durationMs}ms: ` +
          `${successCount} succeeded, ${failureCount} failed out of ${userResults.length} users`
      );

      // Log individual failures for debugging
      for (const result of runResult.results) {
        if (!result.success) {
          console.error(`[DailyBriefScheduler] Failed for user ${result.userId}: ${result.error}`);
        }
      }

      // Call completion callback
      this.options.onComplete?.(runResult);

      return runResult;
    } catch (error) {
      const completedAt = new Date();
      console.error('[DailyBriefScheduler] Fatal error during brief generation:', error);

      const runResult: DailyBriefSchedulerRunResult = {
        startedAt,
        completedAt,
        totalUsers: 0,
        successCount: 0,
        failureCount: 0,
        results: [],
      };

      // Call error callback
      this.options.onError?.(error instanceof Error ? error : new Error(String(error)));

      return runResult;
    } finally {
      this.isRunning = false;
    }
  }
}

/**
 * Calculates the next run time for a cron expression.
 *
 * This is a simplified calculation that handles common cron patterns.
 * For complex expressions, it provides a reasonable approximation.
 *
 * @param cronExpression The cron expression
 * @param timezone The timezone (not fully supported in calculation)
 * @returns The approximate next run time
 */
function calculateNextCronRun(cronExpression: string, timezone: string): Date | null {
  try {
    const parts = cronExpression.split(' ');
    if (parts.length !== 5) {
      return null;
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    const now = new Date();
    const next = new Date(now);

    // Set to the scheduled time
    if (minute !== '*') {
      next.setMinutes(parseInt(minute, 10));
    }
    if (hour !== '*') {
      next.setHours(parseInt(hour, 10));
    }
    next.setSeconds(0);
    next.setMilliseconds(0);

    // If the time has already passed today, move to tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    // Handle day-of-week constraints
    if (dayOfWeek !== '*') {
      const targetDays = parseCronField(dayOfWeek, 0, 7);
      let currentDay = next.getDay();

      // Find the next matching day
      let daysToAdd = 0;
      while (!targetDays.includes(currentDay % 7) && daysToAdd < 7) {
        daysToAdd++;
        currentDay = (currentDay + 1) % 7;
      }

      if (daysToAdd > 0) {
        next.setDate(next.getDate() + daysToAdd);
      }
    }

    return next;
  } catch {
    return null;
  }
}

/**
 * Parses a cron field that may contain ranges, lists, or wildcards.
 */
function parseCronField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  const values: number[] = [];

  // Handle comma-separated values
  const parts = field.split(',');

  for (const part of parts) {
    if (part.includes('-')) {
      // Handle ranges (e.g., "1-5")
      const [start, end] = part.split('-').map((n) => parseInt(n, 10));
      for (let i = start; i <= end; i++) {
        values.push(i);
      }
    } else {
      // Handle single values
      values.push(parseInt(part, 10));
    }
  }

  return values;
}

// ============================================================================
// Singleton Instance & Convenience Functions
// ============================================================================

/**
 * Singleton instance of the daily brief scheduler.
 *
 * Use this for the application's main scheduler instance.
 */
let schedulerInstance: DailyBriefScheduler | null = null;

/**
 * Gets or creates the singleton scheduler instance.
 *
 * @param options Options for the scheduler (only used on first call)
 * @returns The scheduler instance
 */
export function getDailyBriefScheduler(options?: DailyBriefSchedulerOptions): DailyBriefScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new DailyBriefScheduler(options);
  }
  return schedulerInstance;
}

/**
 * Initializes and starts the daily brief scheduler.
 *
 * This is the main entry point for starting the scheduler during
 * application startup. It creates the singleton instance and starts it.
 *
 * @param options Configuration options for the scheduler
 * @returns The scheduler instance
 *
 * @example
 * ```typescript
 * // In server startup
 * import { initDailyBriefScheduler } from "~/jobs/daily-brief-scheduler";
 *
 * initDailyBriefScheduler({
 *   cronExpression: process.env.DAILY_BRIEF_CRON ?? "0 7 * * *",
 *   timezone: process.env.DAILY_BRIEF_TIMEZONE ?? "UTC",
 * });
 * ```
 */
export function initDailyBriefScheduler(options?: DailyBriefSchedulerOptions): DailyBriefScheduler {
  const scheduler = getDailyBriefScheduler(options);

  if (!scheduler.isActive()) {
    scheduler.start();
  }

  return scheduler;
}

/**
 * Stops the singleton scheduler instance.
 *
 * Call this during application shutdown for graceful cleanup.
 */
export function stopDailyBriefScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

/**
 * Checks if the daily brief scheduler is currently active.
 */
export function isDailyBriefSchedulerActive(): boolean {
  return schedulerInstance?.isActive() ?? false;
}

/**
 * Gets the next scheduled run time for the daily brief scheduler.
 */
export function getNextDailyBriefRunTime(): Date | null {
  return schedulerInstance?.getNextRunTime() ?? null;
}

/**
 * Manually triggers a brief generation run.
 *
 * This bypasses the schedule and runs immediately.
 * Useful for testing or admin operations.
 *
 * @returns The run result, or null if scheduler is not initialized
 */
export async function triggerDailyBriefGeneration(): Promise<DailyBriefSchedulerRunResult | null> {
  if (!schedulerInstance) {
    console.warn('[DailyBriefScheduler] Cannot trigger run: scheduler not initialized');
    return null;
  }

  return schedulerInstance.triggerManualRun();
}

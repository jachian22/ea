import { eq, and, desc, or } from 'drizzle-orm';
import { database } from '~/db';
import {
  backfillJob,
  type BackfillJob,
  type CreateBackfillJobData,
  type UpdateBackfillJobData,
  type BackfillJobStatus,
  type BackfillSourceType,
  type BackfillProgress,
} from '~/db/schema';

// ============================================================================
// Backfill Job CRUD
// ============================================================================

/**
 * Create a new backfill job
 */
export async function createBackfillJob(data: CreateBackfillJobData): Promise<BackfillJob> {
  const [newJob] = await database
    .insert(backfillJob)
    .values({
      ...data,
      progress: data.progress || { processed: 0, total: 0 },
    })
    .returning();

  return newJob;
}

/**
 * Find backfill job by ID
 */
export async function findBackfillJobById(id: string): Promise<BackfillJob | null> {
  const [result] = await database.select().from(backfillJob).where(eq(backfillJob.id, id)).limit(1);

  return result || null;
}

/**
 * Find all backfill jobs for a user
 */
export async function findBackfillJobsByUserId(
  userId: string,
  limit: number = 20
): Promise<BackfillJob[]> {
  const results = await database
    .select()
    .from(backfillJob)
    .where(eq(backfillJob.userId, userId))
    .orderBy(desc(backfillJob.createdAt))
    .limit(limit);

  return results;
}

/**
 * Find backfill jobs by status
 */
export async function findBackfillJobsByStatus(
  userId: string,
  status: BackfillJobStatus
): Promise<BackfillJob[]> {
  const results = await database
    .select()
    .from(backfillJob)
    .where(and(eq(backfillJob.userId, userId), eq(backfillJob.status, status)))
    .orderBy(desc(backfillJob.createdAt));

  return results;
}

/**
 * Find the latest backfill job for a user
 */
export async function findLatestBackfillJob(userId: string): Promise<BackfillJob | null> {
  const [result] = await database
    .select()
    .from(backfillJob)
    .where(eq(backfillJob.userId, userId))
    .orderBy(desc(backfillJob.createdAt))
    .limit(1);

  return result || null;
}

/**
 * Find active (running or pending) backfill job for a user
 */
export async function findActiveBackfillJob(userId: string): Promise<BackfillJob | null> {
  const [result] = await database
    .select()
    .from(backfillJob)
    .where(
      and(
        eq(backfillJob.userId, userId),
        or(eq(backfillJob.status, 'pending'), eq(backfillJob.status, 'running'))
      )
    )
    .limit(1);

  return result || null;
}

/**
 * Find all pending backfill jobs (for job processor)
 */
export async function findPendingBackfillJobs(): Promise<BackfillJob[]> {
  const results = await database
    .select()
    .from(backfillJob)
    .where(eq(backfillJob.status, 'pending'))
    .orderBy(backfillJob.createdAt);

  return results;
}

/**
 * Find all running backfill jobs (for job processor)
 */
export async function findRunningBackfillJobs(): Promise<BackfillJob[]> {
  const results = await database
    .select()
    .from(backfillJob)
    .where(eq(backfillJob.status, 'running'))
    .orderBy(backfillJob.createdAt);

  return results;
}

/**
 * Update a backfill job
 */
export async function updateBackfillJob(
  id: string,
  data: UpdateBackfillJobData
): Promise<BackfillJob | null> {
  const [updated] = await database
    .update(backfillJob)
    .set(data)
    .where(eq(backfillJob.id, id))
    .returning();

  return updated || null;
}

/**
 * Delete a backfill job
 */
export async function deleteBackfillJob(id: string): Promise<boolean> {
  const [deleted] = await database.delete(backfillJob).where(eq(backfillJob.id, id)).returning();

  return deleted !== undefined;
}

// ============================================================================
// Backfill Job Status Management
// ============================================================================

/**
 * Start a backfill job (set to running)
 */
export async function startBackfillJob(id: string): Promise<BackfillJob | null> {
  return updateBackfillJob(id, {
    status: 'running',
    startedAt: new Date(),
  });
}

/**
 * Pause a backfill job
 */
export async function pauseBackfillJob(id: string): Promise<BackfillJob | null> {
  return updateBackfillJob(id, {
    status: 'paused',
  });
}

/**
 * Resume a paused backfill job
 */
export async function resumeBackfillJob(id: string): Promise<BackfillJob | null> {
  return updateBackfillJob(id, {
    status: 'running',
  });
}

/**
 * Complete a backfill job
 */
export async function completeBackfillJob(
  id: string,
  stats?: {
    personsCreated?: number;
    interactionsCreated?: number;
    commitmentsDetected?: number;
  }
): Promise<BackfillJob | null> {
  return updateBackfillJob(id, {
    status: 'completed',
    completedAt: new Date(),
    personsCreated: stats?.personsCreated,
    interactionsCreated: stats?.interactionsCreated,
    commitmentsDetected: stats?.commitmentsDetected,
  });
}

/**
 * Fail a backfill job
 */
export async function failBackfillJob(id: string, error: string): Promise<BackfillJob | null> {
  return updateBackfillJob(id, {
    status: 'failed',
    error,
    completedAt: new Date(),
  });
}

// ============================================================================
// Backfill Job Progress Management
// ============================================================================

/**
 * Update backfill job progress
 */
export async function updateBackfillJobProgress(
  id: string,
  progress: BackfillProgress
): Promise<BackfillJob | null> {
  return updateBackfillJob(id, { progress });
}

/**
 * Increment backfill job progress
 */
export async function incrementBackfillJobProgress(
  id: string,
  increment: number = 1,
  lastProcessedId?: string,
  currentPhase?: string
): Promise<BackfillJob | null> {
  const job = await findBackfillJobById(id);
  if (!job) return null;

  const currentProgress = job.progress || { processed: 0, total: 0 };
  const newProgress: BackfillProgress = {
    ...currentProgress,
    processed: currentProgress.processed + increment,
    lastProcessedId: lastProcessedId ?? currentProgress.lastProcessedId,
    currentPhase: currentPhase ?? currentProgress.currentPhase,
  };

  return updateBackfillJob(id, { progress: newProgress });
}

/**
 * Set backfill job total count
 */
export async function setBackfillJobTotal(id: string, total: number): Promise<BackfillJob | null> {
  const job = await findBackfillJobById(id);
  if (!job) return null;

  const currentProgress = job.progress || { processed: 0, total: 0 };
  const newProgress: BackfillProgress = {
    ...currentProgress,
    total,
  };

  return updateBackfillJob(id, { progress: newProgress });
}

/**
 * Increment statistics counters
 */
export async function incrementBackfillStats(
  id: string,
  stats: {
    personsCreated?: number;
    interactionsCreated?: number;
    commitmentsDetected?: number;
  }
): Promise<BackfillJob | null> {
  const job = await findBackfillJobById(id);
  if (!job) return null;

  const updates: UpdateBackfillJobData = {};

  if (stats.personsCreated) {
    updates.personsCreated = (job.personsCreated || 0) + stats.personsCreated;
  }
  if (stats.interactionsCreated) {
    updates.interactionsCreated = (job.interactionsCreated || 0) + stats.interactionsCreated;
  }
  if (stats.commitmentsDetected) {
    updates.commitmentsDetected = (job.commitmentsDetected || 0) + stats.commitmentsDetected;
  }

  return updateBackfillJob(id, updates);
}

// ============================================================================
// Backfill Job Creation Helpers
// ============================================================================

/**
 * Create a new backfill job for a user (checks for existing active job)
 */
export async function createBackfillJobForUser(
  userId: string,
  sourceType: BackfillSourceType,
  startDate: Date,
  endDate: Date
): Promise<BackfillJob | { error: string }> {
  // Check for existing active job
  const activeJob = await findActiveBackfillJob(userId);
  if (activeJob) {
    return {
      error: `A backfill job is already ${activeJob.status}. Please wait for it to complete or cancel it.`,
    };
  }

  return createBackfillJob({
    id: crypto.randomUUID(),
    userId,
    sourceType,
    startDate,
    endDate,
    status: 'pending',
    progress: { processed: 0, total: 0 },
  });
}

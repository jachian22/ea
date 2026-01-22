import { eq, and, desc, asc, between, sql, inArray, isNull, ne, or } from 'drizzle-orm';
import { database } from '~/db';
import {
  actionLog,
  actionType,
  type ActionLog,
  type CreateActionLogData,
  type UpdateActionLogData,
  type ActionLogStatus,
  type ActionTargetType,
  type AuthorityLevel,
  type UserFeedback,
  type ActionLogMetadata,
} from '~/db/schema';

/**
 * Create a new action log entry
 */
export async function createActionLog(data: CreateActionLogData): Promise<ActionLog> {
  const [newLog] = await database.insert(actionLog).values(data).returning();

  return newLog;
}

/**
 * Find an action log by ID
 */
export async function findActionLogById(id: string): Promise<ActionLog | null> {
  const [result] = await database.select().from(actionLog).where(eq(actionLog.id, id)).limit(1);

  return result || null;
}

/**
 * Find action logs by user ID
 */
export async function findActionLogsByUserId(
  userId: string,
  limit: number = 50
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(eq(actionLog.userId, userId))
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
}

/**
 * Find action logs with joined action type info
 */
export async function findActionLogsWithActionType(
  userId: string,
  limit: number = 50,
  status?: ActionLogStatus
): Promise<Array<ActionLog & { actionType: typeof actionType.$inferSelect }>> {
  const conditions = [eq(actionLog.userId, userId)];
  if (status) {
    conditions.push(eq(actionLog.status, status));
  }

  const results = await database
    .select({
      actionLog: actionLog,
      actionType: actionType,
    })
    .from(actionLog)
    .innerJoin(actionType, eq(actionLog.actionTypeId, actionType.id))
    .where(and(...conditions))
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);

  return results.map((r) => ({
    ...r.actionLog,
    actionType: r.actionType,
  }));
}

/**
 * Find pending approval actions for a user
 */
export async function findPendingApprovals(
  userId: string,
  limit: number = 50
): Promise<Array<ActionLog & { actionType: typeof actionType.$inferSelect }>> {
  return findActionLogsWithActionType(userId, limit, 'pending_approval');
}

/**
 * Find action logs by status
 */
export async function findActionLogsByStatus(
  userId: string,
  status: ActionLogStatus,
  limit: number = 50
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.userId, userId), eq(actionLog.status, status)))
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
}

/**
 * Find action logs by target
 */
export async function findActionLogsByTarget(
  userId: string,
  targetType: ActionTargetType,
  targetId: string
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(
      and(
        eq(actionLog.userId, userId),
        eq(actionLog.targetType, targetType),
        eq(actionLog.targetId, targetId)
      )
    )
    .orderBy(desc(actionLog.createdAt));
}

/**
 * Find action logs within a date range
 */
export async function findActionLogsByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
  limit: number = 100
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.userId, userId), between(actionLog.createdAt, startDate, endDate)))
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
}

/**
 * Update an action log
 */
export async function updateActionLog(
  id: string,
  data: UpdateActionLogData
): Promise<ActionLog | null> {
  const [updated] = await database
    .update(actionLog)
    .set(data)
    .where(eq(actionLog.id, id))
    .returning();

  return updated || null;
}

/**
 * Approve a pending action
 */
export async function approveAction(
  id: string,
  metadata?: Partial<ActionLogMetadata>
): Promise<ActionLog | null> {
  const existing = await findActionLogById(id);
  if (!existing || existing.status !== 'pending_approval') {
    return null;
  }

  return updateActionLog(id, {
    status: 'approved',
    approvedAt: new Date(),
    metadata: metadata ? { ...existing.metadata, ...metadata } : existing.metadata,
  });
}

/**
 * Reject a pending action
 */
export async function rejectAction(id: string, reason?: string): Promise<ActionLog | null> {
  const existing = await findActionLogById(id);
  if (!existing || existing.status !== 'pending_approval') {
    return null;
  }

  return updateActionLog(id, {
    status: 'rejected',
    rejectedAt: new Date(),
    metadata: {
      ...existing.metadata,
      rejectionReason: reason,
    },
  });
}

/**
 * Mark an action as executed
 */
export async function markActionExecuted(
  id: string,
  metadata?: Partial<ActionLogMetadata>
): Promise<ActionLog | null> {
  const existing = await findActionLogById(id);
  if (!existing) {
    return null;
  }

  return updateActionLog(id, {
    status: 'executed',
    executedAt: new Date(),
    metadata: metadata ? { ...existing.metadata, ...metadata } : existing.metadata,
  });
}

/**
 * Mark an action as failed
 */
export async function markActionFailed(id: string, reason: string): Promise<ActionLog | null> {
  const existing = await findActionLogById(id);
  if (!existing) {
    return null;
  }

  return updateActionLog(id, {
    status: 'failed',
    metadata: {
      ...existing.metadata,
      failureReason: reason,
    },
  });
}

/**
 * Mark an action as reversed
 */
export async function markActionReversed(
  id: string,
  reversedBy: 'user' | 'system',
  reason?: string
): Promise<ActionLog | null> {
  const existing = await findActionLogById(id);
  if (!existing || existing.status !== 'executed') {
    return null;
  }

  return updateActionLog(id, {
    status: 'reversed',
    metadata: {
      ...existing.metadata,
      reversedAt: new Date().toISOString(),
      reversedBy,
      reversalReason: reason,
    },
  });
}

/**
 * Add user feedback to an action log
 */
export async function addUserFeedback(
  id: string,
  feedback: UserFeedback
): Promise<ActionLog | null> {
  return updateActionLog(id, {
    userFeedback: feedback,
  });
}

/**
 * Batch approve multiple actions
 */
export async function batchApproveActions(
  ids: string[]
): Promise<{ approved: number; failed: number }> {
  let approved = 0;
  let failed = 0;

  for (const id of ids) {
    const result = await approveAction(id);
    if (result) {
      approved++;
    } else {
      failed++;
    }
  }

  return { approved, failed };
}

/**
 * Batch reject multiple actions
 */
export async function batchRejectActions(
  ids: string[],
  reason?: string
): Promise<{ rejected: number; failed: number }> {
  let rejected = 0;
  let failed = 0;

  for (const id of ids) {
    const result = await rejectAction(id, reason);
    if (result) {
      rejected++;
    } else {
      failed++;
    }
  }

  return { rejected, failed };
}

/**
 * Get action log statistics for a user
 */
export async function getActionLogStats(
  userId: string,
  since?: Date
): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
  failed: number;
  reversed: number;
  feedbackStats: {
    correct: number;
    shouldAsk: number;
    shouldAuto: number;
    wrong: number;
  };
}> {
  const conditions = [eq(actionLog.userId, userId)];
  if (since) {
    conditions.push(sql`${actionLog.createdAt} >= ${since}`);
  }

  const logs = await database
    .select()
    .from(actionLog)
    .where(and(...conditions));

  const stats = {
    total: logs.length,
    pending: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    failed: 0,
    reversed: 0,
    feedbackStats: {
      correct: 0,
      shouldAsk: 0,
      shouldAuto: 0,
      wrong: 0,
    },
  };

  for (const log of logs) {
    switch (log.status) {
      case 'pending_approval':
        stats.pending++;
        break;
      case 'approved':
        stats.approved++;
        break;
      case 'rejected':
        stats.rejected++;
        break;
      case 'executed':
        stats.executed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'reversed':
        stats.reversed++;
        break;
    }

    if (log.userFeedback) {
      switch (log.userFeedback) {
        case 'correct':
          stats.feedbackStats.correct++;
          break;
        case 'should_ask':
          stats.feedbackStats.shouldAsk++;
          break;
        case 'should_auto':
          stats.feedbackStats.shouldAuto++;
          break;
        case 'wrong':
          stats.feedbackStats.wrong++;
          break;
      }
    }
  }

  return stats;
}

/**
 * Get pending approval count for a user
 */
export async function getPendingApprovalCount(userId: string): Promise<number> {
  const result = await database
    .select({ count: sql<number>`count(*)` })
    .from(actionLog)
    .where(and(eq(actionLog.userId, userId), eq(actionLog.status, 'pending_approval')));

  return result[0]?.count ?? 0;
}

/**
 * Delete an action log
 */
export async function deleteActionLog(id: string): Promise<boolean> {
  const [deleted] = await database.delete(actionLog).where(eq(actionLog.id, id)).returning();

  return deleted !== undefined;
}

/**
 * Delete all action logs for a user
 */
export async function deleteActionLogsByUserId(userId: string): Promise<number> {
  const deleted = await database.delete(actionLog).where(eq(actionLog.userId, userId)).returning();

  return deleted.length;
}

/**
 * Find similar past actions for confidence learning
 */
export async function findSimilarPastActions(
  userId: string,
  actionTypeId: string,
  targetType: ActionTargetType,
  limit: number = 10
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(
      and(
        eq(actionLog.userId, userId),
        eq(actionLog.actionTypeId, actionTypeId),
        eq(actionLog.targetType, targetType),
        or(
          eq(actionLog.status, 'executed'),
          eq(actionLog.status, 'approved'),
          eq(actionLog.status, 'rejected')
        )
      )
    )
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
}

/**
 * Get actions with user feedback for learning
 */
export async function getActionsWithFeedback(
  userId: string,
  limit: number = 100
): Promise<ActionLog[]> {
  return database
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.userId, userId), sql`${actionLog.userFeedback} IS NOT NULL`))
    .orderBy(desc(actionLog.createdAt))
    .limit(limit);
}

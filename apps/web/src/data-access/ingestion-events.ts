import { database } from "~/db";
import { ingestionEvent } from "~/db/schema";
import type {
  IngestionEvent,
  CreateIngestionEventData,
  UpdateIngestionEventData,
} from "~/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";

// ============================================================================
// Ingestion Event Data Access Layer
// ============================================================================

/**
 * Create a new ingestion event
 */
export async function createIngestionEvent(
  data: CreateIngestionEventData
): Promise<IngestionEvent> {
  const [result] = await database
    .insert(ingestionEvent)
    .values(data)
    .returning();
  return result;
}

/**
 * Find an ingestion event by ID
 */
export async function findIngestionEventById(
  id: string
): Promise<IngestionEvent | null> {
  const [result] = await database
    .select()
    .from(ingestionEvent)
    .where(eq(ingestionEvent.id, id));
  return result || null;
}

/**
 * Find ingestion events by user ID
 */
export async function findIngestionEventsByUserId(
  userId: string,
  limit: number = 100
): Promise<IngestionEvent[]> {
  return database
    .select()
    .from(ingestionEvent)
    .where(eq(ingestionEvent.userId, userId))
    .orderBy(desc(ingestionEvent.createdAt))
    .limit(limit);
}

/**
 * Find pending ingestion events for a user
 */
export async function findPendingIngestionEvents(
  userId: string
): Promise<IngestionEvent[]> {
  return database
    .select()
    .from(ingestionEvent)
    .where(
      and(
        eq(ingestionEvent.userId, userId),
        eq(ingestionEvent.status, "pending")
      )
    )
    .orderBy(ingestionEvent.createdAt);
}

/**
 * Find a duplicate ingestion event by external ID and source
 */
export async function findDuplicateIngestionEvent(
  userId: string,
  source: IngestionEvent["source"],
  externalId: string
): Promise<IngestionEvent | null> {
  const [result] = await database
    .select()
    .from(ingestionEvent)
    .where(
      and(
        eq(ingestionEvent.userId, userId),
        eq(ingestionEvent.source, source),
        eq(ingestionEvent.externalId, externalId)
      )
    );
  return result || null;
}

/**
 * Update an ingestion event
 */
export async function updateIngestionEvent(
  id: string,
  data: UpdateIngestionEventData
): Promise<IngestionEvent | null> {
  const [result] = await database
    .update(ingestionEvent)
    .set({
      ...data,
    })
    .where(eq(ingestionEvent.id, id))
    .returning();
  return result || null;
}

/**
 * Mark ingestion event as processing
 */
export async function markIngestionEventProcessing(
  id: string
): Promise<IngestionEvent | null> {
  return updateIngestionEvent(id, { status: "processing" });
}

/**
 * Mark ingestion event as completed
 */
export async function markIngestionEventCompleted(
  id: string,
  results: {
    personsCreated?: number;
    interactionsCreated?: number;
    commitmentsDetected?: number;
  }
): Promise<IngestionEvent | null> {
  return updateIngestionEvent(id, {
    status: "completed",
    processedAt: new Date(),
    personsCreated: results.personsCreated,
    interactionsCreated: results.interactionsCreated,
    commitmentsDetected: results.commitmentsDetected,
  });
}

/**
 * Mark ingestion event as failed
 */
export async function markIngestionEventFailed(
  id: string,
  errorMessage: string
): Promise<IngestionEvent | null> {
  return updateIngestionEvent(id, {
    status: "failed",
    errorMessage,
    processedAt: new Date(),
  });
}

/**
 * Mark ingestion event as duplicate
 */
export async function markIngestionEventDuplicate(
  id: string
): Promise<IngestionEvent | null> {
  return updateIngestionEvent(id, {
    status: "duplicate",
    processedAt: new Date(),
  });
}

/**
 * Get ingestion statistics for a user
 */
export async function getIngestionStatistics(
  userId: string,
  hoursBack: number = 24
): Promise<{
  totalEvents: number;
  pendingEvents: number;
  completedEvents: number;
  failedEvents: number;
  personsCreated: number;
  interactionsCreated: number;
  commitmentsDetected: number;
}> {
  const since = new Date();
  since.setHours(since.getHours() - hoursBack);

  const events = await database
    .select()
    .from(ingestionEvent)
    .where(
      and(
        eq(ingestionEvent.userId, userId),
        gte(ingestionEvent.createdAt, since)
      )
    );

  const stats = {
    totalEvents: events.length,
    pendingEvents: 0,
    completedEvents: 0,
    failedEvents: 0,
    personsCreated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
  };

  for (const event of events) {
    if (event.status === "pending" || event.status === "processing") {
      stats.pendingEvents++;
    } else if (event.status === "completed") {
      stats.completedEvents++;
    } else if (event.status === "failed") {
      stats.failedEvents++;
    }

    stats.personsCreated += event.personsCreated || 0;
    stats.interactionsCreated += event.interactionsCreated || 0;
    stats.commitmentsDetected += event.commitmentsDetected || 0;
  }

  return stats;
}

/**
 * Clean up old ingestion events (keep last 7 days)
 */
export async function cleanupOldIngestionEvents(
  userId: string,
  daysToKeep: number = 7
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);

  const result = await database
    .delete(ingestionEvent)
    .where(
      and(
        eq(ingestionEvent.userId, userId),
        sql`${ingestionEvent.createdAt} < ${cutoff}`
      )
    );

  return result.rowCount || 0;
}

import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { database } from "~/db";
import {
  interaction,
  person,
  type Interaction,
  type CreateInteractionData,
  type InteractionType,
  type CommunicationChannel,
  type Person,
} from "~/db/schema";

// ============================================================================
// Interaction CRUD
// ============================================================================

/**
 * Create a new interaction
 */
export async function createInteraction(
  data: CreateInteractionData
): Promise<Interaction> {
  const [newInteraction] = await database
    .insert(interaction)
    .values(data)
    .returning();

  return newInteraction;
}

/**
 * Create interaction and update person's last contact
 */
export async function createInteractionAndUpdatePerson(
  data: CreateInteractionData
): Promise<Interaction> {
  const newInteraction = await createInteraction(data);

  // Update the person's last contact info
  if (data.personId) {
    await database
      .update(person)
      .set({
        lastContactAt: data.occurredAt,
        lastContactChannel: data.channel,
        totalInteractions: sql`${person.totalInteractions} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(person.id, data.personId));
  }

  return newInteraction;
}

/**
 * Find interaction by ID
 */
export async function findInteractionById(
  id: string
): Promise<Interaction | null> {
  const [result] = await database
    .select()
    .from(interaction)
    .where(eq(interaction.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find interaction by source (for deduplication)
 */
export async function findInteractionBySource(
  sourceType: "email" | "calendar" | "manual",
  sourceId: string
): Promise<Interaction | null> {
  const [result] = await database
    .select()
    .from(interaction)
    .where(and(
      eq(interaction.sourceType, sourceType),
      eq(interaction.sourceId, sourceId)
    ))
    .limit(1);

  return result || null;
}

/**
 * Check if interaction exists by source
 */
export async function interactionExistsBySource(
  sourceType: "email" | "calendar" | "manual",
  sourceId: string
): Promise<boolean> {
  const result = await findInteractionBySource(sourceType, sourceId);
  return result !== null;
}

/**
 * Find all interactions for a user
 */
export async function findInteractionsByUserId(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<Interaction[]> {
  const results = await database
    .select()
    .from(interaction)
    .where(eq(interaction.userId, userId))
    .orderBy(desc(interaction.occurredAt))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Find interactions for a person
 */
export async function findInteractionsByPersonId(
  personId: string,
  limit: number = 20
): Promise<Interaction[]> {
  const results = await database
    .select()
    .from(interaction)
    .where(eq(interaction.personId, personId))
    .orderBy(desc(interaction.occurredAt))
    .limit(limit);

  return results;
}

/**
 * Find recent interactions for a person
 */
export async function findRecentInteractionsForPerson(
  personId: string,
  limit: number = 3
): Promise<Interaction[]> {
  return findInteractionsByPersonId(personId, limit);
}

/**
 * Find interactions by type
 */
export async function findInteractionsByType(
  userId: string,
  type: InteractionType,
  limit: number = 50
): Promise<Interaction[]> {
  const results = await database
    .select()
    .from(interaction)
    .where(and(
      eq(interaction.userId, userId),
      eq(interaction.type, type)
    ))
    .orderBy(desc(interaction.occurredAt))
    .limit(limit);

  return results;
}

/**
 * Find interactions since a date
 */
export async function findInteractionsSince(
  userId: string,
  since: Date,
  limit: number = 100
): Promise<Interaction[]> {
  const results = await database
    .select()
    .from(interaction)
    .where(and(
      eq(interaction.userId, userId),
      gte(interaction.occurredAt, since)
    ))
    .orderBy(desc(interaction.occurredAt))
    .limit(limit);

  return results;
}

/**
 * Delete an interaction
 */
export async function deleteInteraction(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(interaction)
    .where(eq(interaction.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Get interaction count for a user
 */
export async function getInteractionCount(userId: string): Promise<number> {
  const [result] = await database
    .select({ count: count() })
    .from(interaction)
    .where(eq(interaction.userId, userId));

  return result?.count || 0;
}

// ============================================================================
// Interaction with Person (joined queries)
// ============================================================================

export type InteractionWithPerson = Interaction & {
  person: Pick<Person, "id" | "name" | "email" | "company"> | null;
};

/**
 * Find interactions with person info
 */
export async function findInteractionsWithPerson(
  userId: string,
  limit: number = 50
): Promise<InteractionWithPerson[]> {
  const results = await database
    .select({
      id: interaction.id,
      userId: interaction.userId,
      personId: interaction.personId,
      type: interaction.type,
      channel: interaction.channel,
      direction: interaction.direction,
      subject: interaction.subject,
      summary: interaction.summary,
      sourceType: interaction.sourceType,
      sourceId: interaction.sourceId,
      occurredAt: interaction.occurredAt,
      createdAt: interaction.createdAt,
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        company: person.company,
      },
    })
    .from(interaction)
    .leftJoin(person, eq(interaction.personId, person.id))
    .where(eq(interaction.userId, userId))
    .orderBy(desc(interaction.occurredAt))
    .limit(limit);

  return results as InteractionWithPerson[];
}

// ============================================================================
// Analytics & Aggregations
// ============================================================================

export type InteractionStats = {
  totalInteractions: number;
  byType: Record<InteractionType, number>;
  byChannel: Record<CommunicationChannel, number>;
  byDirection: {
    inbound: number;
    outbound: number;
  };
};

/**
 * Get interaction statistics for a user
 */
export async function getInteractionStats(
  userId: string,
  since?: Date
): Promise<InteractionStats> {
  const conditions = [eq(interaction.userId, userId)];
  if (since) {
    conditions.push(gte(interaction.occurredAt, since));
  }

  // Get total count
  const [totalResult] = await database
    .select({ count: count() })
    .from(interaction)
    .where(and(...conditions));

  // Get counts by type
  const typeResults = await database
    .select({
      type: interaction.type,
      count: count(),
    })
    .from(interaction)
    .where(and(...conditions))
    .groupBy(interaction.type);

  // Get counts by channel
  const channelResults = await database
    .select({
      channel: interaction.channel,
      count: count(),
    })
    .from(interaction)
    .where(and(...conditions))
    .groupBy(interaction.channel);

  // Get counts by direction
  const directionResults = await database
    .select({
      direction: interaction.direction,
      count: count(),
    })
    .from(interaction)
    .where(and(...conditions))
    .groupBy(interaction.direction);

  const byType: Record<InteractionType, number> = {
    email: 0,
    meeting: 0,
    call: 0,
    message: 0,
    other: 0,
  };
  for (const row of typeResults) {
    byType[row.type as InteractionType] = row.count;
  }

  const byChannel: Record<CommunicationChannel, number> = {
    email: 0,
    slack: 0,
    phone: 0,
    meeting: 0,
    other: 0,
  };
  for (const row of channelResults) {
    byChannel[row.channel as CommunicationChannel] = row.count;
  }

  const byDirection = {
    inbound: 0,
    outbound: 0,
  };
  for (const row of directionResults) {
    if (row.direction === "inbound" || row.direction === "outbound") {
      byDirection[row.direction] = row.count;
    }
  }

  return {
    totalInteractions: totalResult?.count || 0,
    byType,
    byChannel,
    byDirection,
  };
}

/**
 * Get interaction frequency for a person (avg days between interactions)
 */
export async function getPersonInteractionFrequency(
  personId: string
): Promise<number | null> {
  const interactions = await database
    .select({
      occurredAt: interaction.occurredAt,
    })
    .from(interaction)
    .where(eq(interaction.personId, personId))
    .orderBy(desc(interaction.occurredAt));

  if (interactions.length < 2) {
    return null;
  }

  // Calculate average days between interactions
  let totalDays = 0;
  for (let i = 0; i < interactions.length - 1; i++) {
    const diff = interactions[i].occurredAt.getTime() - interactions[i + 1].occurredAt.getTime();
    totalDays += diff / (1000 * 60 * 60 * 24);
  }

  return Math.round(totalDays / (interactions.length - 1));
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Bulk create interactions (for import/sync)
 */
export async function bulkCreateInteractions(
  data: CreateInteractionData[]
): Promise<Interaction[]> {
  if (data.length === 0) return [];

  const created = await database
    .insert(interaction)
    .values(data)
    .returning();

  return created;
}

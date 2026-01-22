import { eq, desc, and, isNull } from 'drizzle-orm';
import { database } from './index.js';
import { dailyBrief, user, type DailyBrief, type EnrichedBriefData } from './schema.js';

/**
 * Get the latest brief for the first user (single-user mode)
 */
export async function getLatestBrief(): Promise<(DailyBrief & { user: { name: string; email: string } }) | null> {
  const result = await database
    .select({
      brief: dailyBrief,
      user: {
        name: user.name,
        email: user.email,
      },
    })
    .from(dailyBrief)
    .innerJoin(user, eq(dailyBrief.userId, user.id))
    .orderBy(desc(dailyBrief.briefDate))
    .limit(1);

  if (result.length === 0) return null;

  return {
    ...result[0].brief,
    user: result[0].user,
  };
}

/**
 * Get today's brief for the first user
 */
export async function getTodaysBrief(): Promise<(DailyBrief & { user: { name: string; email: string } }) | null> {
  const today = new Date().toISOString().split('T')[0];

  const result = await database
    .select({
      brief: dailyBrief,
      user: {
        name: user.name,
        email: user.email,
      },
    })
    .from(dailyBrief)
    .innerJoin(user, eq(dailyBrief.userId, user.id))
    .where(eq(dailyBrief.briefDate, today))
    .limit(1);

  if (result.length === 0) return null;

  return {
    ...result[0].brief,
    user: result[0].user,
  };
}

/**
 * Get a brief by ID
 */
export async function getBriefById(id: string): Promise<DailyBrief | null> {
  const result = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Update brief with enriched content
 */
export async function updateBriefEnrichment(
  id: string,
  enrichedContent: EnrichedBriefData
): Promise<DailyBrief | null> {
  const result = await database
    .update(dailyBrief)
    .set({
      enrichedContent,
      enrichedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dailyBrief.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Get briefs that need enrichment (completed but not enriched)
 */
export async function getBriefsNeedingEnrichment(limit: number = 5): Promise<DailyBrief[]> {
  return database
    .select()
    .from(dailyBrief)
    .where(
      and(
        eq(dailyBrief.status, 'completed'),
        isNull(dailyBrief.enrichedAt)
      )
    )
    .orderBy(desc(dailyBrief.briefDate))
    .limit(limit);
}

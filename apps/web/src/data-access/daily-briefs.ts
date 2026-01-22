import { eq, and, desc } from "drizzle-orm";
import { database } from "~/db";
import {
  dailyBrief,
  type DailyBrief,
  type CreateDailyBriefData,
  type UpdateDailyBriefData,
  type DailyBriefStatus,
  type CalendarEventData,
  type EmailData,
  type WeatherBriefData,
} from "~/db/schema";

/**
 * Create a new daily brief for a user
 */
export async function createDailyBrief(
  data: CreateDailyBriefData
): Promise<DailyBrief> {
  const [newBrief] = await database
    .insert(dailyBrief)
    .values(data)
    .returning();

  return newBrief;
}

/**
 * Find a daily brief by its ID
 */
export async function findDailyBriefById(
  id: string
): Promise<DailyBrief | null> {
  const [result] = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find a daily brief by user ID and date
 */
export async function findDailyBriefByUserAndDate(
  userId: string,
  briefDate: string
): Promise<DailyBrief | null> {
  const [result] = await database
    .select()
    .from(dailyBrief)
    .where(
      and(eq(dailyBrief.userId, userId), eq(dailyBrief.briefDate, briefDate))
    )
    .limit(1);

  return result || null;
}

/**
 * Find the latest daily brief for a user
 */
export async function findLatestDailyBrief(
  userId: string
): Promise<DailyBrief | null> {
  const [result] = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.userId, userId))
    .orderBy(desc(dailyBrief.briefDate))
    .limit(1);

  return result || null;
}

/**
 * Find all daily briefs for a user (most recent first)
 */
export async function findDailyBriefsByUserId(
  userId: string,
  limit: number = 30
): Promise<DailyBrief[]> {
  const results = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.userId, userId))
    .orderBy(desc(dailyBrief.briefDate))
    .limit(limit);

  return results;
}

/**
 * Update a daily brief by ID
 */
export async function updateDailyBrief(
  id: string,
  data: UpdateDailyBriefData
): Promise<DailyBrief | null> {
  const [updated] = await database
    .update(dailyBrief)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(dailyBrief.id, id))
    .returning();

  return updated || null;
}

/**
 * Update the status of a daily brief
 */
export async function updateDailyBriefStatus(
  id: string,
  status: DailyBriefStatus,
  errorMessage?: string
): Promise<DailyBrief | null> {
  const updateData: UpdateDailyBriefData = {
    status,
    errorMessage: status === "failed" ? errorMessage : null,
    generatedAt: status === "completed" ? new Date() : undefined,
  };

  return updateDailyBrief(id, updateData);
}

/**
 * Update calendar events for a daily brief
 */
export async function updateDailyBriefCalendarEvents(
  id: string,
  calendarEvents: CalendarEventData[],
  totalEvents: number
): Promise<DailyBrief | null> {
  return updateDailyBrief(id, {
    calendarEvents,
    totalEvents: String(totalEvents),
  });
}

/**
 * Update emails for a daily brief
 */
export async function updateDailyBriefEmails(
  id: string,
  emails: EmailData[],
  totalEmails: number,
  emailsNeedingResponse: number
): Promise<DailyBrief | null> {
  return updateDailyBrief(id, {
    emails,
    totalEmails: String(totalEmails),
    emailsNeedingResponse: String(emailsNeedingResponse),
  });
}

/**
 * Update the generated brief content
 */
export async function updateDailyBriefContent(
  id: string,
  briefContent: string
): Promise<DailyBrief | null> {
  return updateDailyBrief(id, {
    briefContent,
    status: "completed",
    generatedAt: new Date(),
  });
}

/**
 * Delete a daily brief by ID
 */
export async function deleteDailyBrief(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(dailyBrief)
    .where(eq(dailyBrief.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Delete all daily briefs for a user
 */
export async function deleteDailyBriefsByUserId(
  userId: string
): Promise<number> {
  const deleted = await database
    .delete(dailyBrief)
    .where(eq(dailyBrief.userId, userId))
    .returning();

  return deleted.length;
}

/**
 * Upsert a daily brief - create if not exists for the date, update if exists
 */
export async function upsertDailyBrief(
  userId: string,
  briefDate: string,
  data: Omit<CreateDailyBriefData, "userId" | "briefDate">
): Promise<DailyBrief> {
  const existing = await findDailyBriefByUserAndDate(userId, briefDate);

  if (existing) {
    const updated = await updateDailyBrief(existing.id, {
      calendarEvents: data.calendarEvents,
      emails: data.emails,
      weather: data.weather,
      briefContent: data.briefContent,
      status: data.status,
      errorMessage: data.errorMessage,
      totalEvents: data.totalEvents,
      totalEmails: data.totalEmails,
      emailsNeedingResponse: data.emailsNeedingResponse,
      generatedAt: data.generatedAt,
    });
    return updated!;
  }

  return createDailyBrief({
    ...data,
    userId,
    briefDate,
  });
}

/**
 * Find all pending daily briefs that need to be generated
 */
export async function findPendingDailyBriefs(): Promise<DailyBrief[]> {
  const results = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.status, "pending"));

  return results;
}

/**
 * Find all failed daily briefs (for retry logic)
 */
export async function findFailedDailyBriefs(): Promise<DailyBrief[]> {
  const results = await database
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.status, "failed"));

  return results;
}

/**
 * Check if a daily brief exists for a user and date
 */
export async function hasDailyBriefForDate(
  userId: string,
  briefDate: string
): Promise<boolean> {
  const brief = await findDailyBriefByUserAndDate(userId, briefDate);
  return brief !== null;
}

/**
 * Get the count of emails needing response from the latest brief
 */
export async function getEmailsNeedingResponseCount(
  userId: string
): Promise<number> {
  const latestBrief = await findLatestDailyBrief(userId);
  if (!latestBrief || !latestBrief.emailsNeedingResponse) {
    return 0;
  }
  return parseInt(latestBrief.emailsNeedingResponse, 10) || 0;
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Find or create today's brief for a user
 */
export async function findOrCreateTodaysBrief(
  userId: string
): Promise<DailyBrief> {
  const today = getTodayDateString();
  const existing = await findDailyBriefByUserAndDate(userId, today);

  if (existing) {
    return existing;
  }

  return createDailyBrief({
    id: crypto.randomUUID(),
    userId,
    briefDate: today,
    status: "pending",
  });
}

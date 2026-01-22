import { eq, and, desc, gte, lte, lt, isNull } from 'drizzle-orm';
import { database } from '~/db';
import {
  meetingBriefing,
  type MeetingBriefing,
  type CreateMeetingBriefingData,
  type UpdateMeetingBriefingData,
  type MeetingBriefingStatus,
} from '~/db/schema';

// ============================================================================
// Meeting Briefing CRUD
// ============================================================================

/**
 * Create a new meeting briefing
 */
export async function createMeetingBriefing(
  data: CreateMeetingBriefingData
): Promise<MeetingBriefing> {
  const [newBriefing] = await database.insert(meetingBriefing).values(data).returning();

  return newBriefing;
}

/**
 * Find meeting briefing by ID
 */
export async function findMeetingBriefingById(id: string): Promise<MeetingBriefing | null> {
  const [result] = await database
    .select()
    .from(meetingBriefing)
    .where(eq(meetingBriefing.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find meeting briefing by user and calendar event
 */
export async function findMeetingBriefingByEventId(
  userId: string,
  calendarEventId: string
): Promise<MeetingBriefing | null> {
  const [result] = await database
    .select()
    .from(meetingBriefing)
    .where(
      and(eq(meetingBriefing.userId, userId), eq(meetingBriefing.calendarEventId, calendarEventId))
    )
    .limit(1);

  return result || null;
}

/**
 * Find or create meeting briefing for an event
 */
export async function findOrCreateMeetingBriefing(
  data: CreateMeetingBriefingData
): Promise<MeetingBriefing> {
  const existing = await findMeetingBriefingByEventId(data.userId, data.calendarEventId);

  if (existing) {
    return existing;
  }

  return createMeetingBriefing(data);
}

/**
 * Find all meeting briefings for a user
 */
export async function findMeetingBriefingsByUserId(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<MeetingBriefing[]> {
  const results = await database
    .select()
    .from(meetingBriefing)
    .where(eq(meetingBriefing.userId, userId))
    .orderBy(desc(meetingBriefing.meetingStartTime))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Find upcoming meeting briefings
 */
export async function findUpcomingMeetingBriefings(
  userId: string,
  hoursAhead: number = 24
): Promise<MeetingBriefing[]> {
  const now = new Date();
  const future = new Date();
  future.setHours(future.getHours() + hoursAhead);

  const results = await database
    .select()
    .from(meetingBriefing)
    .where(
      and(
        eq(meetingBriefing.userId, userId),
        gte(meetingBriefing.meetingStartTime, now),
        lte(meetingBriefing.meetingStartTime, future)
      )
    )
    .orderBy(meetingBriefing.meetingStartTime);

  return results;
}

/**
 * Find meetings that need briefings generated (within X minutes, pending status)
 */
export async function findMeetingsNeedingBriefings(
  minutesBefore: number = 30
): Promise<MeetingBriefing[]> {
  const now = new Date();
  const targetTime = new Date();
  targetTime.setMinutes(targetTime.getMinutes() + minutesBefore);

  const results = await database
    .select()
    .from(meetingBriefing)
    .where(
      and(
        eq(meetingBriefing.status, 'pending'),
        gte(meetingBriefing.meetingStartTime, now),
        lte(meetingBriefing.meetingStartTime, targetTime)
      )
    )
    .orderBy(meetingBriefing.meetingStartTime);

  return results;
}

/**
 * Find meetings that need notifications sent (briefing ready, no notification yet)
 */
export async function findBriefingsNeedingNotification(
  minutesBefore: number = 15
): Promise<MeetingBriefing[]> {
  const now = new Date();
  const targetTime = new Date();
  targetTime.setMinutes(targetTime.getMinutes() + minutesBefore);

  const results = await database
    .select()
    .from(meetingBriefing)
    .where(
      and(
        eq(meetingBriefing.status, 'completed'),
        isNull(meetingBriefing.notificationSentAt),
        gte(meetingBriefing.meetingStartTime, now),
        lte(meetingBriefing.meetingStartTime, targetTime)
      )
    )
    .orderBy(meetingBriefing.meetingStartTime);

  return results;
}

/**
 * Find today's meeting briefings for a user
 */
export async function findTodaysMeetingBriefings(userId: string): Promise<MeetingBriefing[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const results = await database
    .select()
    .from(meetingBriefing)
    .where(
      and(
        eq(meetingBriefing.userId, userId),
        gte(meetingBriefing.meetingStartTime, today),
        lt(meetingBriefing.meetingStartTime, tomorrow)
      )
    )
    .orderBy(meetingBriefing.meetingStartTime);

  return results;
}

/**
 * Update a meeting briefing
 */
export async function updateMeetingBriefing(
  id: string,
  data: UpdateMeetingBriefingData
): Promise<MeetingBriefing | null> {
  const [updated] = await database
    .update(meetingBriefing)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(meetingBriefing.id, id))
    .returning();

  return updated || null;
}

/**
 * Update meeting briefing status
 */
export async function updateMeetingBriefingStatus(
  id: string,
  status: MeetingBriefingStatus,
  errorMessage?: string
): Promise<MeetingBriefing | null> {
  const updateData: UpdateMeetingBriefingData = {
    status,
    errorMessage: status === 'failed' ? errorMessage : null,
  };

  if (status === 'completed') {
    updateData.generatedAt = new Date();
  }

  return updateMeetingBriefing(id, updateData);
}

/**
 * Mark briefing notification as sent
 */
export async function markBriefingNotificationSent(id: string): Promise<MeetingBriefing | null> {
  return updateMeetingBriefing(id, {
    notificationSentAt: new Date(),
  });
}

/**
 * Delete a meeting briefing
 */
export async function deleteMeetingBriefing(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(meetingBriefing)
    .where(eq(meetingBriefing.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Delete old meeting briefings (cleanup)
 */
export async function deleteOldMeetingBriefings(userId: string, olderThan: Date): Promise<number> {
  const deleted = await database
    .delete(meetingBriefing)
    .where(and(eq(meetingBriefing.userId, userId), lt(meetingBriefing.meetingStartTime, olderThan)))
    .returning();

  return deleted.length;
}

// ============================================================================
// Upsert Operations
// ============================================================================

/**
 * Upsert a meeting briefing (create or update)
 */
export async function upsertMeetingBriefing(
  userId: string,
  calendarEventId: string,
  data: Omit<CreateMeetingBriefingData, 'userId' | 'calendarEventId'>
): Promise<MeetingBriefing> {
  const existing = await findMeetingBriefingByEventId(userId, calendarEventId);

  if (existing) {
    const updated = await updateMeetingBriefing(existing.id, data);
    return updated!;
  }

  return createMeetingBriefing({
    id: crypto.randomUUID(),
    userId,
    calendarEventId,
    ...data,
  });
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Create meeting briefings for multiple events
 */
export async function createMeetingBriefingsForEvents(
  userId: string,
  events: Array<{
    calendarEventId: string;
    meetingTitle: string;
    meetingStartTime: Date;
    meetingEndTime: Date;
    meetingLocation?: string;
    meetingLink?: string;
  }>
): Promise<MeetingBriefing[]> {
  const results: MeetingBriefing[] = [];

  for (const event of events) {
    const briefing = await findOrCreateMeetingBriefing({
      id: crypto.randomUUID(),
      userId,
      calendarEventId: event.calendarEventId,
      meetingTitle: event.meetingTitle,
      meetingStartTime: event.meetingStartTime,
      meetingEndTime: event.meetingEndTime,
      meetingLocation: event.meetingLocation,
      meetingLink: event.meetingLink,
      status: 'pending',
    });

    results.push(briefing);
  }

  return results;
}

/**
 * Get briefing status summary for upcoming meetings
 */
export async function getBriefingStatusSummary(
  userId: string,
  hoursAhead: number = 24
): Promise<{
  total: number;
  pending: number;
  generating: number;
  completed: number;
  failed: number;
}> {
  const briefings = await findUpcomingMeetingBriefings(userId, hoursAhead);

  const summary = {
    total: briefings.length,
    pending: 0,
    generating: 0,
    completed: 0,
    failed: 0,
  };

  for (const briefing of briefings) {
    summary[briefing.status]++;
  }

  return summary;
}

import { eq, and, desc, asc, lt, lte, gte, or, sql, count, isNull, ilike } from 'drizzle-orm';
import { database } from '~/db';
import {
  commitment,
  commitmentReminder,
  person,
  type Commitment,
  type CreateCommitmentData,
  type UpdateCommitmentData,
  type CommitmentStatus,
  type CommitmentReminder,
  type CreateCommitmentReminderData,
  type Person,
} from '~/db/schema';

// ============================================================================
// Commitment CRUD
// ============================================================================

/**
 * Create a new commitment
 */
export async function createCommitment(data: CreateCommitmentData): Promise<Commitment> {
  const [newCommitment] = await database.insert(commitment).values(data).returning();

  return newCommitment;
}

/**
 * Find commitment by ID
 */
export async function findCommitmentById(id: string): Promise<Commitment | null> {
  const [result] = await database.select().from(commitment).where(eq(commitment.id, id)).limit(1);

  return result || null;
}

/**
 * Find all commitments for a user
 */
export async function findCommitmentsByUserId(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<Commitment[]> {
  const results = await database
    .select()
    .from(commitment)
    .where(eq(commitment.userId, userId))
    .orderBy(asc(commitment.dueDate), desc(commitment.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Find open commitments (pending or in_progress)
 */
export async function findOpenCommitments(
  userId: string,
  limit: number = 50
): Promise<Commitment[]> {
  const results = await database
    .select()
    .from(commitment)
    .where(
      and(
        eq(commitment.userId, userId),
        or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress'))
      )
    )
    .orderBy(asc(commitment.dueDate), desc(commitment.createdAt))
    .limit(limit);

  return results;
}

/**
 * Find commitments user owes to others
 */
export async function findCommitmentsUserOwes(
  userId: string,
  includeCompleted: boolean = false,
  limit: number = 50
): Promise<Commitment[]> {
  const conditions = [eq(commitment.userId, userId), eq(commitment.direction, 'user_owes')];

  if (!includeCompleted) {
    conditions.push(
      or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress')) as any
    );
  }

  const results = await database
    .select()
    .from(commitment)
    .where(and(...conditions))
    .orderBy(asc(commitment.dueDate))
    .limit(limit);

  return results;
}

/**
 * Find commitments others owe to user
 */
export async function findCommitmentsOwedToUser(
  userId: string,
  includeCompleted: boolean = false,
  limit: number = 50
): Promise<Commitment[]> {
  const conditions = [eq(commitment.userId, userId), eq(commitment.direction, 'they_owe')];

  if (!includeCompleted) {
    conditions.push(
      or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress')) as any
    );
  }

  const results = await database
    .select()
    .from(commitment)
    .where(and(...conditions))
    .orderBy(asc(commitment.dueDate))
    .limit(limit);

  return results;
}

/**
 * Find commitments due today
 */
export async function findCommitmentsDueToday(userId: string): Promise<Commitment[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const results = await database
    .select()
    .from(commitment)
    .where(
      and(
        eq(commitment.userId, userId),
        gte(commitment.dueDate, today),
        lt(commitment.dueDate, tomorrow),
        or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress'))
      )
    )
    .orderBy(asc(commitment.dueDate));

  return results;
}

/**
 * Find overdue commitments
 */
export async function findOverdueCommitments(userId: string): Promise<Commitment[]> {
  const now = new Date();

  const results = await database
    .select()
    .from(commitment)
    .where(
      and(
        eq(commitment.userId, userId),
        lt(commitment.dueDate, now),
        or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress'))
      )
    )
    .orderBy(asc(commitment.dueDate));

  return results;
}

/**
 * Find commitments due in the next X days
 */
export async function findUpcomingCommitments(
  userId: string,
  daysAhead: number = 7
): Promise<Commitment[]> {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + daysAhead);

  const results = await database
    .select()
    .from(commitment)
    .where(
      and(
        eq(commitment.userId, userId),
        gte(commitment.dueDate, now),
        lte(commitment.dueDate, future),
        or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress'))
      )
    )
    .orderBy(asc(commitment.dueDate));

  return results;
}

/**
 * Find commitments for a specific person
 */
export async function findCommitmentsByPersonId(
  personId: string,
  includeCompleted: boolean = false
): Promise<Commitment[]> {
  const conditions = [eq(commitment.personId, personId)];

  if (!includeCompleted) {
    conditions.push(
      or(eq(commitment.status, 'pending'), eq(commitment.status, 'in_progress')) as any
    );
  }

  const results = await database
    .select()
    .from(commitment)
    .where(and(...conditions))
    .orderBy(asc(commitment.dueDate));

  return results;
}

/**
 * Update a commitment
 */
export async function updateCommitment(
  id: string,
  data: UpdateCommitmentData
): Promise<Commitment | null> {
  const [updated] = await database
    .update(commitment)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(commitment.id, id))
    .returning();

  return updated || null;
}

/**
 * Update commitment status
 */
export async function updateCommitmentStatus(
  id: string,
  status: CommitmentStatus,
  completionEvidence?: string
): Promise<Commitment | null> {
  const updateData: UpdateCommitmentData = { status };

  if (status === 'completed') {
    updateData.completedAt = new Date();
    if (completionEvidence) {
      updateData.completionEvidence = completionEvidence;
    }
  }

  return updateCommitment(id, updateData);
}

/**
 * Delete a commitment
 */
export async function deleteCommitment(id: string): Promise<boolean> {
  const [deleted] = await database.delete(commitment).where(eq(commitment.id, id)).returning();

  return deleted !== undefined;
}

/**
 * Get commitment counts by status for a user
 */
export async function getCommitmentCountsByStatus(
  userId: string
): Promise<Record<CommitmentStatus, number>> {
  const results = await database
    .select({
      status: commitment.status,
      count: count(),
    })
    .from(commitment)
    .where(eq(commitment.userId, userId))
    .groupBy(commitment.status);

  const counts: Record<CommitmentStatus, number> = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
  };

  for (const row of results) {
    counts[row.status as CommitmentStatus] = row.count;
  }

  return counts;
}

// ============================================================================
// Commitment with Person (joined queries)
// ============================================================================

export type CommitmentWithPerson = Commitment & {
  person: Pick<Person, 'id' | 'name' | 'email' | 'company' | 'domain'> | null;
};

/**
 * Find commitments with person info
 */
export async function findCommitmentsWithPerson(
  userId: string,
  options: {
    direction?: 'user_owes' | 'they_owe';
    status?: CommitmentStatus[];
    limit?: number;
    searchQuery?: string;
    overdue?: boolean;
  } = {}
): Promise<CommitmentWithPerson[]> {
  const { direction, status, limit = 50, searchQuery, overdue } = options;

  const conditions = [eq(commitment.userId, userId)];

  if (direction) {
    conditions.push(eq(commitment.direction, direction));
  }

  if (status && status.length > 0) {
    conditions.push(or(...status.map((s) => eq(commitment.status, s))) as any);
  }

  if (searchQuery) {
    conditions.push(ilike(commitment.description, `%${searchQuery}%`));
  }

  if (overdue) {
    // Due date is before now and not completed/cancelled
    conditions.push(lt(commitment.dueDate, new Date()));
  }

  const results = await database
    .select({
      id: commitment.id,
      userId: commitment.userId,
      personId: commitment.personId,
      description: commitment.description,
      direction: commitment.direction,
      status: commitment.status,
      promisedAt: commitment.promisedAt,
      dueDate: commitment.dueDate,
      completedAt: commitment.completedAt,
      completionEvidence: commitment.completionEvidence,
      sourceType: commitment.sourceType,
      sourceId: commitment.sourceId,
      priority: commitment.priority,
      createdAt: commitment.createdAt,
      updatedAt: commitment.updatedAt,
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        company: person.company,
        domain: person.domain,
      },
    })
    .from(commitment)
    .leftJoin(person, eq(commitment.personId, person.id))
    .where(and(...conditions))
    .orderBy(asc(commitment.dueDate))
    .limit(limit);

  return results as CommitmentWithPerson[];
}

// ============================================================================
// Commitment Reminders
// ============================================================================

/**
 * Create a commitment reminder
 */
export async function createCommitmentReminder(
  data: CreateCommitmentReminderData
): Promise<CommitmentReminder> {
  const [newReminder] = await database.insert(commitmentReminder).values(data).returning();

  return newReminder;
}

/**
 * Create default reminders for a commitment
 */
export async function createDefaultReminders(
  commitmentId: string,
  dueDate: Date
): Promise<CommitmentReminder[]> {
  const reminders: CreateCommitmentReminderData[] = [];

  // 3 days before
  const threeDaysBefore = new Date(dueDate);
  threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);
  if (threeDaysBefore > new Date()) {
    reminders.push({
      id: crypto.randomUUID(),
      commitmentId,
      remindAt: threeDaysBefore,
      reminderType: 'before_due',
      daysOffset: 3,
    });
  }

  // 1 day before
  const oneDayBefore = new Date(dueDate);
  oneDayBefore.setDate(oneDayBefore.getDate() - 1);
  if (oneDayBefore > new Date()) {
    reminders.push({
      id: crypto.randomUUID(),
      commitmentId,
      remindAt: oneDayBefore,
      reminderType: 'before_due',
      daysOffset: 1,
    });
  }

  // Day of
  if (dueDate > new Date()) {
    reminders.push({
      id: crypto.randomUUID(),
      commitmentId,
      remindAt: dueDate,
      reminderType: 'before_due',
      daysOffset: 0,
    });
  }

  if (reminders.length === 0) {
    return [];
  }

  const created = await database.insert(commitmentReminder).values(reminders).returning();

  return created;
}

/**
 * Find pending reminders that need to be sent
 */
export async function findPendingReminders(
  before: Date = new Date()
): Promise<CommitmentReminder[]> {
  const results = await database
    .select()
    .from(commitmentReminder)
    .where(and(eq(commitmentReminder.isSent, false), lte(commitmentReminder.remindAt, before)))
    .orderBy(asc(commitmentReminder.remindAt));

  return results;
}

/**
 * Mark reminder as sent
 */
export async function markReminderAsSent(id: string): Promise<CommitmentReminder | null> {
  const [updated] = await database
    .update(commitmentReminder)
    .set({
      isSent: true,
      sentAt: new Date(),
    })
    .where(eq(commitmentReminder.id, id))
    .returning();

  return updated || null;
}

/**
 * Delete reminders for a commitment
 */
export async function deleteCommitmentReminders(commitmentId: string): Promise<number> {
  const deleted = await database
    .delete(commitmentReminder)
    .where(eq(commitmentReminder.commitmentId, commitmentId))
    .returning();

  return deleted.length;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a commitment is overdue
 */
export function isCommitmentOverdue(commitment: Commitment): boolean {
  if (!commitment.dueDate) return false;
  if (commitment.status === 'completed' || commitment.status === 'cancelled') {
    return false;
  }
  return commitment.dueDate < new Date();
}

/**
 * Get days until/since due date
 */
export function getDaysFromDueDate(commitment: Commitment): number | null {
  if (!commitment.dueDate) return null;

  const now = new Date();
  const dueDate = new Date(commitment.dueDate);
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Format commitment for daily digest
 */
export function formatCommitmentForDigest(commitment: Commitment, personName?: string): string {
  const daysFromDue = getDaysFromDueDate(commitment);
  let duePart = '';

  if (daysFromDue !== null) {
    if (daysFromDue < 0) {
      duePart = ` (${Math.abs(daysFromDue)} days overdue)`;
    } else if (daysFromDue === 0) {
      duePart = ' (due today)';
    } else if (daysFromDue === 1) {
      duePart = ' (due tomorrow)';
    } else {
      duePart = ` (due in ${daysFromDue} days)`;
    }
  }

  const personPart = personName ? ` → ${personName}` : '';

  return `${commitment.description}${personPart}${duePart}`;
}

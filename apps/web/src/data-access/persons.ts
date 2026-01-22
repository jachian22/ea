import { eq, and, desc, asc, ilike, or, lt, sql, count } from "drizzle-orm";
import { database } from "~/db";
import {
  person,
  interaction,
  commitment,
  type Person,
  type CreatePersonData,
  type UpdatePersonData,
  type PersonDomain,
  type CommunicationChannel,
} from "~/db/schema";

// ============================================================================
// Person CRUD
// ============================================================================

/**
 * Create a new person
 */
export async function createPerson(
  data: CreatePersonData
): Promise<Person> {
  const [newPerson] = await database
    .insert(person)
    .values({
      ...data,
      firstContactAt: data.firstContactAt || new Date(),
    })
    .returning();

  return newPerson;
}

/**
 * Find person by ID
 */
export async function findPersonById(
  id: string
): Promise<Person | null> {
  const [result] = await database
    .select()
    .from(person)
    .where(eq(person.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find person by user ID and email
 */
export async function findPersonByUserIdAndEmail(
  userId: string,
  email: string
): Promise<Person | null> {
  const [result] = await database
    .select()
    .from(person)
    .where(and(
      eq(person.userId, userId),
      ilike(person.email, email) // case-insensitive
    ))
    .limit(1);

  return result || null;
}

/**
 * Find or create a person by email
 */
export async function findOrCreatePerson(
  userId: string,
  email: string,
  data?: Partial<CreatePersonData>
): Promise<Person> {
  const existing = await findPersonByUserIdAndEmail(userId, email);
  if (existing) {
    return existing;
  }

  return createPerson({
    id: crypto.randomUUID(),
    userId,
    email,
    name: data?.name,
    role: data?.role,
    company: data?.company,
    domain: data?.domain || "business",
    ...data,
  });
}

/**
 * Find all persons for a user
 */
export async function findPersonsByUserId(
  userId: string,
  limit: number = 100,
  offset: number = 0
): Promise<Person[]> {
  const results = await database
    .select()
    .from(person)
    .where(eq(person.userId, userId))
    .orderBy(desc(person.importanceScore), desc(person.lastContactAt))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Find persons by domain
 */
export async function findPersonsByDomain(
  userId: string,
  domain: PersonDomain,
  limit: number = 50
): Promise<Person[]> {
  const results = await database
    .select()
    .from(person)
    .where(and(
      eq(person.userId, userId),
      eq(person.domain, domain)
    ))
    .orderBy(desc(person.importanceScore))
    .limit(limit);

  return results;
}

/**
 * Search persons by name or email
 */
export async function searchPersons(
  userId: string,
  query: string,
  limit: number = 20
): Promise<Person[]> {
  const searchPattern = `%${query}%`;

  const results = await database
    .select()
    .from(person)
    .where(and(
      eq(person.userId, userId),
      or(
        ilike(person.name, searchPattern),
        ilike(person.email, searchPattern),
        ilike(person.company, searchPattern)
      )
    ))
    .orderBy(desc(person.importanceScore))
    .limit(limit);

  return results;
}

/**
 * Find persons not contacted in X days
 */
export async function findStaleContacts(
  userId: string,
  daysThreshold: number = 30,
  limit: number = 20
): Promise<Person[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

  const results = await database
    .select()
    .from(person)
    .where(and(
      eq(person.userId, userId),
      lt(person.lastContactAt, cutoffDate)
    ))
    .orderBy(desc(person.importanceScore), asc(person.lastContactAt))
    .limit(limit);

  return results;
}

/**
 * Get high importance persons
 */
export async function findHighImportancePersons(
  userId: string,
  minScore: number = 70,
  limit: number = 20
): Promise<Person[]> {
  const results = await database
    .select()
    .from(person)
    .where(and(
      eq(person.userId, userId),
      sql`${person.importanceScore} >= ${minScore}`
    ))
    .orderBy(desc(person.importanceScore))
    .limit(limit);

  return results;
}

/**
 * Update a person
 */
export async function updatePerson(
  id: string,
  data: UpdatePersonData
): Promise<Person | null> {
  const [updated] = await database
    .update(person)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(person.id, id))
    .returning();

  return updated || null;
}

/**
 * Update person's last contact info
 */
export async function updatePersonLastContact(
  id: string,
  channel: CommunicationChannel,
  contactAt: Date = new Date()
): Promise<Person | null> {
  // Get current person to increment interaction count
  const currentPerson = await findPersonById(id);
  if (!currentPerson) return null;

  const newInteractionCount = (currentPerson.totalInteractions || 0) + 1;

  // Recalculate importance score based on interaction frequency
  const newImportanceScore = calculateImportanceScore(currentPerson, newInteractionCount);

  return updatePerson(id, {
    lastContactAt: contactAt,
    lastContactChannel: channel,
    totalInteractions: newInteractionCount,
    importanceScore: newImportanceScore,
  });
}

/**
 * Delete a person
 */
export async function deletePerson(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(person)
    .where(eq(person.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Get person count for a user
 */
export async function getPersonCount(userId: string): Promise<number> {
  const [result] = await database
    .select({ count: count() })
    .from(person)
    .where(eq(person.userId, userId));

  return result?.count || 0;
}

// ============================================================================
// Person Dossier (Full Profile with Related Data)
// ============================================================================

export type PersonDossier = Person & {
  recentInteractions: Array<{
    id: string;
    type: string;
    channel: string;
    subject: string | null;
    summary: string | null;
    occurredAt: Date;
  }>;
  openCommitmentsYouOwe: Array<{
    id: string;
    description: string;
    dueDate: Date | null;
    status: string;
  }>;
  openCommitmentsTheyOwe: Array<{
    id: string;
    description: string;
    dueDate: Date | null;
    status: string;
  }>;
  completedCommitments: Array<{
    id: string;
    description: string;
    direction: string;
    completedAt: Date | null;
  }>;
  interactionStats: {
    totalInteractions: number;
    firstContactAt: Date | null;
    lastContactAt: Date | null;
    averageFrequencyDays: number | null;
  };
};

/**
 * Get full person dossier with related data
 */
export async function getPersonDossier(
  personId: string
): Promise<PersonDossier | null> {
  const personData = await findPersonById(personId);
  if (!personData) return null;

  // Get recent interactions
  const recentInteractions = await database
    .select({
      id: interaction.id,
      type: interaction.type,
      channel: interaction.channel,
      subject: interaction.subject,
      summary: interaction.summary,
      occurredAt: interaction.occurredAt,
    })
    .from(interaction)
    .where(eq(interaction.personId, personId))
    .orderBy(desc(interaction.occurredAt))
    .limit(10);

  // Get open commitments user owes
  const openCommitmentsYouOwe = await database
    .select({
      id: commitment.id,
      description: commitment.description,
      dueDate: commitment.dueDate,
      status: commitment.status,
    })
    .from(commitment)
    .where(and(
      eq(commitment.personId, personId),
      eq(commitment.direction, "user_owes"),
      or(
        eq(commitment.status, "pending"),
        eq(commitment.status, "in_progress")
      )
    ))
    .orderBy(asc(commitment.dueDate));

  // Get open commitments they owe
  const openCommitmentsTheyOwe = await database
    .select({
      id: commitment.id,
      description: commitment.description,
      dueDate: commitment.dueDate,
      status: commitment.status,
    })
    .from(commitment)
    .where(and(
      eq(commitment.personId, personId),
      eq(commitment.direction, "they_owe"),
      or(
        eq(commitment.status, "pending"),
        eq(commitment.status, "in_progress")
      )
    ))
    .orderBy(asc(commitment.dueDate));

  // Get recently completed commitments
  const completedCommitments = await database
    .select({
      id: commitment.id,
      description: commitment.description,
      direction: commitment.direction,
      completedAt: commitment.completedAt,
    })
    .from(commitment)
    .where(and(
      eq(commitment.personId, personId),
      eq(commitment.status, "completed")
    ))
    .orderBy(desc(commitment.completedAt))
    .limit(5);

  // Calculate interaction stats
  const averageFrequencyDays = personData.totalInteractions && personData.firstContactAt
    ? Math.round(
        (Date.now() - personData.firstContactAt.getTime()) /
        (1000 * 60 * 60 * 24) /
        personData.totalInteractions
      )
    : null;

  return {
    ...personData,
    recentInteractions,
    openCommitmentsYouOwe,
    openCommitmentsTheyOwe,
    completedCommitments,
    interactionStats: {
      totalInteractions: personData.totalInteractions || 0,
      firstContactAt: personData.firstContactAt,
      lastContactAt: personData.lastContactAt,
      averageFrequencyDays,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate importance score based on various factors
 */
function calculateImportanceScore(person: Person, newInteractionCount: number): number {
  let score = person.importanceScore || 50;

  // Increase score based on interaction frequency
  if (newInteractionCount > 50) {
    score = Math.min(100, score + 2);
  } else if (newInteractionCount > 20) {
    score = Math.min(100, score + 1);
  }

  // Boost for business contacts
  if (person.domain === "business" || person.domain === "job") {
    score = Math.min(100, score + 5);
  }

  // Boost for family
  if (person.domain === "family") {
    score = Math.min(100, score + 10);
  }

  return Math.round(score);
}

/**
 * Bulk update persons from email/calendar data
 */
export async function upsertPersonsFromEmails(
  userId: string,
  emails: Array<{ email: string; name?: string }>
): Promise<Person[]> {
  const results: Person[] = [];

  for (const emailData of emails) {
    const person = await findOrCreatePerson(userId, emailData.email, {
      name: emailData.name,
    });

    // Update name if we now have one and didn't before
    if (emailData.name && !person.name) {
      const updated = await updatePerson(person.id, { name: emailData.name });
      if (updated) {
        results.push(updated);
        continue;
      }
    }

    results.push(person);
  }

  return results;
}

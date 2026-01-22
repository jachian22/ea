import { eq, and, desc } from 'drizzle-orm';
import { database } from '~/db';
import {
  relationship,
  person,
  type Relationship,
  type CreateRelationshipData,
  type UpdateRelationshipData,
  type RelationType,
} from '~/db/schema';

// ============================================================================
// Relationship CRUD
// ============================================================================

/**
 * Create a new relationship
 */
export async function createRelationship(data: CreateRelationshipData): Promise<Relationship> {
  const [newRelationship] = await database.insert(relationship).values(data).returning();

  return newRelationship;
}

/**
 * Find relationship by ID
 */
export async function findRelationshipById(id: string): Promise<Relationship | null> {
  const [result] = await database
    .select()
    .from(relationship)
    .where(eq(relationship.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find relationship between user and person
 */
export async function findRelationshipByUserAndPerson(
  userId: string,
  personId: string
): Promise<Relationship | null> {
  const [result] = await database
    .select()
    .from(relationship)
    .where(and(eq(relationship.userId, userId), eq(relationship.personId, personId)))
    .limit(1);

  return result || null;
}

/**
 * Find all relationships for a user
 */
export async function findRelationshipsByUserId(
  userId: string,
  limit: number = 100
): Promise<Relationship[]> {
  const results = await database
    .select()
    .from(relationship)
    .where(eq(relationship.userId, userId))
    .orderBy(desc(relationship.createdAt))
    .limit(limit);

  return results;
}

/**
 * Find relationships by type
 */
export async function findRelationshipsByType(
  userId: string,
  relationType: RelationType
): Promise<Relationship[]> {
  const results = await database
    .select()
    .from(relationship)
    .where(and(eq(relationship.userId, userId), eq(relationship.relationType, relationType)))
    .orderBy(desc(relationship.createdAt));

  return results;
}

/**
 * Find relationships for a person (with person data)
 */
export async function findRelationshipsForPerson(personId: string): Promise<Relationship[]> {
  const results = await database
    .select()
    .from(relationship)
    .where(eq(relationship.personId, personId));

  return results;
}

/**
 * Find or create a relationship
 */
export async function findOrCreateRelationship(
  userId: string,
  personId: string,
  relationType: RelationType,
  notes?: string
): Promise<Relationship> {
  const existing = await findRelationshipByUserAndPerson(userId, personId);
  if (existing) {
    return existing;
  }

  return createRelationship({
    id: crypto.randomUUID(),
    userId,
    personId,
    relationType,
    notes,
  });
}

/**
 * Update a relationship
 */
export async function updateRelationship(
  id: string,
  data: UpdateRelationshipData
): Promise<Relationship | null> {
  const [updated] = await database
    .update(relationship)
    .set(data)
    .where(eq(relationship.id, id))
    .returning();

  return updated || null;
}

/**
 * Delete a relationship
 */
export async function deleteRelationship(id: string): Promise<boolean> {
  const [deleted] = await database.delete(relationship).where(eq(relationship.id, id)).returning();

  return deleted !== undefined;
}

// ============================================================================
// Relationship with Person Data
// ============================================================================

export type RelationshipWithPerson = Relationship & {
  person: {
    id: string;
    name: string | null;
    email: string;
    company: string | null;
    role: string | null;
    domain: string | null;
  };
};

/**
 * Get relationships with person details for a user
 */
export async function getRelationshipsWithPersons(
  userId: string,
  relationType?: RelationType
): Promise<RelationshipWithPerson[]> {
  // Build conditions array
  const conditions = [eq(relationship.userId, userId)];
  if (relationType) {
    conditions.push(eq(relationship.relationType, relationType));
  }

  const results = await database
    .select({
      id: relationship.id,
      userId: relationship.userId,
      personId: relationship.personId,
      relationType: relationship.relationType,
      notes: relationship.notes,
      metadata: relationship.metadata,
      createdAt: relationship.createdAt,
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        company: person.company,
        role: person.role,
        domain: person.domain,
      },
    })
    .from(relationship)
    .innerJoin(person, eq(relationship.personId, person.id))
    .where(and(...conditions))
    .orderBy(desc(relationship.createdAt));

  return results as RelationshipWithPerson[];
}

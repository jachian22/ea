/**
 * Person Resolver Service
 *
 * Handles deduplication and merging of person records extracted
 * from emails and calendar events.
 */

import {
  findPersonByUserIdAndEmail,
  findOrCreatePerson,
  updatePerson,
  updatePersonLastContact,
} from "~/data-access/persons";
import { classifyEmail } from "./domain-classifier";
import type {
  Person,
  CreatePersonData,
  CommunicationChannel,
  PersonDomain,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface EmailContact {
  email: string;
  name?: string;
}

export interface CalendarAttendee {
  email: string;
  name?: string;
  responseStatus?: string;
}

export interface ResolvedPerson {
  person: Person;
  isNew: boolean;
  wasUpdated: boolean;
  updates?: string[];
}

export interface BulkResolveResult {
  resolved: ResolvedPerson[];
  newPersonsCreated: number;
  existingPersonsUpdated: number;
  errors: Array<{ email: string; error: string }>;
}

// ============================================================================
// Person Resolution
// ============================================================================

/**
 * Resolve a single email contact to a Person record
 * Creates if not exists, updates if new info available
 */
export async function resolveEmailContact(
  userId: string,
  contact: EmailContact,
  options?: {
    updateLastContact?: boolean;
    channel?: CommunicationChannel;
    subject?: string;
    classifyDomain?: boolean;
  }
): Promise<ResolvedPerson> {
  const normalizedEmail = contact.email.toLowerCase().trim();
  const updates: string[] = [];

  // Check if person exists
  let existingPerson = await findPersonByUserIdAndEmail(
    userId,
    normalizedEmail
  );
  let isNew = false;
  let wasUpdated = false;

  if (existingPerson) {
    // Update existing person with new info if available
    const updateData: Partial<CreatePersonData> = {};

    // Update name if we have one and they don't
    if (contact.name && !existingPerson.name) {
      updateData.name = contact.name;
      updates.push("name");
    }

    // Add email to emails array if not already there
    const currentEmails = existingPerson.emails || [];
    if (!currentEmails.includes(normalizedEmail)) {
      updateData.emails = [...currentEmails, normalizedEmail];
      updates.push("emails");
    }

    if (Object.keys(updateData).length > 0) {
      existingPerson = (await updatePerson(existingPerson.id, updateData))!;
      wasUpdated = true;
    }

    // Update last contact if requested
    if (options?.updateLastContact) {
      existingPerson = (await updatePersonLastContact(
        existingPerson.id,
        options.channel || "email"
      ))!;
      wasUpdated = true;
      updates.push("lastContact");
    }

    return {
      person: existingPerson,
      isNew: false,
      wasUpdated,
      updates: updates.length > 0 ? updates : undefined,
    };
  }

  // Create new person
  let domain: PersonDomain = "other";

  // Classify domain if requested
  if (options?.classifyDomain !== false) {
    const classification = await classifyEmail(userId, {
      email: normalizedEmail,
      name: contact.name,
      subject: options?.subject,
    });
    domain = classification.domain;
  }

  const newPerson = await findOrCreatePerson(userId, normalizedEmail, {
    name: contact.name,
    domain,
    emails: [normalizedEmail],
    firstContactAt: new Date(),
    lastContactAt: options?.updateLastContact ? new Date() : undefined,
    lastContactChannel: options?.channel,
  });

  return {
    person: newPerson,
    isNew: true,
    wasUpdated: false,
  };
}

/**
 * Resolve a calendar attendee to a Person record
 */
export async function resolveCalendarAttendee(
  userId: string,
  attendee: CalendarAttendee,
  eventDate: Date
): Promise<ResolvedPerson> {
  return resolveEmailContact(
    userId,
    {
      email: attendee.email,
      name: attendee.name,
    },
    {
      updateLastContact: true,
      channel: "meeting",
      classifyDomain: true,
    }
  );
}

/**
 * Resolve multiple email contacts in bulk
 */
export async function resolveEmailContacts(
  userId: string,
  contacts: EmailContact[],
  options?: {
    updateLastContact?: boolean;
    channel?: CommunicationChannel;
    classifyDomain?: boolean;
  }
): Promise<BulkResolveResult> {
  const resolved: ResolvedPerson[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  let newPersonsCreated = 0;
  let existingPersonsUpdated = 0;

  // Deduplicate contacts by email
  const uniqueContacts = new Map<string, EmailContact>();
  for (const contact of contacts) {
    const normalized = contact.email.toLowerCase().trim();
    if (!uniqueContacts.has(normalized)) {
      uniqueContacts.set(normalized, contact);
    } else {
      // Merge: prefer contact with name
      const existing = uniqueContacts.get(normalized)!;
      if (contact.name && !existing.name) {
        uniqueContacts.set(normalized, contact);
      }
    }
  }

  // Resolve each unique contact
  for (const contact of uniqueContacts.values()) {
    try {
      const result = await resolveEmailContact(userId, contact, options);
      resolved.push(result);

      if (result.isNew) {
        newPersonsCreated++;
      } else if (result.wasUpdated) {
        existingPersonsUpdated++;
      }
    } catch (error) {
      errors.push({
        email: contact.email,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    resolved,
    newPersonsCreated,
    existingPersonsUpdated,
    errors,
  };
}

/**
 * Resolve calendar attendees in bulk
 */
export async function resolveCalendarAttendees(
  userId: string,
  attendees: CalendarAttendee[],
  eventDate: Date
): Promise<BulkResolveResult> {
  const contacts: EmailContact[] = attendees.map((a) => ({
    email: a.email,
    name: a.name,
  }));

  return resolveEmailContacts(userId, contacts, {
    updateLastContact: true,
    channel: "meeting",
    classifyDomain: true,
  });
}

// ============================================================================
// Email Extraction
// ============================================================================

/**
 * Extract email contacts from email headers (From, To, Cc)
 */
export function extractEmailContacts(email: {
  from: { email: string; name?: string };
  to?: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
}): EmailContact[] {
  const contacts: EmailContact[] = [];

  // Add sender
  if (email.from?.email) {
    contacts.push({
      email: email.from.email,
      name: email.from.name,
    });
  }

  // Add recipients
  if (email.to) {
    for (const recipient of email.to) {
      if (recipient.email) {
        contacts.push({
          email: recipient.email,
          name: recipient.name,
        });
      }
    }
  }

  // Add CC recipients
  if (email.cc) {
    for (const recipient of email.cc) {
      if (recipient.email) {
        contacts.push({
          email: recipient.email,
          name: recipient.name,
        });
      }
    }
  }

  return contacts;
}

/**
 * Resolve all contacts from an email
 */
export async function resolveEmailParticipants(
  userId: string,
  userEmail: string,
  email: {
    from: { email: string; name?: string };
    to?: Array<{ email: string; name?: string }>;
    cc?: Array<{ email: string; name?: string }>;
    subject?: string;
  }
): Promise<BulkResolveResult> {
  const contacts = extractEmailContacts(email);

  // Filter out the user's own email
  const externalContacts = contacts.filter(
    (c) => c.email.toLowerCase() !== userEmail.toLowerCase()
  );

  return resolveEmailContacts(userId, externalContacts, {
    updateLastContact: true,
    channel: "email",
    classifyDomain: true,
  });
}

// ============================================================================
// Person Merging
// ============================================================================

/**
 * Merge two person records (when same person has multiple entries)
 * Keeps the primary person and merges data from secondary
 */
export async function mergePersons(
  primaryPersonId: string,
  secondaryPersonId: string
): Promise<Person | null> {
  // This would need to:
  // 1. Update all interactions pointing to secondary to point to primary
  // 2. Update all commitments pointing to secondary to point to primary
  // 3. Merge emails arrays
  // 4. Merge metadata
  // 5. Delete secondary person

  // For now, just a placeholder - full implementation would need
  // to update foreign keys across tables
  console.warn(
    "Person merging not fully implemented yet",
    primaryPersonId,
    secondaryPersonId
  );
  return null;
}

// ============================================================================
// Deduplication Detection
// ============================================================================

export interface DuplicateCandidate {
  person1Id: string;
  person2Id: string;
  confidence: number;
  reasons: string[];
}

/**
 * Find potential duplicate persons for a user
 * Based on name similarity, email domain, etc.
 */
export async function findPotentialDuplicates(
  userId: string,
  persons: Person[]
): Promise<DuplicateCandidate[]> {
  const duplicates: DuplicateCandidate[] = [];

  // Simple approach: look for same name but different emails
  const nameGroups = new Map<string, Person[]>();

  for (const person of persons) {
    if (!person.name) continue;

    const normalizedName = person.name.toLowerCase().trim();
    if (!nameGroups.has(normalizedName)) {
      nameGroups.set(normalizedName, []);
    }
    nameGroups.get(normalizedName)!.push(person);
  }

  // Report groups with multiple entries
  for (const [name, group] of nameGroups) {
    if (group.length > 1) {
      // Create pairs
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          duplicates.push({
            person1Id: group[i].id,
            person2Id: group[j].id,
            confidence: 0.7,
            reasons: [`Same name: "${name}"`],
          });
        }
      }
    }
  }

  return duplicates;
}

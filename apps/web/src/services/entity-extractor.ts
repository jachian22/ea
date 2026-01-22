/**
 * Entity Extractor Service
 *
 * Orchestrates extraction of People, Commitments, and Interactions
 * from emails and calendar events.
 */

import {
  resolveEmailParticipants,
  resolveCalendarAttendees,
  type BulkResolveResult,
} from "./person-resolver";
import {
  detectCommitmentsInEmail,
  detectCommitmentsInCalendarEvent,
  saveDetectedCommitments,
  type EmailForAnalysis,
  type CalendarEventForAnalysis,
  type DetectedCommitment,
} from "./commitment-detector";
import { classifyEmail } from "./domain-classifier";
import { createInteraction } from "~/data-access/interactions";
import type {
  Person,
  Commitment,
  Interaction,
  PersonDomain,
  EmailData,
  CalendarEventData,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface ExtractionResult {
  personsCreated: number;
  personsUpdated: number;
  interactionsCreated: number;
  commitmentsDetected: number;
  commitmentsSaved: number;
  errors: string[];
}

export interface EmailExtractionResult extends ExtractionResult {
  resolvedPersons: Person[];
  createdInteraction?: Interaction;
  detectedCommitments: DetectedCommitment[];
  savedCommitments: Commitment[];
}

export interface CalendarExtractionResult extends ExtractionResult {
  resolvedAttendees: Person[];
  createdInteractions: Interaction[];
  detectedCommitments: DetectedCommitment[];
  savedCommitments: Commitment[];
}

export interface BatchExtractionResult extends ExtractionResult {
  emailsProcessed: number;
  eventsProcessed: number;
  details: {
    emails: EmailExtractionResult[];
    events: CalendarExtractionResult[];
  };
}

// ============================================================================
// Email Extraction
// ============================================================================

/**
 * Extract all entities from a single email
 */
export async function extractFromEmail(
  userId: string,
  userEmail: string,
  email: EmailData,
  options?: {
    saveCommitments?: boolean;
    minCommitmentConfidence?: number;
  }
): Promise<EmailExtractionResult> {
  const errors: string[] = [];
  const result: EmailExtractionResult = {
    personsCreated: 0,
    personsUpdated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
    commitmentsSaved: 0,
    errors: [],
    resolvedPersons: [],
    detectedCommitments: [],
    savedCommitments: [],
  };

  try {
    // 1. Resolve persons from email participants
    const personResult = await resolveEmailParticipants(userId, userEmail, {
      from: email.from,
      to: email.to,
      subject: email.subject,
    });

    result.personsCreated = personResult.newPersonsCreated;
    result.personsUpdated = personResult.existingPersonsUpdated;
    result.resolvedPersons = personResult.resolved.map((r) => r.person);
    result.errors.push(...personResult.errors.map((e) => `Person: ${e.error}`));

    // 2. Create interaction record
    // Determine the primary contact (sender for inbound, first recipient for outbound)
    const isInbound = email.from.email.toLowerCase() !== userEmail.toLowerCase();
    const primaryContact = isInbound
      ? personResult.resolved.find(
          (r) => r.person.email.toLowerCase() === email.from.email.toLowerCase()
        )
      : personResult.resolved[0];

    if (primaryContact) {
      const interaction = await createInteraction({
        id: crypto.randomUUID(),
        userId,
        personId: primaryContact.person.id,
        type: "email",
        channel: "email",
        direction: isInbound ? "inbound" : "outbound",
        subject: email.subject,
        summary: email.snippet,
        sourceType: "email",
        sourceId: email.id,
        occurredAt: new Date(email.receivedAt),
      });

      result.createdInteraction = interaction;
      result.interactionsCreated = 1;
    }

    // 3. Detect commitments
    const emailForAnalysis: EmailForAnalysis = {
      id: email.id,
      subject: email.subject,
      body: email.snippet, // Using snippet as we don't have full body
      from: email.from,
      receivedAt: new Date(email.receivedAt),
      direction: isInbound ? "inbound" : "outbound",
    };

    const commitmentResult = detectCommitmentsInEmail(emailForAnalysis);
    result.detectedCommitments = commitmentResult.commitments;
    result.commitmentsDetected = commitmentResult.totalMatches;

    // 4. Optionally save commitments
    if (options?.saveCommitments !== false && result.detectedCommitments.length > 0) {
      const classification = await classifyEmail(userId, {
        email: email.from.email,
        subject: email.subject,
      });

      const saved = await saveDetectedCommitments(
        userId,
        result.detectedCommitments,
        {
          type: "email",
          id: email.id,
          personId: primaryContact?.person.id,
          domain: classification.domain,
        },
        { minConfidence: options?.minCommitmentConfidence }
      );

      result.savedCommitments = saved;
      result.commitmentsSaved = saved.length;
    }
  } catch (error) {
    errors.push(
      `Email extraction error: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }

  result.errors = errors;
  return result;
}

/**
 * Extract entities from multiple emails
 */
export async function extractFromEmails(
  userId: string,
  userEmail: string,
  emails: EmailData[],
  options?: {
    saveCommitments?: boolean;
    minCommitmentConfidence?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<{
  results: EmailExtractionResult[];
  summary: ExtractionResult;
}> {
  const results: EmailExtractionResult[] = [];
  const summary: ExtractionResult = {
    personsCreated: 0,
    personsUpdated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
    commitmentsSaved: 0,
    errors: [],
  };

  for (let i = 0; i < emails.length; i++) {
    const result = await extractFromEmail(userId, userEmail, emails[i], options);
    results.push(result);

    // Aggregate summary
    summary.personsCreated += result.personsCreated;
    summary.personsUpdated += result.personsUpdated;
    summary.interactionsCreated += result.interactionsCreated;
    summary.commitmentsDetected += result.commitmentsDetected;
    summary.commitmentsSaved += result.commitmentsSaved;
    summary.errors.push(...result.errors);

    // Report progress
    options?.onProgress?.(i + 1, emails.length);
  }

  return { results, summary };
}

// ============================================================================
// Calendar Extraction
// ============================================================================

/**
 * Extract all entities from a single calendar event
 */
export async function extractFromCalendarEvent(
  userId: string,
  userEmail: string,
  event: CalendarEventData,
  options?: {
    saveCommitments?: boolean;
    minCommitmentConfidence?: number;
  }
): Promise<CalendarExtractionResult> {
  const errors: string[] = [];
  const result: CalendarExtractionResult = {
    personsCreated: 0,
    personsUpdated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
    commitmentsSaved: 0,
    errors: [],
    resolvedAttendees: [],
    createdInteractions: [],
    detectedCommitments: [],
    savedCommitments: [],
  };

  try {
    // 1. Resolve attendees as persons
    const attendees = event.attendees || [];
    const externalAttendees = attendees.filter(
      (a) => a.email.toLowerCase() !== userEmail.toLowerCase()
    );

    if (externalAttendees.length > 0) {
      const personResult = await resolveCalendarAttendees(
        userId,
        externalAttendees,
        new Date(event.startTime)
      );

      result.personsCreated = personResult.newPersonsCreated;
      result.personsUpdated = personResult.existingPersonsUpdated;
      result.resolvedAttendees = personResult.resolved.map((r) => r.person);
      result.errors.push(...personResult.errors.map((e) => `Person: ${e.error}`));

      // 2. Create interaction records for each attendee
      for (const resolved of personResult.resolved) {
        const interaction = await createInteraction({
          id: crypto.randomUUID(),
          userId,
          personId: resolved.person.id,
          type: "meeting",
          channel: "meeting",
          direction: "outbound", // Meetings are typically mutual
          subject: event.title,
          summary: event.description,
          sourceType: "calendar",
          sourceId: event.id,
          occurredAt: new Date(event.startTime),
        });

        result.createdInteractions.push(interaction);
        result.interactionsCreated++;
      }
    }

    // 3. Detect commitments from event description
    const eventForAnalysis: CalendarEventForAnalysis = {
      id: event.id,
      title: event.title,
      description: event.description,
      startTime: new Date(event.startTime),
      attendees: event.attendees,
    };

    const commitmentResult = detectCommitmentsInCalendarEvent(eventForAnalysis);
    result.detectedCommitments = commitmentResult.commitments;
    result.commitmentsDetected = commitmentResult.totalMatches;

    // 4. Optionally save commitments
    if (options?.saveCommitments !== false && result.detectedCommitments.length > 0) {
      // For meeting commitments, we might not know who the commitment is to
      // Use the first attendee as a default
      const primaryAttendee = result.resolvedAttendees[0];

      const saved = await saveDetectedCommitments(
        userId,
        result.detectedCommitments,
        {
          type: "calendar",
          id: event.id,
          personId: primaryAttendee?.id,
        },
        { minConfidence: options?.minCommitmentConfidence }
      );

      result.savedCommitments = saved;
      result.commitmentsSaved = saved.length;
    }
  } catch (error) {
    errors.push(
      `Calendar extraction error: ${error instanceof Error ? error.message : "Unknown"}`
    );
  }

  result.errors = errors;
  return result;
}

/**
 * Extract entities from multiple calendar events
 */
export async function extractFromCalendarEvents(
  userId: string,
  userEmail: string,
  events: CalendarEventData[],
  options?: {
    saveCommitments?: boolean;
    minCommitmentConfidence?: number;
    onProgress?: (processed: number, total: number) => void;
  }
): Promise<{
  results: CalendarExtractionResult[];
  summary: ExtractionResult;
}> {
  const results: CalendarExtractionResult[] = [];
  const summary: ExtractionResult = {
    personsCreated: 0,
    personsUpdated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
    commitmentsSaved: 0,
    errors: [],
  };

  for (let i = 0; i < events.length; i++) {
    const result = await extractFromCalendarEvent(
      userId,
      userEmail,
      events[i],
      options
    );
    results.push(result);

    // Aggregate summary
    summary.personsCreated += result.personsCreated;
    summary.personsUpdated += result.personsUpdated;
    summary.interactionsCreated += result.interactionsCreated;
    summary.commitmentsDetected += result.commitmentsDetected;
    summary.commitmentsSaved += result.commitmentsSaved;
    summary.errors.push(...result.errors);

    // Report progress
    options?.onProgress?.(i + 1, events.length);
  }

  return { results, summary };
}

// ============================================================================
// Combined Extraction
// ============================================================================

/**
 * Extract entities from both emails and calendar events
 */
export async function extractFromAll(
  userId: string,
  userEmail: string,
  data: {
    emails: EmailData[];
    calendarEvents: CalendarEventData[];
  },
  options?: {
    saveCommitments?: boolean;
    minCommitmentConfidence?: number;
    onProgress?: (phase: string, processed: number, total: number) => void;
  }
): Promise<BatchExtractionResult> {
  const result: BatchExtractionResult = {
    personsCreated: 0,
    personsUpdated: 0,
    interactionsCreated: 0,
    commitmentsDetected: 0,
    commitmentsSaved: 0,
    errors: [],
    emailsProcessed: 0,
    eventsProcessed: 0,
    details: {
      emails: [],
      events: [],
    },
  };

  // Process emails
  const emailResults = await extractFromEmails(userId, userEmail, data.emails, {
    ...options,
    onProgress: (processed, total) => {
      options?.onProgress?.("emails", processed, total);
    },
  });

  result.details.emails = emailResults.results;
  result.emailsProcessed = data.emails.length;
  result.personsCreated += emailResults.summary.personsCreated;
  result.personsUpdated += emailResults.summary.personsUpdated;
  result.interactionsCreated += emailResults.summary.interactionsCreated;
  result.commitmentsDetected += emailResults.summary.commitmentsDetected;
  result.commitmentsSaved += emailResults.summary.commitmentsSaved;
  result.errors.push(...emailResults.summary.errors);

  // Process calendar events
  const eventResults = await extractFromCalendarEvents(
    userId,
    userEmail,
    data.calendarEvents,
    {
      ...options,
      onProgress: (processed, total) => {
        options?.onProgress?.("calendar", processed, total);
      },
    }
  );

  result.details.events = eventResults.results;
  result.eventsProcessed = data.calendarEvents.length;
  result.personsCreated += eventResults.summary.personsCreated;
  result.personsUpdated += eventResults.summary.personsUpdated;
  result.interactionsCreated += eventResults.summary.interactionsCreated;
  result.commitmentsDetected += eventResults.summary.commitmentsDetected;
  result.commitmentsSaved += eventResults.summary.commitmentsSaved;
  result.errors.push(...eventResults.summary.errors);

  return result;
}

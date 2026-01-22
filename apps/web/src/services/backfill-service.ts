/**
 * Backfill Service
 *
 * Processes historical Gmail and Calendar data to populate
 * the knowledge graph with People, Interactions, and Commitments.
 */

import { google, type gmail_v1, type calendar_v3 } from "googleapis";
import type { Auth } from "googleapis";
import {
  findBackfillJobById,
  startBackfillJob,
  completeBackfillJob,
  failBackfillJob,
  updateBackfillJobProgress,
  incrementBackfillStats,
  setBackfillJobTotal,
  createBackfillJobForUser,
} from "~/data-access/backfill-jobs";
import { findGoogleIntegrationByUserId } from "~/data-access/google-integration";
import { createAuthenticatedClient, isIntegrationValid } from "~/lib/google-client";
import { extractFromAll } from "./entity-extractor";
import type {
  BackfillJob,
  BackfillSourceType,
  EmailData,
  CalendarEventData,
  GoogleIntegration,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface BackfillOptions {
  batchSize?: number;
  saveCommitments?: boolean;
  minCommitmentConfidence?: number;
  onProgress?: (job: BackfillJob) => void;
}

export interface BackfillResult {
  success: boolean;
  job: BackfillJob;
  error?: string;
  stats: {
    personsCreated: number;
    interactionsCreated: number;
    commitmentsDetected: number;
    emailsProcessed: number;
    eventsProcessed: number;
  };
}

// ============================================================================
// Main Backfill Functions
// ============================================================================

/**
 * Start a new backfill job
 */
export async function startBackfill(
  userId: string,
  sourceType: BackfillSourceType,
  startDate: Date,
  endDate: Date,
  options?: BackfillOptions
): Promise<BackfillResult> {
  // Create the job
  const jobResult = await createBackfillJobForUser(
    userId,
    sourceType,
    startDate,
    endDate
  );

  if (!("id" in jobResult)) {
    return {
      success: false,
      job: null as any,
      error: jobResult.error,
      stats: {
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
        emailsProcessed: 0,
        eventsProcessed: 0,
      },
    };
  }

  // Run the backfill
  return runBackfillJob(jobResult.id, options);
}

/**
 * Run (or resume) a backfill job
 */
export async function runBackfillJob(
  jobId: string,
  options?: BackfillOptions
): Promise<BackfillResult> {
  const batchSize = options?.batchSize ?? 100;

  let job = await findBackfillJobById(jobId);
  if (!job) {
    return {
      success: false,
      job: null as any,
      error: "Job not found",
      stats: {
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
        emailsProcessed: 0,
        eventsProcessed: 0,
      },
    };
  }

  // Get Google integration
  const integration = await findGoogleIntegrationByUserId(job.userId);
  if (!integration || !isIntegrationValid(integration)) {
    await failBackfillJob(jobId, "Google integration not connected or invalid");
    job = (await findBackfillJobById(jobId))!;
    return {
      success: false,
      job,
      error: "Google integration not connected",
      stats: {
        personsCreated: job.personsCreated || 0,
        interactionsCreated: job.interactionsCreated || 0,
        commitmentsDetected: job.commitmentsDetected || 0,
        emailsProcessed: 0,
        eventsProcessed: 0,
      },
    };
  }

  // Start the job
  job = (await startBackfillJob(jobId))!;
  options?.onProgress?.(job);

  try {
    const authClient = await createAuthenticatedClient(integration);
    let totalProcessed = 0;
    let emailsProcessed = 0;
    let eventsProcessed = 0;

    // Process based on source type
    if (job.sourceType === "gmail" || job.sourceType === "all") {
      const emailResult = await processGmailBackfill(
        job,
        integration,
        authClient,
        {
          batchSize,
          startDate: job.startDate,
          endDate: job.endDate,
          ...options,
        }
      );
      emailsProcessed = emailResult.processed;
      totalProcessed += emailsProcessed;
    }

    if (job.sourceType === "calendar" || job.sourceType === "all") {
      const calendarResult = await processCalendarBackfill(
        job,
        integration,
        authClient,
        {
          batchSize,
          startDate: job.startDate,
          endDate: job.endDate,
          ...options,
        }
      );
      eventsProcessed = calendarResult.processed;
      totalProcessed += eventsProcessed;
    }

    // Complete the job
    job = (await completeBackfillJob(jobId, {
      personsCreated: job.personsCreated ?? undefined,
      interactionsCreated: job.interactionsCreated ?? undefined,
      commitmentsDetected: job.commitmentsDetected ?? undefined,
    }))!;

    options?.onProgress?.(job);

    return {
      success: true,
      job,
      stats: {
        personsCreated: job.personsCreated || 0,
        interactionsCreated: job.interactionsCreated || 0,
        commitmentsDetected: job.commitmentsDetected || 0,
        emailsProcessed,
        eventsProcessed,
      },
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    job = (await failBackfillJob(jobId, errorMessage))!;
    options?.onProgress?.(job);

    return {
      success: false,
      job,
      error: errorMessage,
      stats: {
        personsCreated: job.personsCreated || 0,
        interactionsCreated: job.interactionsCreated || 0,
        commitmentsDetected: job.commitmentsDetected || 0,
        emailsProcessed: 0,
        eventsProcessed: 0,
      },
    };
  }
}

// ============================================================================
// Gmail Backfill
// ============================================================================

interface GmailBackfillOptions extends BackfillOptions {
  startDate: Date;
  endDate: Date;
}

async function processGmailBackfill(
  job: BackfillJob,
  integration: GoogleIntegration,
  authClient: Auth.OAuth2Client,
  options: GmailBackfillOptions
): Promise<{ processed: number }> {
  const gmail = google.gmail({ version: "v1", auth: authClient });
  const batchSize = options.batchSize ?? 100;

  // Build date query
  const afterTimestamp = Math.floor(options.startDate.getTime() / 1000);
  const beforeTimestamp = Math.floor(options.endDate.getTime() / 1000);
  const query = `after:${afterTimestamp} before:${beforeTimestamp}`;

  let pageToken: string | undefined;
  let totalProcessed = 0;
  let estimatedTotal = 0;

  // First, get estimated total
  try {
    const countResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 1,
    });
    estimatedTotal = countResponse.data.resultSizeEstimate || 0;
    await setBackfillJobTotal(job.id, estimatedTotal);
    await updateBackfillJobProgress(job.id, {
      processed: 0,
      total: estimatedTotal,
      currentPhase: "gmail",
    });
  } catch (error) {
    console.error("Failed to get email count estimate:", error);
  }

  // Process in batches
  do {
    // List messages
    const listResponse = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: batchSize,
      pageToken,
    });

    const messages = listResponse.data.messages || [];
    pageToken = listResponse.data.nextPageToken ?? undefined;

    if (messages.length === 0) break;

    // Fetch message details
    const emails: EmailData[] = [];
    for (const msg of messages) {
      try {
        const msgResponse = await gmail.users.messages.get({
          userId: "me",
          id: msg.id!,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        });

        const email = transformGmailMessage(msgResponse.data);
        if (email) {
          emails.push(email);
        }
      } catch (error) {
        console.error(`Failed to fetch message ${msg.id}:`, error);
      }
    }

    // Extract entities from this batch
    if (emails.length > 0) {
      const extractResult = await extractFromAll(
        job.userId,
        integration.googleEmail,
        { emails, calendarEvents: [] },
        {
          saveCommitments: options.saveCommitments,
          minCommitmentConfidence: options.minCommitmentConfidence,
        }
      );

      // Update stats
      await incrementBackfillStats(job.id, {
        personsCreated: extractResult.personsCreated,
        interactionsCreated: extractResult.interactionsCreated,
        commitmentsDetected: extractResult.commitmentsDetected,
      });

      totalProcessed += emails.length;

      // Update progress
      await updateBackfillJobProgress(job.id, {
        processed: totalProcessed,
        total: estimatedTotal,
        lastProcessedId: messages[messages.length - 1]?.id ?? undefined,
        currentPhase: "gmail",
      });

      // Notify progress
      const updatedJob = await findBackfillJobById(job.id);
      if (updatedJob) {
        options.onProgress?.(updatedJob);
      }
    }

    // Rate limiting - be gentle with Gmail API
    await sleep(100);
  } while (pageToken);

  return { processed: totalProcessed };
}

// ============================================================================
// Calendar Backfill
// ============================================================================

interface CalendarBackfillOptions extends BackfillOptions {
  startDate: Date;
  endDate: Date;
}

async function processCalendarBackfill(
  job: BackfillJob,
  integration: GoogleIntegration,
  authClient: Auth.OAuth2Client,
  options: CalendarBackfillOptions
): Promise<{ processed: number }> {
  const calendar = google.calendar({ version: "v3", auth: authClient });
  const batchSize = options.batchSize ?? 100;

  let pageToken: string | undefined;
  let totalProcessed = 0;

  // Process in batches
  do {
    const eventsResponse = await calendar.events.list({
      calendarId: "primary",
      timeMin: options.startDate.toISOString(),
      timeMax: options.endDate.toISOString(),
      maxResults: batchSize,
      singleEvents: true,
      orderBy: "startTime",
      pageToken,
    });

    const items = eventsResponse.data.items || [];
    pageToken = eventsResponse.data.nextPageToken ?? undefined;

    if (items.length === 0) break;

    // Transform to CalendarEventData
    const events: CalendarEventData[] = items
      .map(transformCalendarEvent)
      .filter((e): e is CalendarEventData => e !== null);

    // Extract entities from this batch
    if (events.length > 0) {
      const extractResult = await extractFromAll(
        job.userId,
        integration.googleEmail,
        { emails: [], calendarEvents: events },
        {
          saveCommitments: options.saveCommitments,
          minCommitmentConfidence: options.minCommitmentConfidence,
        }
      );

      // Update stats
      await incrementBackfillStats(job.id, {
        personsCreated: extractResult.personsCreated,
        interactionsCreated: extractResult.interactionsCreated,
        commitmentsDetected: extractResult.commitmentsDetected,
      });

      totalProcessed += events.length;

      // Update progress
      await updateBackfillJobProgress(job.id, {
        processed: totalProcessed,
        total: 0, // Calendar doesn't give us a total estimate
        lastProcessedId: items[items.length - 1]?.id ?? undefined,
        currentPhase: "calendar",
      });

      // Notify progress
      const updatedJob = await findBackfillJobById(job.id);
      if (updatedJob) {
        options.onProgress?.(updatedJob);
      }
    }

    // Rate limiting
    await sleep(100);
  } while (pageToken);

  return { processed: totalProcessed };
}

// ============================================================================
// Transform Functions
// ============================================================================

function transformGmailMessage(message: gmail_v1.Schema$Message): EmailData | null {
  if (!message.id || !message.threadId) return null;

  const headers = message.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;

  const from = parseEmailAddress(getHeader("From") || "");
  const to = parseEmailAddresses(getHeader("To") || "");
  const subject = getHeader("Subject") || "(no subject)";
  const date = getHeader("Date");

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    snippet: message.snippet || "",
    receivedAt: date || new Date().toISOString(),
    isRead: !message.labelIds?.includes("UNREAD"),
    labels: message.labelIds || [],
    importance: "medium",
    actionStatus: "none",
  };
}

function transformCalendarEvent(
  event: calendar_v3.Schema$Event
): CalendarEventData | null {
  if (!event.id) return null;

  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;

  if (!start || !end) return null;

  return {
    id: event.id,
    title: event.summary || "(no title)",
    description: event.description ?? undefined,
    startTime: start,
    endTime: end,
    location: event.location ?? undefined,
    meetingLink: event.hangoutLink || extractMeetingLink(event.description),
    attendees: event.attendees?.map((a) => ({
      email: a.email || "",
      name: a.displayName ?? undefined,
      responseStatus: a.responseStatus ?? undefined,
    })),
    isAllDay: !event.start?.dateTime,
  };
}

function parseEmailAddress(raw: string): { email: string; name?: string } {
  // Match "Name <email@domain.com>" or just "email@domain.com"
  const match = raw.match(/(?:"?([^"<]*)"?\s*)?<([^>]+)>/);
  if (match) {
    return {
      email: match[2].trim(),
      name: match[1]?.trim() || undefined,
    };
  }

  // Just an email address
  const emailMatch = raw.match(/[\w.-]+@[\w.-]+\.\w+/);
  return {
    email: emailMatch?.[0] || raw.trim(),
  };
}

function parseEmailAddresses(
  raw: string
): Array<{ email: string; name?: string }> {
  if (!raw) return [];

  // Split by comma, but not commas inside quotes
  const parts = raw.match(/(?:[^,"]|"[^"]*")+/g) || [];
  return parts.map((part) => parseEmailAddress(part.trim()));
}

function extractMeetingLink(description?: string | null): string | undefined {
  if (!description) return undefined;

  // Look for common meeting URLs
  const patterns = [
    /https?:\/\/[^\s]*meet\.google\.com\/[^\s]*/gi,
    /https?:\/\/[^\s]*zoom\.us\/[^\s]*/gi,
    /https?:\/\/[^\s]*teams\.microsoft\.com\/[^\s]*/gi,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

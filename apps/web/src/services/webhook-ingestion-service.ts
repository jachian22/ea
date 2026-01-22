import { google, type gmail_v1, type calendar_v3 } from "googleapis";
import type { GoogleIntegration } from "~/db/schema";
import {
  createAuthenticatedClient,
  isIntegrationValid,
} from "~/lib/google-client";
import {
  createIngestionEvent,
  findDuplicateIngestionEvent,
  markIngestionEventProcessing,
  markIngestionEventCompleted,
  markIngestionEventFailed,
  markIngestionEventDuplicate,
} from "~/data-access/ingestion-events";
import {
  findPersonByUserIdAndEmail,
  createPerson,
} from "~/data-access/persons";
import { createInteractionAndUpdatePerson } from "~/data-access/interactions";
import { findGoogleIntegrationByUserId } from "~/data-access/google-integration";

// ============================================================================
// Webhook Ingestion Service
// ============================================================================

/**
 * Gmail push notification payload structure
 * See: https://developers.google.com/gmail/api/guides/push
 */
export interface GmailPushNotification {
  message: {
    data: string; // Base64 encoded JSON
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

/**
 * Decoded Gmail push notification data
 */
export interface GmailNotificationData {
  emailAddress: string;
  historyId: string;
}

/**
 * Calendar push notification payload structure
 * See: https://developers.google.com/calendar/api/guides/push
 */
export interface CalendarPushNotification {
  resourceId: string;
  resourceUri: string;
  channelId: string;
  channelExpiration?: string;
  resourceState: "sync" | "exists" | "not_exists";
  changed?: string; // Comma-separated list of changed fields
}

/**
 * Result of processing a webhook
 */
export interface WebhookProcessingResult {
  success: boolean;
  ingestionEventId: string;
  personsCreated: number;
  interactionsCreated: number;
  commitmentsDetected: number;
  error?: string;
}

/**
 * WebhookIngestionService handles incoming push notifications from Gmail and Calendar
 */
export class WebhookIngestionService {
  private gmail: gmail_v1.Gmail;
  private calendar: calendar_v3.Calendar;
  private userId: string;
  private integration: GoogleIntegration;

  constructor(
    userId: string,
    integration: GoogleIntegration,
    auth: ReturnType<typeof google.auth.OAuth2.prototype.setCredentials> extends void ? any : any
  ) {
    this.userId = userId;
    this.integration = integration;
    this.gmail = google.gmail({ version: "v1", auth });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  /**
   * Create a WebhookIngestionService from a user ID
   */
  static async fromUserId(userId: string): Promise<WebhookIngestionService | null> {
    const integration = await findGoogleIntegrationByUserId(userId);

    if (!isIntegrationValid(integration)) {
      return null;
    }

    const authClient = await createAuthenticatedClient(integration!);
    return new WebhookIngestionService(userId, integration!, authClient);
  }

  /**
   * Process a Gmail push notification
   */
  async processGmailNotification(
    notification: GmailPushNotification
  ): Promise<WebhookProcessingResult> {
    // Decode the notification data
    const decodedData = Buffer.from(notification.message.data, "base64").toString();
    const data: GmailNotificationData = JSON.parse(decodedData);

    // Create ingestion event
    const ingestionEvent = await createIngestionEvent({
      userId: this.userId,
      source: "gmail_webhook",
      eventType: "new_email",
      externalId: data.historyId,
      payload: {
        emailAddress: data.emailAddress,
        historyId: data.historyId,
        messageId: notification.message.messageId,
        publishTime: notification.message.publishTime,
      },
    });

    // Check for duplicate
    const duplicate = await findDuplicateIngestionEvent(
      this.userId,
      "gmail_webhook",
      data.historyId
    );

    if (duplicate && duplicate.id !== ingestionEvent.id) {
      await markIngestionEventDuplicate(ingestionEvent.id);
      return {
        success: true,
        ingestionEventId: ingestionEvent.id,
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
      };
    }

    try {
      // Mark as processing
      await markIngestionEventProcessing(ingestionEvent.id);

      // Fetch the history to get new messages
      const result = await this.processGmailHistory(data.historyId);

      // Mark as completed
      await markIngestionEventCompleted(ingestionEvent.id, result);

      return {
        success: true,
        ingestionEventId: ingestionEvent.id,
        ...result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await markIngestionEventFailed(ingestionEvent.id, errorMessage);

      return {
        success: false,
        ingestionEventId: ingestionEvent.id,
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Process Gmail history to extract new messages
   */
  private async processGmailHistory(
    historyId: string
  ): Promise<{
    personsCreated: number;
    interactionsCreated: number;
    commitmentsDetected: number;
  }> {
    const results = {
      personsCreated: 0,
      interactionsCreated: 0,
      commitmentsDetected: 0,
    };

    try {
      // Get history since the last known historyId
      const historyResponse = await this.gmail.users.history.list({
        userId: "me",
        startHistoryId: historyId,
        historyTypes: ["messageAdded"],
      });

      const history = historyResponse.data.history || [];

      // Process each history record
      for (const record of history) {
        const messagesAdded = record.messagesAdded || [];

        for (const messageAdded of messagesAdded) {
          if (!messageAdded.message?.id) continue;

          // Fetch the message details
          const messageResponse = await this.gmail.users.messages.get({
            userId: "me",
            id: messageAdded.message.id,
            format: "metadata",
            metadataHeaders: ["From", "To", "Subject", "Date"],
          });

          const message = messageResponse.data;
          const headers = message.payload?.headers || [];

          // Extract sender info
          const fromHeader = headers.find(
            (h) => h.name?.toLowerCase() === "from"
          )?.value;

          if (!fromHeader) continue;

          // Parse the email address
          const emailMatch = fromHeader.match(/<([^>]+)>/) || [null, fromHeader];
          const email = emailMatch[1]?.trim().toLowerCase();
          const nameMatch = fromHeader.match(/^"?([^"<]+)"?\s*</);
          const name = nameMatch ? nameMatch[1].trim() : undefined;

          if (!email) continue;

          // Check if person exists, create if not
          let person = await findPersonByUserIdAndEmail(this.userId, email);

          if (!person) {
            person = await createPerson({
              userId: this.userId,
              email,
              name,
              domain: "business",
            });
            results.personsCreated++;
          }

          // Create interaction record and update person stats in one go
          await createInteractionAndUpdatePerson({
            userId: this.userId,
            personId: person.id,
            type: "email",
            channel: "email",
            direction: "inbound",
            subject: headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "(No Subject)",
            summary: message.snippet || "",
            sourceType: "email",
            sourceId: message.id || "",
            occurredAt: message.internalDate
              ? new Date(parseInt(message.internalDate))
              : new Date(),
          });
          results.interactionsCreated++;

          // TODO: Detect commitments from email content
          // This would involve AI processing of the email body
        }
      }
    } catch (error) {
      // If we get a 404, the historyId might be too old
      const apiError = error as { code?: number };
      if (apiError.code === 404) {
        console.warn(`Gmail history ${historyId} not found, may be expired`);
      } else {
        throw error;
      }
    }

    return results;
  }

  /**
   * Process a Calendar push notification
   */
  async processCalendarNotification(
    notification: CalendarPushNotification
  ): Promise<WebhookProcessingResult> {
    // Create ingestion event
    const ingestionEvent = await createIngestionEvent({
      userId: this.userId,
      source: "calendar_webhook",
      eventType: notification.resourceState === "exists" ? "calendar_update" : "calendar_event",
      externalId: notification.resourceId,
      payload: {
        resourceId: notification.resourceId,
        resourceUri: notification.resourceUri,
        channelId: notification.channelId,
        resourceState: notification.resourceState,
        changed: notification.changed,
      },
    });

    // Skip sync messages (just acknowledging the watch setup)
    if (notification.resourceState === "sync") {
      await markIngestionEventCompleted(ingestionEvent.id, {
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
      });

      return {
        success: true,
        ingestionEventId: ingestionEvent.id,
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
      };
    }

    try {
      // Mark as processing
      await markIngestionEventProcessing(ingestionEvent.id);

      // Process calendar changes
      const result = await this.processCalendarChanges(notification);

      // Mark as completed
      await markIngestionEventCompleted(ingestionEvent.id, result);

      return {
        success: true,
        ingestionEventId: ingestionEvent.id,
        ...result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await markIngestionEventFailed(ingestionEvent.id, errorMessage);

      return {
        success: false,
        ingestionEventId: ingestionEvent.id,
        personsCreated: 0,
        interactionsCreated: 0,
        commitmentsDetected: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Process calendar changes to extract attendee information
   */
  private async processCalendarChanges(
    notification: CalendarPushNotification
  ): Promise<{
    personsCreated: number;
    interactionsCreated: number;
    commitmentsDetected: number;
  }> {
    const results = {
      personsCreated: 0,
      interactionsCreated: 0,
      commitmentsDetected: 0,
    };

    try {
      // Get recent calendar events (updated in the last hour)
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const eventsResponse = await this.calendar.events.list({
        calendarId: "primary",
        updatedMin: oneHourAgo.toISOString(),
        singleEvents: true,
        maxResults: 50,
      });

      const events = eventsResponse.data.items || [];

      // Process each event's attendees
      for (const event of events) {
        const attendees = event.attendees || [];

        for (const attendee of attendees) {
          // Skip the user's own email
          if (attendee.self || !attendee.email) continue;

          const email = attendee.email.toLowerCase();

          // Check if person exists, create if not
          let person = await findPersonByUserIdAndEmail(this.userId, email);

          if (!person) {
            person = await createPerson({
              userId: this.userId,
              email,
              name: attendee.displayName,
              domain: "business",
            });
            results.personsCreated++;
          }

          // Create interaction record for the meeting
          if (event.start?.dateTime || event.start?.date) {
            await createInteractionAndUpdatePerson({
              userId: this.userId,
              personId: person.id,
              type: "meeting",
              channel: "meeting",
              direction: event.organizer?.self ? "outbound" : "inbound",
              subject: event.summary || "(No Title)",
              summary: event.description || "",
              sourceType: "calendar",
              sourceId: event.id || "",
              occurredAt: new Date(event.start.dateTime || event.start.date || Date.now()),
            });
            results.interactionsCreated++;
          }
        }
      }
    } catch (error) {
      console.error("Error processing calendar changes:", error);
      throw error;
    }

    return results;
  }
}

// ============================================================================
// Watch Setup Functions
// ============================================================================

/**
 * Set up Gmail push notifications for a user
 * Returns the watch response with expiration time
 */
export async function setupGmailWatch(
  integration: GoogleIntegration,
  topicName: string // e.g., "projects/your-project/topics/gmail-notifications"
): Promise<{
  historyId: string;
  expiration: string;
} | null> {
  if (!isIntegrationValid(integration)) {
    return null;
  }

  const authClient = await createAuthenticatedClient(integration);
  const gmail = google.gmail({ version: "v1", auth: authClient });

  try {
    const response = await gmail.users.watch({
      userId: "me",
      requestBody: {
        topicName,
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      },
    });

    return {
      historyId: response.data.historyId || "",
      expiration: response.data.expiration || "",
    };
  } catch (error) {
    console.error("Failed to setup Gmail watch:", error);
    return null;
  }
}

/**
 * Stop Gmail push notifications for a user
 */
export async function stopGmailWatch(
  integration: GoogleIntegration
): Promise<boolean> {
  if (!isIntegrationValid(integration)) {
    return false;
  }

  const authClient = await createAuthenticatedClient(integration);
  const gmail = google.gmail({ version: "v1", auth: authClient });

  try {
    await gmail.users.stop({ userId: "me" });
    return true;
  } catch (error) {
    console.error("Failed to stop Gmail watch:", error);
    return false;
  }
}

/**
 * Set up Calendar push notifications for a user
 */
export async function setupCalendarWatch(
  integration: GoogleIntegration,
  webhookUrl: string,
  channelId: string = crypto.randomUUID()
): Promise<{
  channelId: string;
  resourceId: string;
  expiration: string;
} | null> {
  if (!isIntegrationValid(integration)) {
    return null;
  }

  const authClient = await createAuthenticatedClient(integration);
  const calendar = google.calendar({ version: "v3", auth: authClient });

  try {
    const response = await calendar.events.watch({
      calendarId: "primary",
      requestBody: {
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        params: {
          ttl: "604800", // 7 days in seconds
        },
      },
    });

    return {
      channelId: response.data.id || channelId,
      resourceId: response.data.resourceId || "",
      expiration: response.data.expiration || "",
    };
  } catch (error) {
    console.error("Failed to setup Calendar watch:", error);
    return null;
  }
}

/**
 * Stop Calendar push notifications for a user
 */
export async function stopCalendarWatch(
  integration: GoogleIntegration,
  channelId: string,
  resourceId: string
): Promise<boolean> {
  if (!isIntegrationValid(integration)) {
    return false;
  }

  const authClient = await createAuthenticatedClient(integration);
  const calendar = google.calendar({ version: "v3", auth: authClient });

  try {
    await calendar.channels.stop({
      requestBody: {
        id: channelId,
        resourceId,
      },
    });
    return true;
  } catch (error) {
    console.error("Failed to stop Calendar watch:", error);
    return false;
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Process a Gmail webhook payload (convenience wrapper)
 */
export async function processGmailWebhook(
  userId: string,
  payload: GmailPushNotification
): Promise<WebhookProcessingResult | null> {
  const service = await WebhookIngestionService.fromUserId(userId);
  if (!service) {
    return null;
  }

  return service.processGmailNotification(payload);
}

/**
 * Process a Calendar webhook payload (convenience wrapper)
 */
export async function processCalendarWebhook(
  userId: string,
  payload: CalendarPushNotification
): Promise<WebhookProcessingResult | null> {
  const service = await WebhookIngestionService.fromUserId(userId);
  if (!service) {
    return null;
  }

  return service.processCalendarNotification(payload);
}

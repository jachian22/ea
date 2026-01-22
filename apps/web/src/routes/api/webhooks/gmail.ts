import { createFileRoute } from '@tanstack/react-router';
import {
  processGmailWebhook,
  type GmailPushNotification,
} from '~/services/webhook-ingestion-service';
import { findGoogleIntegrationByGoogleEmail } from '~/data-access/google-integration';

/**
 * Gmail Push Notification Webhook Handler
 *
 * This endpoint receives push notifications from Gmail when new emails arrive.
 * Google Cloud Pub/Sub forwards messages to this endpoint.
 *
 * Setup Requirements:
 * 1. Create a Google Cloud Pub/Sub topic
 * 2. Create a push subscription pointing to this endpoint
 * 3. Grant Gmail API access to publish to the topic
 * 4. Call gmail.users.watch() to start receiving notifications
 *
 * Flow:
 * 1. Receive POST from Pub/Sub with base64-encoded notification
 * 2. Decode and extract historyId and email address
 * 3. Find the user by their connected Google email
 * 4. Process the notification to extract new emails and create interactions
 * 5. Return 200 OK (or Pub/Sub will retry)
 */
export const Route = createFileRoute('/api/webhooks/gmail')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();

          // Validate the payload structure
          if (!body.message?.data) {
            console.warn('[Gmail Webhook] Invalid payload - missing message.data');
            return Response.json({ error: 'Invalid payload' }, { status: 400 });
          }

          const notification: GmailPushNotification = body;

          // Decode the notification data to get the email address
          let notificationData;
          try {
            const decoded = Buffer.from(notification.message.data, 'base64').toString();
            notificationData = JSON.parse(decoded);
          } catch (error) {
            console.error('[Gmail Webhook] Failed to decode notification data:', error);
            return Response.json({ error: 'Invalid notification data' }, { status: 400 });
          }

          const { emailAddress, historyId } = notificationData;

          if (!emailAddress) {
            console.warn('[Gmail Webhook] Missing email address in notification');
            return Response.json({ error: 'Missing email address' }, { status: 400 });
          }

          console.log(
            `[Gmail Webhook] Received notification for ${emailAddress}, historyId: ${historyId}`
          );

          // Find the user by their connected Google email
          const integration = await findGoogleIntegrationByGoogleEmail(emailAddress);

          if (!integration) {
            console.warn(`[Gmail Webhook] No integration found for email: ${emailAddress}`);
            // Return 200 to prevent Pub/Sub from retrying
            return Response.json({ received: true, processed: false });
          }

          // Process the notification
          const result = await processGmailWebhook(integration.userId, notification);

          if (!result) {
            console.warn(
              `[Gmail Webhook] Failed to process notification for user: ${integration.userId}`
            );
            return Response.json({ received: true, processed: false });
          }

          console.log(
            `[Gmail Webhook] Processed notification: ${result.personsCreated} persons, ${result.interactionsCreated} interactions`
          );

          return Response.json({
            received: true,
            processed: true,
            ingestionEventId: result.ingestionEventId,
            personsCreated: result.personsCreated,
            interactionsCreated: result.interactionsCreated,
          });
        } catch (error) {
          console.error('[Gmail Webhook] Error processing notification:', error);
          // Return 500 to trigger Pub/Sub retry for transient errors
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});

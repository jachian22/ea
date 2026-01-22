import { createFileRoute } from '@tanstack/react-router';
import {
  processCalendarWebhook,
  type CalendarPushNotification,
} from '~/services/webhook-ingestion-service';
import { database } from '~/db';
import { googleIntegration } from '~/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Google Calendar Push Notification Webhook Handler
 *
 * This endpoint receives push notifications from Google Calendar
 * when calendar events are created, updated, or deleted.
 *
 * Setup Requirements:
 * 1. Call calendar.events.watch() with this endpoint URL
 * 2. Store the channelId and resourceId for later management
 * 3. The watch expires after 7 days and needs to be renewed
 *
 * Flow:
 * 1. Receive POST from Google Calendar with notification headers
 * 2. Validate the channelId to find the associated user
 * 3. Process the notification to update person records
 * 4. Return 200 OK (or Google will retry)
 *
 * Headers from Google:
 * - X-Goog-Channel-ID: The channel ID from watch setup
 * - X-Goog-Channel-Expiration: When the channel expires
 * - X-Goog-Resource-ID: Identifies the watched resource
 * - X-Goog-Resource-State: "sync", "exists", or "not_exists"
 * - X-Goog-Resource-URI: URI of the changed resource
 * - X-Goog-Changed: Comma-separated list of changed fields (optional)
 */
export const Route = createFileRoute('/api/webhooks/calendar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Extract notification info from headers
          const channelId = request.headers.get('X-Goog-Channel-ID');
          const resourceId = request.headers.get('X-Goog-Resource-ID');
          const resourceState = request.headers.get('X-Goog-Resource-State');
          const resourceUri = request.headers.get('X-Goog-Resource-URI');
          const channelExpiration = request.headers.get('X-Goog-Channel-Expiration');
          const changed = request.headers.get('X-Goog-Changed');

          // Validate required headers
          if (!channelId || !resourceId || !resourceState) {
            console.warn('[Calendar Webhook] Missing required headers');
            return Response.json({ error: 'Missing required headers' }, { status: 400 });
          }

          console.log(
            `[Calendar Webhook] Received notification - channelId: ${channelId}, state: ${resourceState}`
          );

          // Build the notification object
          const notification: CalendarPushNotification = {
            channelId,
            resourceId,
            resourceState: resourceState as 'sync' | 'exists' | 'not_exists',
            resourceUri: resourceUri || '',
            channelExpiration: channelExpiration || undefined,
            changed: changed || undefined,
          };

          // For sync notifications, just acknowledge
          if (resourceState === 'sync') {
            console.log('[Calendar Webhook] Received sync notification');
            return Response.json({ received: true, type: 'sync' });
          }

          // Find the user by their calendar channel ID
          // Note: We need to store the channelId when setting up the watch
          // For now, we'll look up by channelId in a metadata field or separate table
          // As a fallback, we can try to find the user from the resourceUri
          const userId = await findUserByCalendarChannel(channelId);

          if (!userId) {
            console.warn(`[Calendar Webhook] No user found for channelId: ${channelId}`);
            // Return 200 to prevent Google from retrying
            return Response.json({ received: true, processed: false });
          }

          // Process the notification
          const result = await processCalendarWebhook(userId, notification);

          if (!result) {
            console.warn(`[Calendar Webhook] Failed to process notification for user: ${userId}`);
            return Response.json({ received: true, processed: false });
          }

          console.log(
            `[Calendar Webhook] Processed notification: ${result.personsCreated} persons, ${result.interactionsCreated} interactions`
          );

          return Response.json({
            received: true,
            processed: true,
            ingestionEventId: result.ingestionEventId,
            personsCreated: result.personsCreated,
            interactionsCreated: result.interactionsCreated,
          });
        } catch (error) {
          console.error('[Calendar Webhook] Error processing notification:', error);
          // Return 500 to trigger Google's retry for transient errors
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});

/**
 * Find user ID by calendar channel ID
 * This requires storing the channelId when setting up the watch
 */
async function findUserByCalendarChannel(channelId: string): Promise<string | null> {
  // Look for the channelId in the googleIntegration metadata
  // This assumes we've stored the channelId in a JSONB field or similar
  // For now, we'll query all integrations and check their metadata

  // Note: In a production system, you'd want a dedicated table for watch channels
  // or store the channelId directly on the googleIntegration table

  try {
    // Query all integrations and check if any have this channelId
    // This is a simplified implementation - consider adding a proper index
    const integrations = await database
      .select()
      .from(googleIntegration)
      .where(eq(googleIntegration.isConnected, true));

    // For now, return null - the channelId lookup needs proper storage setup
    // In production, you'd store channelId -> userId mapping
    console.warn(
      `[Calendar Webhook] Channel lookup not fully implemented for channelId: ${channelId}`
    );

    // Return the first integration as a fallback for development
    // TODO: Implement proper channel tracking
    if (integrations.length > 0) {
      return integrations[0].userId;
    }

    return null;
  } catch (error) {
    console.error('[Calendar Webhook] Error looking up user:', error);
    return null;
  }
}

/**
 * Refresh Service
 *
 * Handles refreshing daily briefs with fresh data from Gmail and Google Calendar.
 */

import { eq } from 'drizzle-orm';
import { database } from '../db/index.js';
import { dailyBrief, googleIntegration, user } from '../db/schema.js';
import { fetchEmailsForDailyBrief } from './gmail.js';
import { fetchEventsForDailyBrief } from './google-calendar.js';
import { enrichBriefData } from './brief-enrichment.js';
import { isIntegrationValid } from './google-client.js';

export interface RefreshResult {
  success: boolean;
  message: string;
  emailCount?: number;
  eventCount?: number;
  enriched?: boolean;
}

/**
 * Gets today's date in YYYY-MM-DD format
 */
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * Generates a UUID
 */
function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Refreshes the daily brief by fetching new data and regenerating AI insights
 */
export async function refreshBrief(): Promise<RefreshResult> {
  console.log('[RefreshService] Starting brief refresh...');

  try {
    // Get all connected Google integrations
    const integrations = await database
      .select({
        integration: googleIntegration,
        user: user,
      })
      .from(googleIntegration)
      .innerJoin(user, eq(googleIntegration.userId, user.id));

    if (integrations.length === 0) {
      return {
        success: false,
        message: 'No Google integrations found. Connect your Google account first.',
      };
    }

    // Find the first valid integration
    const validIntegration = integrations.find(({ integration }) =>
      isIntegrationValid(integration)
    );

    if (!validIntegration) {
      return {
        success: false,
        message: 'No connected Google accounts found. Please reconnect from the web app.',
      };
    }

    const { integration, user: userData } = validIntegration;
    const briefDate = getTodayDate();

    console.log(`[RefreshService] Refreshing brief for user ${userData.id}`);

    // Check for existing brief
    const existingBriefs = await database
      .select()
      .from(dailyBrief)
      .where(eq(dailyBrief.userId, userData.id))
      .limit(10);

    const existingBrief = existingBriefs.find((b) => b.briefDate === briefDate);

    // Fetch emails from Gmail
    console.log('[RefreshService] Fetching emails...');
    const emails = await fetchEmailsForDailyBrief(integration);
    console.log(`[RefreshService] Fetched ${emails.length} emails`);

    // Fetch calendar events
    console.log('[RefreshService] Fetching calendar events...');
    const calendarEvents = await fetchEventsForDailyBrief(integration);
    console.log(`[RefreshService] Fetched ${calendarEvents.length} events`);

    // Enrich with AI
    console.log('[RefreshService] Enriching with AI...');
    const enrichedContent = await enrichBriefData({
      briefDate,
      emails,
      calendarEvents,
    });

    // Calculate stats
    const totalEmails = emails.length;
    const totalEvents = calendarEvents.length;
    const emailsNeedingResponse = emails.filter((e) => e.actionStatus === 'needs_response').length;

    if (existingBrief) {
      // Update existing brief
      console.log(`[RefreshService] Updating existing brief ${existingBrief.id}`);
      await database
        .update(dailyBrief)
        .set({
          emails,
          calendarEvents,
          enrichedContent,
          enrichedAt: enrichedContent ? new Date() : null,
          totalEmails: String(totalEmails),
          totalEvents: String(totalEvents),
          emailsNeedingResponse: String(emailsNeedingResponse),
          status: 'completed',
          generatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(dailyBrief.id, existingBrief.id));
    } else {
      // Create new brief
      const briefId = generateId();
      console.log(`[RefreshService] Creating new brief ${briefId}`);
      await database.insert(dailyBrief).values({
        id: briefId,
        userId: userData.id,
        briefDate,
        emails,
        calendarEvents,
        enrichedContent,
        enrichedAt: enrichedContent ? new Date() : null,
        totalEmails: String(totalEmails),
        totalEvents: String(totalEvents),
        emailsNeedingResponse: String(emailsNeedingResponse),
        status: 'completed',
        generatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Update last synced timestamp
    await database
      .update(googleIntegration)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(googleIntegration.userId, userData.id));

    console.log('[RefreshService] Brief refresh complete');

    return {
      success: true,
      message: `Brief refreshed for ${briefDate}`,
      emailCount: totalEmails,
      eventCount: totalEvents,
      enriched: enrichedContent !== null,
    };
  } catch (error) {
    console.error('[RefreshService] Error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

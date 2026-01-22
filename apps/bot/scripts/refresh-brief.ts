#!/usr/bin/env npx tsx
/**
 * Refresh Brief Cron Script
 *
 * Standalone script to fetch emails, calendar events, and generate AI-enriched briefs.
 * Designed to be run via system cron (e.g., daily at 7:30am).
 *
 * Usage:
 *   cd apps/ea-bot && npx tsx scripts/refresh-brief.ts
 *
 * Add to crontab:
 *   30 7 * * * cd /path/to/automaker/apps/ea-bot && npx tsx scripts/refresh-brief.ts >> /tmp/ea-brief.log 2>&1
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the ea-bot root BEFORE any other imports
config({ path: path.join(__dirname, '..', '.env') });

// Dynamic imports to ensure env is loaded first
const { eq } = await import('drizzle-orm');
const { database, pool } = await import('../src/db/index.js');
const { dailyBrief, googleIntegration, user } = await import('../src/db/schema.js');
const { fetchEmailsForDailyBrief } = await import('../src/services/gmail.js');
const { fetchEventsForDailyBrief } = await import('../src/services/google-calendar.js');
const { enrichBriefData } = await import('../src/services/brief-enrichment.js');
const { isIntegrationValid } = await import('../src/services/google-client.js');

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
 * Refreshes the daily brief for a single user
 */
async function refreshBriefForUser(userId: string, integration: typeof googleIntegration.$inferSelect): Promise<void> {
  const briefDate = getTodayDate();
  console.log(`[RefreshBrief] Processing user ${userId} for date ${briefDate}`);

  try {
    // Check for existing brief
    const existingBriefs = await database
      .select()
      .from(dailyBrief)
      .where(eq(dailyBrief.userId, userId))
      .limit(1);

    const existingBrief = existingBriefs.find((b) => b.briefDate === briefDate);

    // Fetch emails from Gmail
    console.log('[RefreshBrief] Fetching emails...');
    const emails = await fetchEmailsForDailyBrief(integration);
    console.log(`[RefreshBrief] Fetched ${emails.length} emails`);

    // Fetch calendar events
    console.log('[RefreshBrief] Fetching calendar events...');
    const calendarEvents = await fetchEventsForDailyBrief(integration);
    console.log(`[RefreshBrief] Fetched ${calendarEvents.length} events`);

    // Enrich with AI
    console.log('[RefreshBrief] Enriching with AI...');
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
      console.log(`[RefreshBrief] Updating existing brief ${existingBrief.id}`);
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
      console.log(`[RefreshBrief] Creating new brief ${briefId}`);
      await database.insert(dailyBrief).values({
        id: briefId,
        userId,
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
      .where(eq(googleIntegration.userId, userId));

    console.log(`[RefreshBrief] Successfully refreshed brief for user ${userId}`);
  } catch (error) {
    console.error(`[RefreshBrief] Error processing user ${userId}:`, error);
    throw error;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('[RefreshBrief] Starting brief refresh...');
  console.log(`[RefreshBrief] Date: ${new Date().toISOString()}`);

  try {
    // Get all connected Google integrations
    const integrations = await database
      .select({
        integration: googleIntegration,
        user: user,
      })
      .from(googleIntegration)
      .innerJoin(user, eq(googleIntegration.userId, user.id));

    console.log(`[RefreshBrief] Found ${integrations.length} Google integration(s)`);

    let successCount = 0;
    let failCount = 0;

    for (const { integration, user: userData } of integrations) {
      if (!isIntegrationValid(integration)) {
        console.log(`[RefreshBrief] Skipping disconnected integration for user ${userData.id}`);
        continue;
      }

      try {
        await refreshBriefForUser(userData.id, integration);
        successCount++;
      } catch (error) {
        console.error(`[RefreshBrief] Failed for user ${userData.id}:`, error);
        failCount++;
      }
    }

    console.log(`[RefreshBrief] Complete: ${successCount} succeeded, ${failCount} failed`);
  } finally {
    // Close database connection
    await pool.end();
  }
}

// Run the script
main().catch((error) => {
  console.error('[RefreshBrief] Fatal error:', error);
  process.exit(1);
});

/**
 * Manual test script for brief enrichment
 * Run with: npx tsx scripts/test-enrichment.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';

// Load env from ea-bot
config({ path: resolve(import.meta.dirname, '..', '.env') });

// Also try loading from ea app if DATABASE_URL not set
if (!process.env.DATABASE_URL) {
  config({ path: resolve(import.meta.dirname, '..', '..', '..', 'ea', '.env') });
}

import { getLatestBrief, getTodaysBrief, updateBriefEnrichment } from '../src/db/daily-briefs.js';

async function main() {
  console.log('🔍 Testing Brief Enrichment...\n');

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set. Create .env file or set environment variable.');
    process.exit(1);
  }
  console.log('✅ DATABASE_URL configured\n');

  // Get latest brief
  console.log('📋 Fetching latest brief...');
  const latest = await getLatestBrief();

  if (!latest) {
    console.log('❌ No briefs found. Generate one from the web app first.');
    process.exit(1);
  }

  console.log(`✅ Found brief for ${latest.briefDate}`);
  console.log(`   - User: ${latest.user.name} (${latest.user.email})`);
  console.log(`   - Status: ${latest.status}`);
  console.log(`   - Emails: ${latest.emails?.length || 0}`);
  console.log(`   - Calendar events: ${latest.calendarEvents?.length || 0}`);
  console.log(`   - Weather: ${latest.weather ? `${latest.weather.temperature}°F in ${latest.weather.locationName}` : 'No weather data'}`);
  console.log(`   - Enriched: ${latest.enrichedAt ? `Yes (${latest.enrichedAt})` : 'No'}`);

  if (latest.enrichedAt) {
    console.log('\n📊 Enriched Content:');
    console.log(`   Summary: ${latest.enrichedContent?.daySummary || 'N/A'}`);
    console.log(`   Topics: ${latest.enrichedContent?.conversations.byTopic.length || 0}`);
    console.log(`   Highlights: ${latest.enrichedContent?.conversations.highlights.length || 0}`);
  }

  // Get today's brief
  console.log('\n📋 Fetching today\'s brief...');
  const today = await getTodaysBrief();

  if (today) {
    console.log(`✅ Found today's brief (${today.briefDate})`);
  } else {
    console.log('ℹ️  No brief for today yet');
  }

  console.log('\n✅ Database connection working!');
  console.log('\nTo test full enrichment, run the Discord bot and use /enrich-brief');

  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

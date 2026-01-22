import { pgTable, text, timestamp, jsonb, date, index, boolean } from 'drizzle-orm/pg-core';

// User table (minimal for joins)
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});

// Google Integration - OAuth tokens for Gmail and Calendar access
export const googleIntegration = pgTable(
  'google_integration',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token').notNull(),
    accessTokenExpiresAt: timestamp('access_token_expires_at').notNull(),
    scope: text('scope').notNull(),
    googleEmail: text('google_email').notNull(),
    googleAccountId: text('google_account_id').notNull(),
    isConnected: boolean('is_connected')
      .$default(() => true)
      .notNull(),
    lastSyncedAt: timestamp('last_synced_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_google_integration_user_id').on(table.userId),
    index('idx_google_integration_google_account_id').on(table.googleAccountId),
  ]
);

export type GoogleIntegration = typeof googleIntegration.$inferSelect;

// Daily Brief table - matches EA app schema
export const dailyBrief = pgTable(
  'daily_brief',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    briefDate: date('brief_date').notNull(),
    // Calendar events for the day (JSON array of event objects)
    calendarEvents: jsonb('calendar_events').$type<CalendarEventData[]>(),
    // Emails from the past 24 hours (JSON array of email objects)
    emails: jsonb('emails').$type<EmailData[]>(),
    // Weather data
    weather: jsonb('weather').$type<WeatherBriefData | null>(),
    // The generated brief content
    briefContent: text('brief_content'),
    // Brief generation status
    status: text('status')
      .$type<'pending' | 'generating' | 'completed' | 'failed'>()
      .$default(() => 'pending')
      .notNull(),
    // Error message if generation failed
    errorMessage: text('error_message'),
    // Statistics
    totalEvents: text('total_events'),
    totalEmails: text('total_emails'),
    emailsNeedingResponse: text('emails_needing_response'),
    // When the brief was generated
    generatedAt: timestamp('generated_at'),
    // AI-enriched content from Discord bot
    enrichedContent: jsonb('enriched_content').$type<EnrichedBriefData | null>(),
    // When the brief was enriched
    enrichedAt: timestamp('enriched_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_daily_brief_user_id').on(table.userId),
    index('idx_daily_brief_date').on(table.briefDate),
    index('idx_daily_brief_user_date').on(table.userId, table.briefDate),
  ]
);

// Type definitions matching EA app
export type CalendarEventData = {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  meetingLink?: string;
  attendees?: { email: string; name?: string; responseStatus?: string }[];
  isAllDay?: boolean;
  transparency?: 'opaque' | 'transparent';
};

export type EmailData = {
  id: string;
  threadId: string;
  subject: string;
  from: { email: string; name?: string };
  to: { email: string; name?: string }[];
  snippet: string;
  receivedAt: string;
  isRead: boolean;
  labels?: string[];
  importance: 'high' | 'medium' | 'low';
  actionStatus: 'needs_response' | 'awaiting_reply' | 'fyi' | 'none';
};

export type WeatherBriefData = {
  temperature: number;
  temperatureCelsius: number;
  condition: string;
  conditionCode: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  uvIndex?: number;
  precipitationProbability?: number;
  recommendation: string;
  locationName: string;
  fetchedAt: string;
};

export type EnrichedBriefData = {
  daySummary: string;
  conversations: {
    byTopic: {
      topic: string;
      threads: {
        threadId: string;
        subject: string;
        narrative: string;
        suggestedAction?: string;
      }[];
    }[];
    highlights: {
      threadId: string;
      subject: string;
      whyImportant: string;
      suggestedResponse?: string;
    }[];
  };
  calendarInsights?: {
    busyPeriods: string[];
    focusTimeAvailable: string[];
    keyMeetings: { title: string; why: string }[];
  };
  vaultConnections?: {
    relatedProjects: string[];
    relevantNotes: string[];
  };
  enrichedBy: string;
};

// Inferred types
export type DailyBrief = typeof dailyBrief.$inferSelect;
export type User = typeof user.$inferSelect;

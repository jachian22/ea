// Database schema - PLACEHOLDER
// This file will be replaced with actual schema from ea/src/db/schema.ts

import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const googleIntegration = pgTable('google_integration', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: timestamp('expires_at'),
  scope: text('scope'),
  connectedEmail: text('connected_email'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const dailyBrief = pgTable('daily_brief', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  date: timestamp('date').notNull(),
  status: text('status').notNull().default('pending'),
  calendarEvents: jsonb('calendar_events'),
  emails: jsonb('emails'),
  enrichedContent: text('enriched_content'),
  statistics: jsonb('statistics'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

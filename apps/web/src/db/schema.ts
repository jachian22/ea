import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  jsonb,
  date,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// JSON value type for metadata fields - compatible with TanStack Start inference
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonValue = any;

// User table - Core user information for authentication
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified')
    .$defaultFn(() => false)
    .notNull(),
  image: text('image'),
  isAdmin: boolean('is_admin')
    .$default(() => false)
    .notNull(),
  // Subscription fields
  stripeCustomerId: text('stripe_customer_id'),
  subscriptionId: text('subscription_id'),
  plan: text('plan')
    .$default(() => 'free')
    .notNull(),
  subscriptionStatus: text('subscription_status'),
  subscriptionExpiresAt: timestamp('subscription_expires_at'),
  createdAt: timestamp('created_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp('updated_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Session table - Better Auth session management
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

// Account table - Better Auth OAuth provider accounts
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

// Verification table - Better Auth email verification
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()),
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

// Daily Brief - AI-generated morning briefs
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
    // Weather data for the brief (Phase 1 of Brief v2)
    weather: jsonb('weather').$type<WeatherBriefData | null>(),
    // The generated brief content (markdown or structured text)
    briefContent: text('brief_content'),
    // Brief generation status
    status: text('status')
      .$type<'pending' | 'generating' | 'completed' | 'failed'>()
      .$default(() => 'pending')
      .notNull(),
    // Error message if generation failed
    errorMessage: text('error_message'),
    // Statistics for the brief
    totalEvents: text('total_events'),
    totalEmails: text('total_emails'),
    emailsNeedingResponse: text('emails_needing_response'),
    // When the brief was generated
    generatedAt: timestamp('generated_at'),
    // AI-enriched content from Discord bot (Phase 3 of Brief v2)
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

// Weather data stored with briefs (Phase 1 of Brief v2)
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

// Type definitions for JSONB fields
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
  /** "opaque" = busy (default), "transparent" = free/available */
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
  // AI-categorized importance
  importance: 'high' | 'medium' | 'low';
  // Action status
  actionStatus: 'needs_response' | 'awaiting_reply' | 'fyi' | 'none';
};

// AI-enriched brief content from Discord bot (Phase 3 of Brief v2)
export type EnrichedBriefData = {
  // Overall day summary
  daySummary: string;
  // Enriched conversation data
  conversations: {
    // Topic groupings (work, personal, finance, etc.)
    byTopic: {
      topic: string;
      threads: {
        threadId: string;
        subject: string;
        narrative: string; // AI-generated conversation narrative
        suggestedAction?: string;
      }[];
    }[];
    // Key conversations needing attention
    highlights: {
      threadId: string;
      subject: string;
      whyImportant: string;
      suggestedResponse?: string;
    }[];
  };
  // Calendar insights
  calendarInsights?: {
    busyPeriods: string[];
    focusTimeAvailable: string[];
    keyMeetings: { title: string; why: string }[];
  };
  // Vault context connections (if any)
  vaultConnections?: {
    relatedProjects: string[];
    relevantNotes: string[];
  };
  // Enrichment metadata
  enrichedBy: string; // e.g., "discord-bot-v1"
};

// Bank Account - Configured bank accounts for statement automation
export const bankAccount = pgTable(
  'bank_account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    bank: text('bank').notNull(), // "chase", "bofa", "wells-fargo", "capital-one", "amex"
    accountType: text('account_type').notNull(), // "checking", "savings", "credit"
    last4: text('last_4').notNull(),
    nickname: text('nickname'),
    isEnabled: boolean('is_enabled').$default(() => true),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_bank_account_user_id').on(table.userId),
    index('idx_bank_account_bank').on(table.bank),
  ]
);

// Bank Statement - Individual downloaded statements
export const bankStatement = pgTable(
  'bank_statement',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    bankAccountId: text('bank_account_id')
      .notNull()
      .references(() => bankAccount.id, { onDelete: 'cascade' }),
    statementDate: text('statement_date').notNull(), // e.g., "2025-01"
    filePath: text('file_path').notNull(),
    fileSize: integer('file_size'),
    downloadedAt: timestamp('downloaded_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_bank_statement_account_id').on(table.bankAccountId),
    index('idx_bank_statement_date').on(table.statementDate),
  ]
);

// Statement Run - History of automation runs
export const statementRun = pgTable(
  'statement_run',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<'running' | 'completed' | 'failed' | 'mfa_required'>().notNull(),
    startedAt: timestamp('started_at')
      .$defaultFn(() => new Date())
      .notNull(),
    completedAt: timestamp('completed_at'),
    statementsDownloaded: integer('statements_downloaded').$default(() => 0),
    banksProcessed: jsonb('banks_processed').$type<BanksProcessedData>(),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('idx_statement_run_user_id').on(table.userId),
    index('idx_statement_run_status').on(table.status),
    index('idx_statement_run_started_at').on(table.startedAt),
  ]
);

// Type for banks processed JSONB
export type BanksProcessedData = {
  [bank: string]: {
    status: 'success' | 'failed' | 'mfa_required' | 'mfa_timeout' | 'skipped';
    statementsDownloaded?: number;
    error?: string;
  };
};

// User Profile - Extended profile information
export const userProfile = pgTable(
  'user_profile',
  {
    id: text('id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    bio: text('bio'),
    /** Location for weather (city name or "lat,lon" format) */
    location: text('location'),
    /** User's timezone (e.g., "America/New_York") */
    timezone: text('timezone'),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('idx_user_profile_id').on(table.id)]
);

// Relations
export const userRelations = relations(user, ({ one, many }) => ({
  profile: one(userProfile, {
    fields: [user.id],
    references: [userProfile.id],
  }),
  googleIntegration: one(googleIntegration, {
    fields: [user.id],
    references: [googleIntegration.userId],
  }),
  dailyBriefs: many(dailyBrief),
  bankAccounts: many(bankAccount),
  statementRuns: many(statementRun),
  // Phase 1: Knowledge Graph Foundation
  relationships: many(relationship),
  domainRules: many(domainRule),
  privacySettings: one(privacySettings, {
    fields: [user.id],
    references: [privacySettings.userId],
  }),
  backfillJobs: many(backfillJob),
  // Phase 2: Observation & Briefing
  persons: many(person),
  interactions: many(interaction),
  commitments: many(commitment),
  notifications: many(notification),
  notificationPreferences: one(notificationPreferences, {
    fields: [user.id],
    references: [notificationPreferences.userId],
  }),
  meetingBriefings: many(meetingBriefing),
  ingestionEvents: many(ingestionEvent),
  // Phase 3: Action Authority Framework
  authoritySettings: many(authoritySetting),
  actionLogs: many(actionLog),
}));

export const googleIntegrationRelations = relations(googleIntegration, ({ one }) => ({
  user: one(user, {
    fields: [googleIntegration.userId],
    references: [user.id],
  }),
}));

export const dailyBriefRelations = relations(dailyBrief, ({ one }) => ({
  user: one(user, {
    fields: [dailyBrief.userId],
    references: [user.id],
  }),
}));

export const userProfileRelations = relations(userProfile, ({ one }) => ({
  user: one(user, {
    fields: [userProfile.id],
    references: [user.id],
  }),
}));

export const bankAccountRelations = relations(bankAccount, ({ one, many }) => ({
  user: one(user, {
    fields: [bankAccount.userId],
    references: [user.id],
  }),
  statements: many(bankStatement),
}));

export const bankStatementRelations = relations(bankStatement, ({ one }) => ({
  bankAccount: one(bankAccount, {
    fields: [bankStatement.bankAccountId],
    references: [bankAccount.id],
  }),
}));

export const statementRunRelations = relations(statementRun, ({ one }) => ({
  user: one(user, {
    fields: [statementRun.userId],
    references: [user.id],
  }),
}));

// Type exports
export type User = typeof user.$inferSelect;
export type CreateUserData = typeof user.$inferInsert;
export type UpdateUserData = Partial<Omit<CreateUserData, 'id' | 'createdAt'>>;

export type UserProfile = typeof userProfile.$inferSelect;
export type CreateUserProfileData = typeof userProfile.$inferInsert;
export type UpdateUserProfileData = Partial<Omit<CreateUserProfileData, 'id'>>;

export type GoogleIntegration = typeof googleIntegration.$inferSelect;
export type CreateGoogleIntegrationData = typeof googleIntegration.$inferInsert;
export type UpdateGoogleIntegrationData = Partial<
  Omit<CreateGoogleIntegrationData, 'id' | 'userId' | 'createdAt'>
>;

export type DailyBrief = typeof dailyBrief.$inferSelect;
export type CreateDailyBriefData = typeof dailyBrief.$inferInsert;
export type UpdateDailyBriefData = Partial<
  Omit<CreateDailyBriefData, 'id' | 'userId' | 'createdAt'>
>;
export type DailyBriefStatus = 'pending' | 'generating' | 'completed' | 'failed';

// Bank Account types
export type BankAccount = typeof bankAccount.$inferSelect;
export type CreateBankAccountData = typeof bankAccount.$inferInsert;
export type UpdateBankAccountData = Partial<
  Omit<CreateBankAccountData, 'id' | 'userId' | 'createdAt'>
>;

// Bank Statement types
export type BankStatement = typeof bankStatement.$inferSelect;
export type CreateBankStatementData = typeof bankStatement.$inferInsert;

// Statement Run types
export type StatementRun = typeof statementRun.$inferSelect;
export type CreateStatementRunData = typeof statementRun.$inferInsert;
export type UpdateStatementRunData = Partial<
  Omit<CreateStatementRunData, 'id' | 'userId' | 'startedAt'>
>;
export type StatementRunStatus = 'running' | 'completed' | 'failed' | 'mfa_required';

// Subscription types
export type SubscriptionPlan = 'free' | 'basic' | 'pro';
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'past_due'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | null;

// ============================================================================
// Phase 2: Observation & Briefing Capabilities
// ============================================================================

// Person - Auto-maintained profiles for contacts/relationships
export const person = pgTable(
  'person',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Basic info
    email: text('email').notNull(), // Primary email
    emails: jsonb('emails')
      .$type<string[]>()
      .$default(() => []), // All known emails
    name: text('name'),
    phone: text('phone'),
    // Organization info
    role: text('role'),
    company: text('company'),
    // Categorization
    domain: text('domain')
      .$type<PersonDomain>()
      .$default(() => 'business'),
    // Auto-calculated importance score (0-100)
    importanceScore: integer('importance_score').$default(() => 50),
    // Communication patterns
    preferredChannel: text('preferred_channel').$type<CommunicationChannel>(),
    averageResponseTime: integer('average_response_time'), // in hours
    // Stats
    totalInteractions: integer('total_interactions').$default(() => 0),
    lastContactAt: timestamp('last_contact_at'),
    lastContactChannel: text('last_contact_channel').$type<CommunicationChannel>(),
    firstContactAt: timestamp('first_contact_at'),
    // User notes
    personalNotes: text('personal_notes'),
    // External IDs for deduplication
    googleContactId: text('google_contact_id'),
    // Extensible metadata
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>(),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_person_user_id').on(table.userId),
    index('idx_person_email').on(table.email),
    index('idx_person_user_email').on(table.userId, table.email),
    index('idx_person_domain').on(table.domain),
    index('idx_person_importance').on(table.importanceScore),
  ]
);

// Person domain types
export type PersonDomain = 'business' | 'job' | 'family' | 'personal' | 'other';
export type CommunicationChannel = 'email' | 'slack' | 'phone' | 'meeting' | 'other';

// Interaction - History of communications with people
export const interaction = pgTable(
  'interaction',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    // Interaction details
    type: text('type').$type<InteractionType>().notNull(),
    channel: text('channel').$type<CommunicationChannel>().notNull(),
    direction: text('direction').$type<'inbound' | 'outbound'>().notNull(),
    // Content summary
    subject: text('subject'),
    summary: text('summary'),
    // Reference to source
    sourceType: text('source_type').$type<'email' | 'calendar' | 'manual'>(),
    sourceId: text('source_id'), // Gmail message ID or Calendar event ID
    // Timing
    occurredAt: timestamp('occurred_at').notNull(),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_interaction_user_id').on(table.userId),
    index('idx_interaction_person_id').on(table.personId),
    index('idx_interaction_occurred_at').on(table.occurredAt),
    index('idx_interaction_source').on(table.sourceType, table.sourceId),
  ]
);

export type InteractionType = 'email' | 'meeting' | 'call' | 'message' | 'other';

// Commitment - Things promised to/from people
export const commitment = pgTable(
  'commitment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    personId: text('person_id').references(() => person.id, { onDelete: 'set null' }),
    // What was committed
    description: text('description').notNull(),
    // Direction: who owes whom
    direction: text('direction').$type<'user_owes' | 'they_owe'>().notNull(),
    // Status tracking
    status: text('status')
      .$type<CommitmentStatus>()
      .$default(() => 'pending')
      .notNull(),
    // Dates
    promisedAt: timestamp('promised_at'),
    dueDate: timestamp('due_date'),
    completedAt: timestamp('completed_at'),
    // Evidence of completion
    completionEvidence: text('completion_evidence'),
    // Source tracking
    sourceType: text('source_type').$type<'email' | 'calendar' | 'manual'>(),
    sourceId: text('source_id'),
    // Priority
    priority: text('priority')
      .$type<'high' | 'medium' | 'low'>()
      .$default(() => 'medium'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_commitment_user_id').on(table.userId),
    index('idx_commitment_person_id').on(table.personId),
    index('idx_commitment_status').on(table.status),
    index('idx_commitment_due_date').on(table.dueDate),
    index('idx_commitment_direction').on(table.direction),
  ]
);

export type CommitmentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type CommitmentPriority = 'high' | 'medium' | 'low';

// Commitment Reminder - Configurable reminders for commitments
export const commitmentReminder = pgTable(
  'commitment_reminder',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    commitmentId: text('commitment_id')
      .notNull()
      .references(() => commitment.id, { onDelete: 'cascade' }),
    // When to remind
    remindAt: timestamp('remind_at').notNull(),
    // Reminder config
    reminderType: text('reminder_type').$type<'before_due' | 'overdue' | 'custom'>().notNull(),
    daysOffset: integer('days_offset'), // days before/after due date
    // Status
    isSent: boolean('is_sent').$default(() => false),
    sentAt: timestamp('sent_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_commitment_reminder_commitment_id').on(table.commitmentId),
    index('idx_commitment_reminder_remind_at').on(table.remindAt),
    index('idx_commitment_reminder_unsent').on(table.isSent, table.remindAt),
  ]
);

// Notification - All notifications for users
export const notification = pgTable(
  'notification',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Notification content
    type: text('type').$type<NotificationType>().notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // Urgency and delivery
    urgency: text('urgency')
      .$type<'high' | 'medium' | 'low'>()
      .$default(() => 'medium'),
    channels: jsonb('channels')
      .$type<NotificationChannel[]>()
      .$default(() => ['in_app']),
    // Status tracking
    isRead: boolean('is_read').$default(() => false),
    readAt: timestamp('read_at'),
    // Delivery tracking per channel
    deliveryStatus: jsonb('delivery_status').$type<NotificationDeliveryStatus>(),
    // Reference to related entity
    relatedType: text('related_type').$type<'commitment' | 'meeting' | 'person' | 'brief'>(),
    relatedId: text('related_id'),
    // Metadata
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>(),
    // Timing
    scheduledFor: timestamp('scheduled_for'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_notification_user_id').on(table.userId),
    index('idx_notification_type').on(table.type),
    index('idx_notification_unread').on(table.userId, table.isRead),
    index('idx_notification_scheduled').on(table.scheduledFor),
  ]
);

export type NotificationType =
  | 'meeting_briefing_ready'
  | 'commitment_due_today'
  | 'commitment_overdue'
  | 'high_importance_email'
  | 'follow_up_reminder'
  | 'weekly_relationship_review'
  | 'daily_digest';

export type NotificationChannel = 'in_app' | 'push' | 'email';

export type NotificationDeliveryStatus = {
  [K in NotificationChannel]?: {
    sent: boolean;
    sentAt?: string;
    error?: string;
  };
};

// Notification Preferences - Per-user notification settings
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Per-type preferences
    preferences: jsonb('preferences')
      .$type<NotificationPreferencesConfig>()
      .$default(() => ({})),
    // Quiet hours
    quietHoursEnabled: boolean('quiet_hours_enabled').$default(() => false),
    quietHoursStart: text('quiet_hours_start'), // "22:00" format
    quietHoursEnd: text('quiet_hours_end'), // "08:00" format
    // Timezone
    timezone: text('timezone').$default(() => 'America/Los_Angeles'),
    // Batching preferences
    batchDigest: boolean('batch_digest').$default(() => true),
    digestTime: text('digest_time').$default(() => '07:00'), // When to send batched notifications
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index('idx_notification_preferences_user_id').on(table.userId)]
);

export type NotificationPreferencesConfig = {
  [K in NotificationType]?: {
    enabled: boolean;
    channels: NotificationChannel[];
  };
};

// Meeting Briefing - Pre-generated briefings for upcoming meetings
export const meetingBriefing = pgTable(
  'meeting_briefing',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Meeting info (from calendar)
    calendarEventId: text('calendar_event_id').notNull(),
    meetingTitle: text('meeting_title').notNull(),
    meetingStartTime: timestamp('meeting_start_time').notNull(),
    meetingEndTime: timestamp('meeting_end_time').notNull(),
    meetingLocation: text('meeting_location'),
    meetingLink: text('meeting_link'),
    // Attendee info
    attendees: jsonb('attendees').$type<MeetingAttendeeInfo[]>(),
    // Context
    previousMeetings: jsonb('previous_meetings').$type<PreviousMeetingInfo[]>(),
    relatedEmailThreads: jsonb('related_email_threads').$type<RelatedEmailThread[]>(),
    upcomingCommitments: jsonb('upcoming_commitments').$type<BriefingCommitmentInfo[]>(),
    // Suggested prep
    suggestedPrep: jsonb('suggested_prep').$type<SuggestedPrepItem[]>(),
    // Generated briefing content
    briefingContent: text('briefing_content'),
    // Status
    status: text('status')
      .$type<'pending' | 'generating' | 'completed' | 'failed'>()
      .$default(() => 'pending')
      .notNull(),
    errorMessage: text('error_message'),
    // Notification tracking
    notificationSentAt: timestamp('notification_sent_at'),
    // Timing
    generatedAt: timestamp('generated_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_meeting_briefing_user_id').on(table.userId),
    index('idx_meeting_briefing_event_id').on(table.calendarEventId),
    index('idx_meeting_briefing_start_time').on(table.meetingStartTime),
    index('idx_meeting_briefing_user_event').on(table.userId, table.calendarEventId),
  ]
);

// Meeting briefing JSONB types
export type MeetingAttendeeInfo = {
  email: string;
  name?: string;
  personId?: string;
  role?: string;
  company?: string;
  domain?: PersonDomain;
  lastContactAt?: string;
  lastContactChannel?: CommunicationChannel;
  openCommitmentsYouOwe?: { description: string; dueDate?: string }[];
  openCommitmentsTheyOwe?: { description: string; dueDate?: string }[];
  recentInteractions?: { date: string; summary: string }[];
  personalNotes?: string;
};

export type PreviousMeetingInfo = {
  id: string;
  title: string;
  date: string;
  summary?: string;
};

export type RelatedEmailThread = {
  threadId: string;
  subject: string;
  lastMessageDate: string;
  participantEmails: string[];
};

export type BriefingCommitmentInfo = {
  id: string;
  description: string;
  direction: 'user_owes' | 'they_owe';
  personName?: string;
  dueDate?: string;
  isOverdue: boolean;
};

export type SuggestedPrepItem = {
  type: 'follow_up' | 'ask_about' | 'remember';
  description: string;
  personName?: string;
  relatedCommitmentId?: string;
};

// Ingestion Event - Tracking webhook and sync events
export const ingestionEvent = pgTable(
  'ingestion_event',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Event source
    source: text('source').$type<'gmail_webhook' | 'calendar_webhook' | 'manual_sync'>().notNull(),
    // Event type
    eventType: text('event_type')
      .$type<'new_email' | 'email_update' | 'calendar_event' | 'calendar_update'>()
      .notNull(),
    // External reference
    externalId: text('external_id').notNull(), // Gmail history ID or Calendar sync token
    // Processing status
    status: text('status')
      .$type<'pending' | 'processing' | 'completed' | 'failed' | 'duplicate'>()
      .$default(() => 'pending')
      .notNull(),
    errorMessage: text('error_message'),
    // Payload for debugging
    payload: jsonb('payload').$type<Record<string, JsonValue>>(),
    // Results
    personsCreated: integer('persons_created').$default(() => 0),
    interactionsCreated: integer('interactions_created').$default(() => 0),
    commitmentsDetected: integer('commitments_detected').$default(() => 0),
    // Timing
    processedAt: timestamp('processed_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_ingestion_event_user_id').on(table.userId),
    index('idx_ingestion_event_status').on(table.status),
    index('idx_ingestion_event_external_id').on(table.externalId),
    index('idx_ingestion_event_source').on(table.source),
  ]
);

// Relationship - Defines relationships between user and people
export type RelationType =
  | 'spouse'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'friend'
  | 'client'
  | 'vendor'
  | 'colleague'
  | 'manager'
  | 'report'
  | 'investor'
  | 'partner'
  | 'other';

export const relationship = pgTable(
  'relationship',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => person.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').$type<RelationType>().notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, JsonValue>>(),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_relationship_user_id').on(table.userId),
    index('idx_relationship_person_id').on(table.personId),
    index('idx_relationship_user_person').on(table.userId, table.personId),
    index('idx_relationship_type').on(table.relationType),
  ]
);

// Domain Rule - User-defined rules for automatic domain classification
export type DomainRuleType = 'email_domain' | 'email_address' | 'person' | 'keyword';

export const domainRule = pgTable(
  'domain_rule',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ruleType: text('rule_type').$type<DomainRuleType>().notNull(),
    pattern: text('pattern').notNull(), // e.g., "@acme.com", "john@example.com", "invoice"
    domain: text('domain').$type<PersonDomain>().notNull(),
    priority: integer('priority').$default(() => 0), // Higher = takes precedence
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_domain_rule_user_id').on(table.userId),
    index('idx_domain_rule_type').on(table.ruleType),
    index('idx_domain_rule_priority').on(table.priority),
  ]
);

// Privacy Settings - Control what data can be sent to cloud AI
export const privacySettings = pgTable(
  'privacy_settings',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    allowCloudAI: boolean('allow_cloud_ai')
      .$default(() => true)
      .notNull(),
    excludedDomains: jsonb('excluded_domains')
      .$type<PersonDomain[]>()
      .$default(() => []),
    excludedPersonIds: jsonb('excluded_person_ids')
      .$type<string[]>()
      .$default(() => []),
    excludedEmailDomains: jsonb('excluded_email_domains')
      .$type<string[]>()
      .$default(() => []),
    redactPatterns: jsonb('redact_patterns')
      .$type<string[]>()
      .$default(() => []),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index('idx_privacy_settings_user_id').on(table.userId)]
);

// Backfill Job - Track historical data processing
export type BackfillJobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';
export type BackfillSourceType = 'gmail' | 'calendar' | 'all';

export type BackfillProgress = {
  processed: number;
  total: number;
  lastProcessedId?: string;
  currentPhase?: string;
};

export const backfillJob = pgTable(
  'backfill_job',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status')
      .$type<BackfillJobStatus>()
      .$default(() => 'pending')
      .notNull(),
    sourceType: text('source_type').$type<BackfillSourceType>().notNull(),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date').notNull(),
    progress: jsonb('progress')
      .$type<BackfillProgress>()
      .$default(() => ({ processed: 0, total: 0 })),
    error: text('error'),
    // Statistics
    personsCreated: integer('persons_created').$default(() => 0),
    interactionsCreated: integer('interactions_created').$default(() => 0),
    commitmentsDetected: integer('commitments_detected').$default(() => 0),
    // Timing
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_backfill_job_user_id').on(table.userId),
    index('idx_backfill_job_status').on(table.status),
    index('idx_backfill_job_user_status').on(table.userId, table.status),
  ]
);

// ============================================================================
// Phase 2: Relations
// ============================================================================

export const personRelations = relations(person, ({ one, many }) => ({
  user: one(user, {
    fields: [person.userId],
    references: [user.id],
  }),
  interactions: many(interaction),
  commitments: many(commitment),
  relationships: many(relationship),
}));

export const relationshipRelations = relations(relationship, ({ one }) => ({
  user: one(user, {
    fields: [relationship.userId],
    references: [user.id],
  }),
  person: one(person, {
    fields: [relationship.personId],
    references: [person.id],
  }),
}));

export const domainRuleRelations = relations(domainRule, ({ one }) => ({
  user: one(user, {
    fields: [domainRule.userId],
    references: [user.id],
  }),
}));

export const privacySettingsRelations = relations(privacySettings, ({ one }) => ({
  user: one(user, {
    fields: [privacySettings.userId],
    references: [user.id],
  }),
}));

export const backfillJobRelations = relations(backfillJob, ({ one }) => ({
  user: one(user, {
    fields: [backfillJob.userId],
    references: [user.id],
  }),
}));

export const interactionRelations = relations(interaction, ({ one }) => ({
  user: one(user, {
    fields: [interaction.userId],
    references: [user.id],
  }),
  person: one(person, {
    fields: [interaction.personId],
    references: [person.id],
  }),
}));

export const commitmentRelations = relations(commitment, ({ one, many }) => ({
  user: one(user, {
    fields: [commitment.userId],
    references: [user.id],
  }),
  person: one(person, {
    fields: [commitment.personId],
    references: [person.id],
  }),
  reminders: many(commitmentReminder),
}));

export const commitmentReminderRelations = relations(commitmentReminder, ({ one }) => ({
  commitment: one(commitment, {
    fields: [commitmentReminder.commitmentId],
    references: [commitment.id],
  }),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
  user: one(user, {
    fields: [notification.userId],
    references: [user.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(user, {
    fields: [notificationPreferences.userId],
    references: [user.id],
  }),
}));

export const meetingBriefingRelations = relations(meetingBriefing, ({ one }) => ({
  user: one(user, {
    fields: [meetingBriefing.userId],
    references: [user.id],
  }),
}));

export const ingestionEventRelations = relations(ingestionEvent, ({ one }) => ({
  user: one(user, {
    fields: [ingestionEvent.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// Phase 2: Type Exports
// ============================================================================

// Person types
export type Person = typeof person.$inferSelect;
export type CreatePersonData = typeof person.$inferInsert;
export type UpdatePersonData = Partial<Omit<CreatePersonData, 'id' | 'userId' | 'createdAt'>>;

// Interaction types
export type Interaction = typeof interaction.$inferSelect;
export type CreateInteractionData = typeof interaction.$inferInsert;

// Commitment types
export type Commitment = typeof commitment.$inferSelect;
export type CreateCommitmentData = typeof commitment.$inferInsert;
export type UpdateCommitmentData = Partial<
  Omit<CreateCommitmentData, 'id' | 'userId' | 'createdAt'>
>;

// Commitment Reminder types
export type CommitmentReminder = typeof commitmentReminder.$inferSelect;
export type CreateCommitmentReminderData = typeof commitmentReminder.$inferInsert;

// Notification types
export type Notification = typeof notification.$inferSelect;
export type CreateNotificationData = typeof notification.$inferInsert;
export type UpdateNotificationData = Partial<
  Omit<CreateNotificationData, 'id' | 'userId' | 'createdAt'>
>;

// Notification Preferences types
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type CreateNotificationPreferencesData = typeof notificationPreferences.$inferInsert;
export type UpdateNotificationPreferencesData = Partial<
  Omit<CreateNotificationPreferencesData, 'id' | 'userId' | 'createdAt'>
>;

// Meeting Briefing types
export type MeetingBriefing = typeof meetingBriefing.$inferSelect;
export type CreateMeetingBriefingData = typeof meetingBriefing.$inferInsert;
export type UpdateMeetingBriefingData = Partial<
  Omit<CreateMeetingBriefingData, 'id' | 'userId' | 'createdAt'>
>;
export type MeetingBriefingStatus = 'pending' | 'generating' | 'completed' | 'failed';

// Ingestion Event types
export type IngestionEvent = typeof ingestionEvent.$inferSelect;
export type CreateIngestionEventData = typeof ingestionEvent.$inferInsert;
export type UpdateIngestionEventData = Partial<
  Omit<CreateIngestionEventData, 'id' | 'userId' | 'createdAt'>
>;

// Relationship types
export type Relationship = typeof relationship.$inferSelect;
export type CreateRelationshipData = typeof relationship.$inferInsert;
export type UpdateRelationshipData = Partial<
  Omit<CreateRelationshipData, 'id' | 'userId' | 'createdAt'>
>;

// Domain Rule types
export type DomainRule = typeof domainRule.$inferSelect;
export type CreateDomainRuleData = typeof domainRule.$inferInsert;
export type UpdateDomainRuleData = Partial<
  Omit<CreateDomainRuleData, 'id' | 'userId' | 'createdAt'>
>;

// Privacy Settings types
export type PrivacySettings = typeof privacySettings.$inferSelect;
export type CreatePrivacySettingsData = typeof privacySettings.$inferInsert;
export type UpdatePrivacySettingsData = Partial<
  Omit<CreatePrivacySettingsData, 'id' | 'userId' | 'createdAt'>
>;

// Backfill Job types
export type BackfillJob = typeof backfillJob.$inferSelect;
export type CreateBackfillJobData = typeof backfillJob.$inferInsert;
export type UpdateBackfillJobData = Partial<
  Omit<CreateBackfillJobData, 'id' | 'userId' | 'createdAt'>
>;

// ============================================================================
// Phase 3: Action Authority Framework
// ============================================================================

// Action type enum values
export type ActionCategory = 'calendar' | 'email' | 'task' | 'notification';
export type RiskLevel = 'low' | 'medium' | 'high';
export type AuthorityLevel = 'full_auto' | 'draft_approve' | 'ask_first' | 'disabled';
export type ActionLogStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'reversed';
export type ActionTargetType = 'email' | 'calendar_event' | 'commitment' | 'person';
export type UserFeedback = 'correct' | 'should_ask' | 'should_auto' | 'wrong';

// Action Type - Defines what actions the system can take
export const actionType = pgTable(
  'action_type',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text('name').notNull().unique(),
    category: text('category').$type<ActionCategory>().notNull(),
    description: text('description'),
    riskLevel: text('risk_level').$type<RiskLevel>().notNull(),
    defaultAuthorityLevel: text('default_authority_level').$type<AuthorityLevel>().notNull(),
    reversible: boolean('reversible')
      .$default(() => false)
      .notNull(),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_action_type_name').on(table.name),
    index('idx_action_type_category').on(table.category),
  ]
);

// Authority Setting - Per-user settings for action types
export const authoritySetting = pgTable(
  'authority_setting',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actionTypeId: text('action_type_id')
      .notNull()
      .references(() => actionType.id, { onDelete: 'cascade' }),
    authorityLevel: text('authority_level').$type<AuthorityLevel>().notNull(),
    conditions: jsonb('conditions').$type<AuthorityConditions>(),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp('updated_at')
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index('idx_authority_setting_user_id').on(table.userId),
    index('idx_authority_setting_action_type_id').on(table.actionTypeId),
    index('idx_authority_setting_user_action').on(table.userId, table.actionTypeId),
  ]
);

// Authority Conditions - Optional constraints for authority settings
export type AuthorityConditions = {
  // Time-based conditions
  timeWindow?: {
    start: string; // "09:00"
    end: string; // "17:00"
    timezone?: string;
  };
  // Sender/recipient conditions
  allowedDomains?: string[];
  blockedDomains?: string[];
  vipOnly?: boolean;
  // Confidence threshold
  minConfidence?: number; // 0-1
  // Custom rules
  customRules?: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'matches' | 'gt' | 'lt';
    value: string | number;
  }>;
};

// Action Log - Records of actions taken by the system
export const actionLog = pgTable(
  'action_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actionTypeId: text('action_type_id')
      .notNull()
      .references(() => actionType.id, { onDelete: 'cascade' }),
    authorityLevel: text('authority_level').$type<AuthorityLevel>().notNull(),
    status: text('status')
      .$type<ActionLogStatus>()
      .$default(() => 'pending_approval')
      .notNull(),
    targetType: text('target_type').$type<ActionTargetType>().notNull(),
    targetId: text('target_id').notNull(),
    description: text('description').notNull(),
    payload: jsonb('payload').$type<Record<string, JsonValue>>(),
    confidenceScore: integer('confidence_score'), // 0-100 stored as integer
    userFeedback: text('user_feedback').$type<UserFeedback>(),
    executedAt: timestamp('executed_at'),
    approvedAt: timestamp('approved_at'),
    rejectedAt: timestamp('rejected_at'),
    createdAt: timestamp('created_at')
      .$defaultFn(() => new Date())
      .notNull(),
    metadata: jsonb('metadata').$type<ActionLogMetadata>(),
  },
  (table) => [
    index('idx_action_log_user_id').on(table.userId),
    index('idx_action_log_action_type_id').on(table.actionTypeId),
    index('idx_action_log_status').on(table.status),
    index('idx_action_log_user_status').on(table.userId, table.status),
    index('idx_action_log_target').on(table.targetType, table.targetId),
    index('idx_action_log_created_at').on(table.createdAt),
  ]
);

// Action Log Metadata type
export type ActionLogMetadata = {
  // Source information
  triggeredBy?: 'auto' | 'user' | 'job';
  triggeredJobId?: string;
  // Related entities
  relatedEmailId?: string;
  relatedCalendarEventId?: string;
  relatedCommitmentId?: string;
  relatedPersonId?: string;
  // Draft content (for draft_approve actions)
  draftContent?: string;
  editedContent?: string;
  // Rejection/failure details
  rejectionReason?: string;
  failureReason?: string;
  // Reversal information
  reversedAt?: string;
  reversedBy?: 'user' | 'system';
  reversalReason?: string;
  // Confidence breakdown
  confidenceFactors?: Array<{
    factor: string;
    weight: number;
    contribution: number;
  }>;
};

// ============================================================================
// Phase 3: Relations
// ============================================================================

export const actionTypeRelations = relations(actionType, ({ many }) => ({
  authoritySettings: many(authoritySetting),
  actionLogs: many(actionLog),
}));

export const authoritySettingRelations = relations(authoritySetting, ({ one }) => ({
  user: one(user, {
    fields: [authoritySetting.userId],
    references: [user.id],
  }),
  actionType: one(actionType, {
    fields: [authoritySetting.actionTypeId],
    references: [actionType.id],
  }),
}));

export const actionLogRelations = relations(actionLog, ({ one }) => ({
  user: one(user, {
    fields: [actionLog.userId],
    references: [user.id],
  }),
  actionType: one(actionType, {
    fields: [actionLog.actionTypeId],
    references: [actionType.id],
  }),
}));

// ============================================================================
// Phase 3: Type Exports
// ============================================================================

// Action Type types
export type ActionType = typeof actionType.$inferSelect;
export type CreateActionTypeData = typeof actionType.$inferInsert;
export type UpdateActionTypeData = Partial<Omit<CreateActionTypeData, 'id' | 'createdAt'>>;

// Authority Setting types
export type AuthoritySetting = typeof authoritySetting.$inferSelect;
export type CreateAuthoritySettingData = typeof authoritySetting.$inferInsert;
export type UpdateAuthoritySettingData = Partial<
  Omit<CreateAuthoritySettingData, 'id' | 'userId' | 'createdAt'>
>;

// Action Log types
export type ActionLog = typeof actionLog.$inferSelect;
export type CreateActionLogData = typeof actionLog.$inferInsert;
export type UpdateActionLogData = Partial<Omit<CreateActionLogData, 'id' | 'userId' | 'createdAt'>>;

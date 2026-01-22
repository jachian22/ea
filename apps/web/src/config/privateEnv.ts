export const privateEnv = {
  // Database
  DATABASE_URL: process.env.DATABASE_URL!,

  // Stripe (optional for personal use)
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  // R2 Storage (optional)
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID || '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY || '',

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,

  // Google OAuth for Gmail/Calendar integration
  GOOGLE_OAUTH_REDIRECT_URI: process.env.GOOGLE_OAUTH_REDIRECT_URI!,

  // Daily Brief Scheduler (optional - have defaults)
  DAILY_BRIEF_CRON: process.env.DAILY_BRIEF_CRON,
  DAILY_BRIEF_TIMEZONE: process.env.DAILY_BRIEF_TIMEZONE,
} as const;

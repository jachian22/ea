# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Executive Assistant / Daily Brief** application that integrates with Google services to generate AI-powered morning briefings. Users connect their Google account to sync calendar events and emails, which are then summarized into personalized daily briefs.

## Architecture Overview

This is a TanStack Start full-stack React application with the following key architectural patterns:

### Tech Stack

- **Framework**: TanStack Start (full-stack React framework)
- **Database**: PostgreSQL with Drizzle ORM for type-safe queries
- **Authentication**: Better Auth with email/password authentication
- **Styling**: Tailwind CSS v4 with Radix UI components
- **Google Integration**: OAuth 2.0 for Gmail and Calendar access
- **AI**: Brief generation using AI models
- **Payments**: Stripe integration for subscriptions
- **TypeScript**: Full type safety throughout

### Project Structure

```
src/
├── routes/           # File-based routing with TanStack Router
├── components/       # React components (ui/ for base components)
├── db/               # Database configuration and schema
├── data-access/      # Data access layer functions
├── fn/               # Server functions and middleware
├── services/         # External service integrations (Gmail, Calendar, AI)
├── hooks/            # Custom React hooks
├── queries/          # TanStack Query definitions
├── lib/              # Utilities (auth-client, google-client, etc.)
└── utils/            # Helper functions
```

### Database Schema

Core entities in `src/db/schema.ts`:

- **`user`** - Core user with authentication and subscription fields
- **`googleIntegration`** - OAuth tokens for Gmail/Calendar access (access token, refresh token, scopes, connected email)
- **`dailyBrief`** - AI-generated morning briefs containing:
  - Calendar events for the day (JSONB)
  - Emails from past 24 hours (JSONB)
  - AI-generated brief content (markdown)
  - Status: pending/generating/completed/failed
  - Statistics (total events, emails, emails needing response)
- **`userProfile`** - Extended profile information (bio)
- **`session`**, **`account`**, **`verification`** - Better Auth tables

### Key Features

1. **Google OAuth Integration** - Connect Google account for Gmail and Calendar access
2. **Daily Brief Generation** - AI-powered summaries of calendar events and important emails
3. **Email Triage** - Categorizes emails by importance and action needed
4. **Brief History** - View past briefs and track patterns
5. **Subscription Plans** - Free/Basic/Pro tiers with feature limits

### Key Patterns

- **Data Fetching**: Uses TanStack Query with custom hooks pattern
- **Authentication**: Better Auth with session management via middleware
- **Server Functions**: TanStack Start server functions with Zod validation
- **Google Services**: OAuth flow with token refresh handling
- **Type Safety**: Full TypeScript with Drizzle ORM schema inference

## Common Development Commands

```bash
# Development
npm run dev                 # Start development server on port 3000
npm run build              # Build for production (includes type checking)
npm run start              # Start production server

# Database
npm run db:up              # Start PostgreSQL Docker container
npm run db:down            # Stop PostgreSQL Docker container
npm run db:migrate         # Run database migrations
npm run db:generate        # Generate new migration files
npm run db:studio          # Open Drizzle Studio for database management

# Payments (if needed)
npm run stripe:listen      # Listen for Stripe webhooks in development
```

## Environment Setup

1. Copy `.env.example` to `.env` and configure:
   - Database connection (PostgreSQL)
   - Better Auth secrets
   - Google OAuth credentials (client ID, client secret)
   - Stripe keys (for payments)
   - AI API keys (for brief generation)

2. Start database and run migrations:
   ```bash
   npm run db:up
   npm run db:migrate
   ```

## Routes

- `/` - Landing page
- `/sign-in`, `/sign-up` - Authentication
- `/dashboard` - Main dashboard (authenticated)
- `/dashboard/brief` - Daily brief view and history
- `/dashboard/settings` - User settings and Google connection management
- `/profile/$userId` - User profiles

## Key Services

### Brief Generator (`src/services/brief-generator.ts`)

Orchestrates the daily brief generation by:

1. Fetching calendar events for the day
2. Fetching recent emails from Gmail
3. Using AI to generate a summarized brief
4. Storing the result in the database

### Gmail Service (`src/services/gmail.ts`)

Handles Gmail API interactions:

- Fetching recent emails
- Parsing email metadata
- Categorizing by importance

### Google Calendar (`src/services/google-calendar.ts`)

Handles Calendar API interactions:

- Fetching today's events
- Parsing event details and attendees

## Additional Documentation

- **Authentication** - see `docs/authentication.md`
- **Architecture** - see `docs/architecture.md` (layered architecture patterns)
- **Subscriptions** - see `docs/subscriptions.md`
- **TanStack** - see `docs/tanstack.md` (routes and server functions)
- **Theme** - see `docs/theme.md` (light/dark mode, CSS variables)
- **UX** - see `docs/ux.md` (form validation, button states, dialogs)
- **File Uploads** - see `docs/file-uploads.md`

## Development Notes

- Uses TanStack Start's file-based routing system
- Database schema uses text IDs (UUIDs) for primary keys
- Google OAuth tokens are automatically refreshed when expired
- Subscription plans control feature access
- Build process includes TypeScript type checking

## Strategic Context

Research, backlog, and exploration for this project lives at:
`obsidian/builds/ea/`

### Current Thinking

The EA app serves as the operational "cache" layer - pulling in real-time data (calendar, email, future: banking, health) and surfacing actionable intelligence.

Key directions being explored:

- **Expression Pipeline**: Help transform dormant vault knowledge into content outputs (videos, social posts)
- **Data Expansion**: Banking and health data integration
- **Build Awareness**: Connect calendar/email items to active projects in the vault

See `obsidian/builds/ea/backlog.md` for the full roadmap.

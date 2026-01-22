# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

EA (Executive Assistant) is an AI-powered personal assistant that generates daily briefs from email and calendar data. It consists of:

- **Web App** (`apps/web`) - TanStack Start app for Google OAuth and viewing briefs
- **Discord Bot** (`apps/bot`) - Conversational access to briefs and vault queries
- **Shared Packages** (`packages/`) - Database, Google APIs, and core utilities

## Architecture

```
ea/
├── apps/
│   ├── web/          # TanStack Start full-stack React app
│   └── bot/          # Discord.js bot with Claude Code CLI integration
├── packages/
│   ├── core/         # @ea/core - Types and utilities
│   ├── db/           # @ea/db - Drizzle ORM schema and client
│   └── google/       # @ea/google - Gmail and Calendar services
└── scripts/          # Automation (daily refresh cron)
```

## Common Commands

```bash
# Development
npm run dev           # Start web app (localhost:3000)
npm run dev:bot       # Start Discord bot

# Database
npm run db:up         # Start PostgreSQL
npm run db:migrate    # Run migrations
npm run db:studio     # Open Drizzle Studio

# Building
npm run build         # Build everything
npm run build:packages # Build shared packages only

# Code Quality
npm run lint          # ESLint
npm run format        # Prettier
npm run typecheck     # TypeScript
```

## Package Dependencies

```
@ea/core (no dependencies)
    ↓
@ea/db, @ea/google
    ↓
apps/web, apps/bot
```

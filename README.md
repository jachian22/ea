# EA - Executive Assistant

An AI-powered personal assistant that generates daily briefs from your email and calendar, accessible via web dashboard or Discord bot.

## What It Does

EA connects to your Google account and creates intelligent daily summaries:

- **Email Triage** - Surfaces important emails, identifies action items, filters noise
- **Calendar Context** - Shows today's meetings with relevant background
- **AI Enrichment** - Uses Claude to add insights, suggest priorities, and connect dots
- **Discord Access** - Query your brief and personal vault through natural conversation

## Quick Start

### Prerequisites

- Node.js 22+
- Docker (for PostgreSQL)
- Google Cloud project with Gmail and Calendar APIs enabled

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/ea.git
cd ea
npm install
```

### 2. Set Up Database

```bash
npm run db:up
npm run db:migrate
```

### 3. Configure Environment

```bash
cp apps/web/.env.example apps/web/.env
# Edit with your Google OAuth credentials
```

### 4. Run

```bash
npm run dev
# Open http://localhost:3000
```

## Architecture

```
ea/
├── apps/
│   ├── web/          # TanStack Start web application
│   └── bot/          # Discord bot
├── packages/
│   ├── core/         # Shared types (@ea/core)
│   ├── db/           # Database schema (@ea/db)
│   └── google/       # Google APIs (@ea/google)
└── scripts/          # Automation scripts
```

## Commands

```bash
npm run dev           # Start web app
npm run dev:bot       # Start Discord bot
npm run build         # Build everything
npm run db:up         # Start PostgreSQL
npm run db:migrate    # Run migrations
npm run refresh       # Generate daily brief
```

## License

MIT License - see [LICENSE](LICENSE) for details.

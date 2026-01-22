# EA Setup Guide

## Prerequisites

- Node.js 22+
- Docker
- Google Cloud project with Gmail and Calendar APIs

## Step 1: Install

```bash
git clone https://github.com/yourusername/ea.git
cd ea
npm install
```

## Step 2: Database

```bash
npm run db:up
npm run db:migrate
```

## Step 3: Google OAuth

1. Go to Google Cloud Console
2. Enable Gmail API and Calendar API
3. Create OAuth 2.0 credentials
4. Add redirect URI: `http://localhost:3000/api/google/callback`

## Step 4: Configure

```bash
cp apps/web/.env.example apps/web/.env
```

Edit with your credentials:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ea
BETTER_AUTH_SECRET=your-secret
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

## Step 5: Run

```bash
npm run dev
```

Open http://localhost:3000 and connect your Google account.

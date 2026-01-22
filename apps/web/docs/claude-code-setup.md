# EA MCP Server Setup for Claude Code

This guide explains how to configure Claude Code to use the EA (Executive Assistant) MCP Tool Server.

## Prerequisites

1. The EA application must be built and the database must be accessible
2. You need your EA user ID from the database
3. Node.js must be installed

## Building the MCP Server

First, build the TypeScript code:

```bash
cd /path/to/ea
npm install
npm run build
```

## Configuration

### Option 1: Project-level Configuration

Create or edit `.claude/settings.json` in your project directory:

```json
{
  "mcpServers": {
    "ea-assistant": {
      "command": "node",
      "args": ["--import", "tsx", "/path/to/ea/src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/ea",
        "EA_USER_ID": "your-user-id-here"
      }
    }
  }
}
```

### Option 2: User-level Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ea-assistant": {
      "command": "node",
      "args": ["--import", "tsx", "/path/to/ea/src/mcp/server.ts"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/ea",
        "EA_USER_ID": "your-user-id-here"
      }
    }
  }
}
```

## Environment Variables

| Variable               | Description                                 | Required               |
| ---------------------- | ------------------------------------------- | ---------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                | Yes                    |
| `EA_USER_ID`           | Your user ID from the EA database           | Yes                    |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID (for calendar/email) | For Google integration |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret                  | For Google integration |

## Available Tools

Once configured, you'll have access to the following tool categories:

### Knowledge Graph Tools

- `ea_search_people` - Search contacts
- `ea_get_person` - Get full person dossier
- `ea_search_knowledge` - Search across all data
- `ea_get_commitments` - Get filtered commitments
- `ea_get_interactions` - Get interaction history
- `ea_get_people_by_domain` - Get people by domain
- `ea_get_vip_contacts` - Get high-importance contacts

### Calendar Tools

- `ea_get_calendar` - Get calendar events
- `ea_get_today_schedule` - Get today's schedule
- `ea_get_meeting_briefing` - Get meeting briefing
- `ea_get_upcoming_briefings` - Get upcoming briefings
- `ea_find_free_time` - Find available time slots

### Email Tools

- `ea_get_inbox` - Get filtered inbox
- `ea_get_email` - Get specific email details
- `ea_get_priority_emails` - Get high-priority emails
- `ea_get_email_threads` - Get email history with a person
- `ea_draft_reply` - Draft a reply

### Commitment Tools

- `ea_create_commitment` - Create new commitment
- `ea_update_commitment` - Update commitment
- `ea_complete_commitment` - Mark complete
- `ea_get_overdue_commitments` - Get overdue items
- `ea_get_commitments_due_today` - Get today's due items
- `ea_get_commitment_stats` - Get statistics

### Briefing Tools

- `ea_get_daily_brief` - Get daily brief
- `ea_get_weekly_summary` - Get weekly overview
- `ea_get_domain_status` - Get domain-specific summary
- `ea_get_brief_history` - Get historical briefs

### Action Tools

- `ea_get_pending_actions` - Get actions awaiting approval
- `ea_approve_action` - Approve an action
- `ea_reject_action` - Reject an action
- `ea_get_action_log` - Get action history
- `ea_get_action_stats` - Get action statistics
- `ea_provide_action_feedback` - Provide feedback

### Delegation Tools

- `ea_get_delegates` - Get potential delegates
- `ea_create_delegation` - Create a delegation
- `ea_get_delegations` - Get delegated tasks
- `ea_update_delegation_status` - Update status
- `ea_follow_up_delegation` - Flag for follow-up

## Testing the Setup

Once configured, restart Claude Code and try:

```
What's on my calendar today?
```

or

```
Show me my overdue commitments
```

## Troubleshooting

### Server not starting

- Check that the path to `server.ts` is correct
- Verify DATABASE_URL is accessible
- Check that EA_USER_ID is set

### Tools not appearing

- Restart Claude Code after configuration changes
- Check the MCP server logs in Claude Code developer tools

### Google integration errors

- Ensure Google OAuth is configured in the EA app
- Connect your Google account through the EA web interface first

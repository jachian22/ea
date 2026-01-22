/**
 * Brief Enrichment Service
 *
 * Uses Claude Code CLI to analyze brief data and generate AI insights:
 * - Day summary
 * - Conversation topic grouping
 * - Key conversation highlights
 * - Calendar insights (busy periods, focus time)
 */

import { spawn } from 'child_process';
import type { CalendarEventData, EmailData, EnrichedBriefData } from '~/db/schema';

// Claude Code CLI path - uses system default
const CLAUDE_CLI_PATH = process.env.CLAUDE_CODE_PATH || 'claude';
const CLAUDE_TIMEOUT = 120000; // 2 minutes

/**
 * Input data for enrichment
 */
export interface EnrichmentInput {
  briefDate: string;
  emails: EmailData[];
  calendarEvents: CalendarEventData[];
}

/**
 * Groups emails by thread for analysis
 */
function groupEmailsByThread(emails: EmailData[]): Map<string, EmailData[]> {
  const threads = new Map<string, EmailData[]>();
  for (const email of emails) {
    const existing = threads.get(email.threadId) || [];
    existing.push(email);
    threads.set(email.threadId, existing);
  }
  return threads;
}

/**
 * Creates a prompt for Claude to enrich the brief
 */
function createEnrichmentPrompt(input: EnrichmentInput): string {
  const { briefDate, emails, calendarEvents } = input;
  const threads = groupEmailsByThread(emails);

  // Format email threads
  const emailSummary = Array.from(threads.entries())
    .map(([threadId, threadEmails]) => {
      const latest = threadEmails[0];
      const participants = [
        ...new Set(threadEmails.flatMap((e) => [e.from.email, ...e.to.map((t) => t.email)])),
      ].join(', ');
      const snippets = threadEmails
        .map((e) => `- ${e.from.name || e.from.email}: "${e.snippet}"`)
        .join('\n');
      return `**Thread: ${latest.subject}** (${threadEmails.length} messages, threadId: ${threadId})
Participants: ${participants}
Importance: ${latest.importance}
Status: ${latest.actionStatus}
Messages:
${snippets}`;
    })
    .join('\n\n');

  // Format calendar events
  const calendarSummary = calendarEvents
    .map((event) => {
      const time = new Date(event.startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
      const attendees = event.attendees?.map((a) => a.name || a.email).join(', ') || 'No attendees';
      return `- ${time}: ${event.title} (${attendees})`;
    })
    .join('\n');

  return `You are an executive assistant. Analyze this daily brief data and provide enriched insights.

## Brief Date: ${briefDate}

## Calendar Events (${calendarEvents.length} events)
${calendarSummary || 'No calendar events'}

## Email Threads (${threads.size} threads, ${emails.length} total emails)
${emailSummary || 'No emails'}

---

**YOUR TASK:**
Respond with a JSON object (and ONLY the JSON object, no markdown code blocks) with this structure:

{
  "daySummary": "A 2-3 sentence executive summary of the day ahead",
  "conversations": {
    "byTopic": [
      {
        "topic": "Topic name (e.g., Work, Personal, Finance, Shopping)",
        "threads": [
          {
            "threadId": "the exact threadId from above",
            "subject": "email subject",
            "narrative": "1-2 sentence summary of this conversation thread and its context",
            "suggestedAction": "optional: what should be done about this"
          }
        ]
      }
    ],
    "highlights": [
      {
        "threadId": "threadId of important conversation",
        "subject": "email subject",
        "whyImportant": "Why this needs attention",
        "suggestedResponse": "optional: suggested response approach"
      }
    ]
  },
  "calendarInsights": {
    "busyPeriods": ["9am-11am: Back-to-back meetings"],
    "focusTimeAvailable": ["2pm-4pm: Open for deep work"],
    "keyMeetings": [{"title": "Meeting name", "why": "Why this is important"}]
  }
}

**RULES:**
1. Group emails into logical topics (work, personal, finance, shopping, etc.)
2. Identify which conversations need attention most (max 3 highlights)
3. Be concise but insightful
4. Use exact threadIds from the data above
5. Output ONLY the JSON object, no explanation or markdown`;
}

/**
 * Parses Claude's response into EnrichedBriefData
 */
function parseEnrichmentResponse(response: string): EnrichedBriefData | null {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[BriefEnrichment] No JSON found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.daySummary || !parsed.conversations) {
      console.error('[BriefEnrichment] Missing required fields in response');
      return null;
    }

    return {
      daySummary: parsed.daySummary,
      conversations: {
        byTopic: parsed.conversations.byTopic || [],
        highlights: parsed.conversations.highlights || [],
      },
      calendarInsights: parsed.calendarInsights,
      enrichedBy: 'ea-brief-v1',
    };
  } catch (error) {
    console.error('[BriefEnrichment] Failed to parse response:', error);
    return null;
  }
}

/**
 * Executes the Claude Code CLI with a prompt
 */
async function executeClaudeCLI(
  prompt: string
): Promise<{ success: boolean; content: string; error?: string }> {
  return new Promise((resolve) => {
    // Escape single quotes in the prompt for shell safety
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Build command with --print flag for non-interactive output
    const command = `${CLAUDE_CLI_PATH} --print '${escapedPrompt}'`;

    console.log(`[BriefEnrichment] Executing Claude CLI...`);

    const child = spawn(command, [], {
      env: {
        ...process.env,
        // Ensure we don't get interactive prompts
        CI: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        success: false,
        content: '',
        error: `Request timed out after ${CLAUDE_TIMEOUT / 1000} seconds`,
      });
    }, CLAUDE_TIMEOUT);

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code === 0) {
        resolve({
          success: true,
          content: stdout.trim(),
        });
      } else {
        resolve({
          success: false,
          content: stdout.trim(),
          error: stderr.trim() || `Process exited with code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        content: '',
        error: `Failed to spawn Claude CLI: ${err.message}`,
      });
    });
  });
}

/**
 * Enriches a brief using Claude Code CLI
 *
 * @param input The brief data to enrich
 * @returns The enriched data or null if enrichment fails
 */
export async function enrichBriefData(input: EnrichmentInput): Promise<EnrichedBriefData | null> {
  const { emails, calendarEvents } = input;

  // Skip enrichment if no data to analyze
  if (emails.length === 0 && calendarEvents.length === 0) {
    console.log('[BriefEnrichment] No data to enrich, skipping');
    return null;
  }

  console.log(
    `[BriefEnrichment] Enriching brief with ${emails.length} emails and ${calendarEvents.length} events`
  );

  try {
    const prompt = createEnrichmentPrompt(input);
    const response = await executeClaudeCLI(prompt);

    if (!response.success) {
      console.error('[BriefEnrichment] CLI error:', response.error);
      return null;
    }

    const enrichedData = parseEnrichmentResponse(response.content);
    if (!enrichedData) {
      console.error('[BriefEnrichment] Failed to parse enrichment response');
      return null;
    }

    console.log('[BriefEnrichment] Successfully enriched brief');
    return enrichedData;
  } catch (error) {
    console.error('[BriefEnrichment] Error:', error);
    // Don't fail the entire brief generation if enrichment fails
    return null;
  }
}

import { spawn } from 'child_process';
import type { Config } from './config.js';
import type { ClaudeResponse } from './types.js';

// Semaphore to limit concurrent Claude CLI executions
let activeExecutions = 0;
const MAX_CONCURRENT_EXECUTIONS = 2;
const executionQueue: Array<() => void> = [];

function acquireExecutionSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeExecutions < MAX_CONCURRENT_EXECUTIONS) {
      activeExecutions++;
      resolve();
    } else {
      executionQueue.push(resolve);
    }
  });
}

function releaseExecutionSlot(): void {
  activeExecutions--;
  const next = executionQueue.shift();
  if (next) {
    activeExecutions++;
    next();
  }
}

export class ClaudeBridge {
  private config: Config;
  private timeout: number;

  constructor(config: Config, timeout = 120000) {
    this.config = config;
    this.timeout = timeout;
  }

  /**
   * Execute a prompt using the Claude Code CLI
   * @param prompt The user's prompt/question
   * @param compartment Optional compartment to focus on
   * @returns ClaudeResponse with the result
   */
  async execute(prompt: string, compartment?: string): Promise<ClaudeResponse> {
    // Wait for execution slot (back pressure)
    await acquireExecutionSlot();

    try {
      return await this.executeInternal(prompt, compartment);
    } finally {
      releaseExecutionSlot();
    }
  }

  private executeInternal(prompt: string, compartment?: string): Promise<ClaudeResponse> {
    return new Promise((resolve) => {
      let resolved = false;
      const safeResolve = (response: ClaudeResponse) => {
        if (resolved) return;
        resolved = true;
        resolve(response);
      };

      // Build the full prompt with context
      let fullPrompt = prompt;
      if (compartment) {
        fullPrompt = `[Context: Focus on the ${compartment}/ compartment]\n\n${prompt}`;
      }

      // Log sanitized version (no user content)
      console.log(`[ClaudeBridge] Executing Claude CLI with ${fullPrompt.length} char prompt`);

      // Use spawn with arguments array - NO shell: true to prevent command injection
      const child = spawn(this.config.claude.path, ['--print', fullPrompt], {
        cwd: this.config.obsidian.path,
        env: {
          ...process.env,
          CI: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        // Explicitly no shell - arguments are passed directly to the executable
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
        // Give it a moment to terminate gracefully, then force kill
        setTimeout(() => {
          if (!resolved) {
            child.kill('SIGKILL');
          }
        }, 5000);
        safeResolve({
          success: false,
          content: '',
          error: `Request timed out after ${this.timeout / 1000} seconds`,
        });
      }, this.timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          safeResolve({
            success: true,
            content: stdout.trim(),
          });
        } else {
          safeResolve({
            success: false,
            content: stdout.trim(),
            error: stderr.trim() || `Process exited with code ${code}`,
          });
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        safeResolve({
          success: false,
          content: '',
          error: `Failed to spawn Claude CLI: ${err.message}`,
        });
      });
    });
  }

  /**
   * Generate a daily digest of upcoming events and reminders
   */
  async generateDigest(): Promise<ClaudeResponse> {
    const digestPrompt = `Generate a daily digest for Jason.

**FORMATTING RULES (CRITICAL):**
- NO tables - Discord embeds don't render them
- Use bullet points with emoji prefixes
- Keep each section under 5 bullet points
- Use **bold** for emphasis, not headers
- Total response under 1500 characters

**SECTIONS TO INCLUDE:**

📅 **Today** - Date and day of week

🎂 **Upcoming Dates** (next 7 days) - Birthdays, anniversaries from personal/overview.md. Skip if none.

📋 **Builds** - Brief status of active builds. Skip if none found.

✈️ **Travel** - Upcoming trips if any. Skip if none.

⏰ **Reminders** - Pending items from personal/reminders.md. Skip if none.

Example format:
📅 **Today**
• Monday, January 20, 2025

🎂 **Upcoming Dates**
• Wen Shi's birthday in 5 days (Jan 25)

📋 **Projects**
• Website redesign - awaiting feedback
• Tax prep - need to gather W2s`;

    return this.execute(digestPrompt);
  }

  /**
   * Check for any urgent reminders or approaching deadlines
   */
  async checkReminders(): Promise<ClaudeResponse> {
    const reminderPrompt = `Check for urgent items needing attention TODAY or tomorrow.

**FORMATTING RULES:**
- NO tables
- Use bullet points with ⚠️ prefix for urgent items
- Keep response under 500 characters
- If nothing urgent, respond ONLY with: "No urgent items."

**CHECK FOR:**
• Important dates that are TODAY or tomorrow
• Deadlines in builds/
• Time-sensitive reminders

Example format:
⚠️ **Needs Attention**
• Wen Shi's birthday is TOMORROW
• Project deadline: Tax docs due today`;

    return this.execute(reminderPrompt);
  }
}

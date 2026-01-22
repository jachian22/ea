import cron from 'node-cron';
import type { TextChannel } from 'discord.js';
import type { ClaudeBridge } from './claude-bridge.js';
import type { Config } from './config.js';

/**
 * Scheduler handles periodic tasks for the EA bot.
 *
 * Note: Daily brief generation is now handled by a standalone cron script
 * (scripts/refresh-brief.ts) that runs via system cron. This scheduler
 * only handles reminder checks.
 */
export class Scheduler {
  private config: Config;
  private claudeBridge: ClaudeBridge;
  private channel: TextChannel | null = null;
  private reminderCheckJob: cron.ScheduledTask | null = null;

  constructor(config: Config, claudeBridge: ClaudeBridge) {
    this.config = config;
    this.claudeBridge = claudeBridge;
  }

  setChannel(channel: TextChannel): void {
    this.channel = channel;
    console.log(`[Scheduler] Channel set to: ${channel.name}`);
  }

  start(): void {
    // Hourly reminder check (at minute 0)
    console.log('[Scheduler] Setting up hourly reminder checks');
    this.reminderCheckJob = cron.schedule(
      '0 * * * *',
      async () => {
        console.log('[Scheduler] Running hourly reminder check...');
        await this.checkReminders();
      },
      {
        timezone: this.config.scheduler.timezone,
      }
    );

    console.log('[Scheduler] Scheduler started (reminder checks only)');
    console.log(
      '[Scheduler] Note: Daily briefs are now handled by system cron (scripts/refresh-brief.ts)'
    );
  }

  stop(): void {
    if (this.reminderCheckJob) {
      this.reminderCheckJob.stop();
      this.reminderCheckJob = null;
    }
    console.log('[Scheduler] Scheduler stopped');
  }

  async checkReminders(): Promise<void> {
    if (!this.channel) {
      console.error('[Scheduler] No channel set, cannot check reminders');
      return;
    }

    try {
      const response = await this.claudeBridge.checkReminders();

      if (response.success && response.content && !response.content.includes('No urgent items')) {
        await this.channel.send({
          content: `**Reminder Alert**\n\n${response.content}`,
        });
      }
    } catch (error) {
      console.error('[Scheduler] Failed to check reminders:', error);
    }
  }
}

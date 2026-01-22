import { loadConfig } from './config.js';
import { EABot } from './bot.js';

async function main(): Promise<void> {
  console.log('====================================');
  console.log('    EA Bot - Executive Assistant    ');
  console.log('====================================');
  console.log();

  try {
    // Load configuration
    const config = loadConfig();
    console.log('[Main] Configuration loaded');
    console.log(`[Main] Obsidian path: ${config.obsidian.path}`);
    console.log(
      `[Main] Digest time: ${config.scheduler.digestTime} (${config.scheduler.timezone})`
    );

    // Create and start the bot
    const bot = new EABot(config);
    await bot.start();

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n[Main] Received ${signal}, shutting down...`);
      await bot.stop();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Keep the process alive
    console.log('[Main] Bot is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[Main] Fatal error:', error);
    process.exit(1);
  }
}

main();

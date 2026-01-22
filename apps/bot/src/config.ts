import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the ea-bot root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

export interface Config {
  discord: {
    token: string;
    channelId: string;
    guildId: string;
  };
  obsidian: {
    path: string;
  };
  claude: {
    path: string;
  };
  scheduler: {
    digestTime: string;
    timezone: string;
  };
  database: {
    url: string;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    discord: {
      token: requireEnv('DISCORD_TOKEN'),
      channelId: requireEnv('DISCORD_CHANNEL_ID'),
      guildId: requireEnv('DISCORD_GUILD_ID'),
    },
    obsidian: {
      path: process.env.OBSIDIAN_PATH || './obsidian',
    },
    claude: {
      path: process.env.CLAUDE_CODE_PATH || 'claude',
    },
    scheduler: {
      digestTime: process.env.DIGEST_TIME || '08:00',
      timezone: process.env.TIMEZONE || 'America/New_York',
    },
    database: {
      url: requireEnv('DATABASE_URL'),
    },
  };
}

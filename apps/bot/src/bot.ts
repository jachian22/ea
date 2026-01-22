import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  type TextChannel,
  type Message,
  Events,
} from 'discord.js';
import type { Config } from './config.js';
import { ClaudeBridge } from './claude-bridge.js';
import { Scheduler } from './scheduler.js';
import { commands } from './commands.js';
import { closeDatabase } from './db/index.js';
import { splitMessage } from './utils/discord.js';

export class EABot {
  private config: Config;
  private client: Client;
  private claudeBridge: ClaudeBridge;
  private scheduler: Scheduler;
  private ready = false;

  constructor(config: Config) {
    this.config = config;

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.claudeBridge = new ClaudeBridge(config);
    this.scheduler = new Scheduler(config, this.claudeBridge);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Ready event
    this.client.once(Events.ClientReady, async (readyClient) => {
      console.log(`[EABot] Logged in as ${readyClient.user.tag}`);

      // Register slash commands
      await this.registerCommands();

      // Set up scheduler channel
      try {
        const channel = await this.client.channels.fetch(this.config.discord.channelId);
        if (channel && channel.isTextBased()) {
          this.scheduler.setChannel(channel as TextChannel);
          this.scheduler.start();
        }
      } catch (error) {
        console.error('[EABot] Failed to fetch channel:', error);
      }

      this.ready = true;
      console.log('[EABot] Bot is ready!');
    });

    // Slash command interactions
    this.client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.find((cmd) => cmd.data.name === interaction.commandName);

      if (!command) {
        console.warn(`[EABot] Unknown command: ${interaction.commandName}`);
        return;
      }

      try {
        console.log(`[EABot] Executing command: ${interaction.commandName}`);
        await command.execute(interaction, this.claudeBridge);
      } catch (error) {
        console.error(`[EABot] Error executing command ${interaction.commandName}:`, error);

        const errorMessage = 'There was an error executing this command.';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });

    // Direct messages (non-slash command)
    this.client.on(Events.MessageCreate, async (message: Message) => {
      // Ignore bot messages
      if (message.author.bot) return;

      // Only respond in the configured channel or DMs
      const isConfiguredChannel = message.channelId === this.config.discord.channelId;
      const isDM = message.channel.isDMBased();

      if (!isConfiguredChannel && !isDM) return;

      // If it's a regular message (not a command), treat it as a question
      if (!message.content.startsWith('/')) {
        await this.handleDirectMessage(message);
      }
    });
  }

  private async handleDirectMessage(message: Message): Promise<void> {
    try {
      // Show typing indicator
      if (message.channel.isTextBased() && 'sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      const response = await this.claudeBridge.execute(message.content);

      if (response.success) {
        // Split long messages using shared utility
        const chunks = splitMessage(response.content);
        await message.reply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) {
          if ('send' in message.channel && typeof message.channel.send === 'function') {
            await message.channel.send(chunks[i]);
          }
        }
      } else {
        await message.reply(`Sorry, I encountered an error: ${response.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[EABot] Error handling message:', error);
      await message.reply('Sorry, something went wrong while processing your message.');
    }
  }

  private async registerCommands(): Promise<void> {
    const rest = new REST().setToken(this.config.discord.token);

    try {
      console.log(`[EABot] Registering ${commands.length} slash commands...`);

      const commandData = commands.map((cmd) => cmd.data);

      await rest.put(
        Routes.applicationGuildCommands(this.client.user!.id, this.config.discord.guildId),
        {
          body: commandData,
        }
      );

      console.log('[EABot] Slash commands registered successfully');
    } catch (error) {
      console.error('[EABot] Failed to register commands:', error);
    }
  }

  async start(): Promise<void> {
    console.log('[EABot] Starting bot...');
    await this.client.login(this.config.discord.token);
  }

  async stop(): Promise<void> {
    console.log('[EABot] Stopping bot...');
    this.scheduler.stop();
    this.client.destroy();
    // Gracefully close database connections
    await closeDatabase();
  }

  isReady(): boolean {
    return this.ready;
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }
}

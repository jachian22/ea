import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
  EmbedBuilder,
} from 'discord.js';
import { COMPARTMENTS } from './types.js';
import type { ClaudeBridge } from './claude-bridge.js';
import { getLatestBrief, getTodaysBrief } from './db/daily-briefs.js';
import { refreshBrief } from './services/refresh.js';
import { splitMessage } from './utils/discord.js';

export interface Command {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction, claudeBridge: ClaudeBridge) => Promise<void>;
}

// /ask command - freeform questions
const askCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription("Ask Jason's EA anything")
    .addStringOption((option) =>
      option.setName('question').setDescription('Your question or request').setRequired(true)
    )
    .toJSON(),
  execute: async (interaction, claudeBridge) => {
    await interaction.deferReply();

    const question = interaction.options.getString('question', true);
    const response = await claudeBridge.execute(question);

    if (response.success) {
      const chunks = splitMessage(response.content);
      await interaction.editReply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } else {
      await interaction.editReply(`Error: ${response.error || 'Unknown error'}`);
    }
  },
};

// /brief command - show the daily brief from database
const briefCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('brief')
    .setDescription('View your daily brief with AI insights')
    .addBooleanOption((option) =>
      option
        .setName('today')
        .setDescription("Only show today's brief (default: latest)")
        .setRequired(false)
    )
    .toJSON(),
  execute: async (interaction, _claudeBridge) => {
    await interaction.deferReply();

    try {
      const todayOnly = interaction.options.getBoolean('today') ?? false;
      const brief = todayOnly ? await getTodaysBrief() : await getLatestBrief();

      if (!brief) {
        await interaction.editReply(
          todayOnly
            ? 'No brief found for today. Generate one from the web app first!'
            : 'No briefs found. Generate one from the web app first!'
        );
        return;
      }

      // Build the main embed
      const embed = new EmbedBuilder()
        .setTitle(`Daily Brief: ${brief.briefDate}`)
        .setColor(0x5865f2)
        .setTimestamp(brief.generatedAt ? new Date(brief.generatedAt) : undefined);

      // Add AI summary if enriched
      if (brief.enrichedContent?.daySummary) {
        embed.setDescription(brief.enrichedContent.daySummary);
      }

      // Weather
      if (brief.weather) {
        const w = brief.weather;
        embed.addFields({
          name: '🌤️ Weather',
          value: `**${w.temperature}°F** - ${w.condition}\n${w.recommendation}`,
          inline: false,
        });
      }

      // Stats summary
      const emailCount = brief.emails?.length || 0;
      const eventCount = brief.calendarEvents?.length || 0;
      embed.addFields({
        name: '📊 Overview',
        value: `📧 ${emailCount} emails | 📅 ${eventCount} events`,
        inline: false,
      });

      // Key conversations (highlights)
      if (brief.enrichedContent?.conversations?.highlights?.length) {
        const highlights = brief.enrichedContent.conversations.highlights
          .slice(0, 3)
          .map((h) => `**${h.subject}**\n${h.whyImportant}`)
          .join('\n\n');
        embed.addFields({
          name: '⚡ Key Conversations',
          value: highlights.substring(0, 1024) || 'None',
          inline: false,
        });
      }

      // Topics
      if (brief.enrichedContent?.conversations?.byTopic?.length) {
        const topics = brief.enrichedContent.conversations.byTopic
          .map(
            (t) => `**${t.topic}:** ${t.threads.length} thread${t.threads.length === 1 ? '' : 's'}`
          )
          .join('\n');
        embed.addFields({
          name: '🏷️ Topics',
          value: topics.substring(0, 1024) || 'None',
          inline: false,
        });
      }

      // Calendar insights
      if (brief.enrichedContent?.calendarInsights) {
        const cal = brief.enrichedContent.calendarInsights;
        const insights: string[] = [];
        if (cal.busyPeriods?.length) {
          insights.push(`**Busy:** ${cal.busyPeriods.join(', ')}`);
        }
        if (cal.focusTimeAvailable?.length) {
          insights.push(`**Focus time:** ${cal.focusTimeAvailable.join(', ')}`);
        }
        if (insights.length > 0) {
          embed.addFields({
            name: '📅 Calendar',
            value: insights.join('\n').substring(0, 1024),
            inline: false,
          });
        }
      }

      // Footer with enrichment status
      if (brief.enrichedAt) {
        embed.setFooter({ text: '✨ AI Enriched' });
      } else {
        embed.setFooter({ text: 'Not yet enriched - regenerate from web app' });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('[BriefCommand] Error:', error);
      await interaction.editReply(
        `Error fetching brief: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

// /remind command - add a reminder
const remindCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Add a reminder to the vault')
    .addStringOption((option) =>
      option.setName('reminder').setDescription('What to remember').setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('when')
        .setDescription('When to be reminded (e.g., "tomorrow", "next Monday", "in 3 days")')
        .setRequired(false)
    )
    .toJSON(),
  execute: async (interaction, claudeBridge) => {
    await interaction.deferReply();

    const reminder = interaction.options.getString('reminder', true);
    const when = interaction.options.getString('when') || 'when appropriate';

    const prompt = `Add a reminder to personal/reminders.md (create the file if it doesn't exist):
- Reminder: ${reminder}
- When: ${when}
- Created: ${new Date().toISOString()}

Use a simple markdown format. Confirm when done.`;

    const response = await claudeBridge.execute(prompt, 'personal');

    if (response.success) {
      await interaction.editReply(`Reminder added: "${reminder}"`);
    } else {
      await interaction.editReply(`Error adding reminder: ${response.error || 'Unknown error'}`);
    }
  },
};

// /refresh command - manually refresh the daily brief
const refreshCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Refresh the daily brief by fetching new emails and calendar events')
    .toJSON(),
  execute: async (interaction, _claudeBridge) => {
    await interaction.deferReply();

    try {
      await interaction.editReply('Refreshing daily brief... This may take a minute.');

      const result = await refreshBrief();

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('Brief Refreshed')
          .setColor(0x57f287)
          .setDescription(result.message)
          .addFields(
            { name: 'Emails', value: String(result.emailCount ?? 0), inline: true },
            { name: 'Events', value: String(result.eventCount ?? 0), inline: true },
            { name: 'AI Enriched', value: result.enriched ? 'Yes' : 'No', inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ content: null, embeds: [embed] });
      } else {
        await interaction.editReply(`Failed to refresh brief: ${result.message}`);
      }
    } catch (error) {
      console.error('[RefreshCommand] Error:', error);
      await interaction.editReply(
        `Error refreshing brief: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

// Create compartment-specific commands
function createCompartmentCommand(compartmentKey: string): Command {
  const compartment = COMPARTMENTS[compartmentKey];

  return {
    data: new SlashCommandBuilder()
      .setName(compartmentKey)
      .setDescription(`Query the ${compartment.name} compartment: ${compartment.description}`)
      .addStringOption((option) =>
        option
          .setName('query')
          .setDescription(`What do you want to know about ${compartment.name}?`)
          .setRequired(false)
      )
      .toJSON(),
    execute: async (interaction, claudeBridge) => {
      await interaction.deferReply();

      const query =
        interaction.options.getString('query') ||
        `Give me a summary of what's in the ${compartment.name} compartment. Read the overview.md file.`;

      const response = await claudeBridge.execute(query, compartmentKey);

      if (response.success) {
        const embed = new EmbedBuilder()
          .setTitle(`${compartment.name.charAt(0).toUpperCase() + compartment.name.slice(1)}`)
          .setDescription(response.content.substring(0, 4096))
          .setColor(getCompartmentColor(compartmentKey))
          .setFooter({ text: compartment.description });

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply(`Error: ${response.error || 'Unknown error'}`);
      }
    },
  };
}

function getCompartmentColor(compartment: string): number {
  const colors: Record<string, number> = {
    personal: 0x5865f2, // Discord blurple
    finance: 0x57f287, // Green
    health: 0xed4245, // Red
    travel: 0xfee75c, // Yellow
    builds: 0xeb459e, // Pink
    brand: 0x9b59b6, // Purple
    career: 0x3498db, // Blue
  };
  return colors[compartment] || 0x99aab5;
}

// Export all commands
export const commands: Command[] = [
  askCommand,
  briefCommand,
  remindCommand,
  refreshCommand,
  ...Object.keys(COMPARTMENTS).map(createCompartmentCommand),
];

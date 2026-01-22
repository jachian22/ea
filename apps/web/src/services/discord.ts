/**
 * Discord Webhook Service for sending notifications.
 *
 * This service handles:
 * - Sending messages via Discord webhooks
 * - MFA alerts for bank statement automation
 * - Run completion summaries
 * - Error notifications
 */

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  timestamp?: string;
  footer?: {
    text: string;
  };
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

// Discord color constants (decimal values)
export const DiscordColors = {
  SUCCESS: 0x22c55e, // green-500
  WARNING: 0xf59e0b, // amber-500
  ERROR: 0xef4444, // red-500
  INFO: 0x3b82f6, // blue-500
  MFA: 0x8b5cf6, // violet-500
} as const;

/**
 * Send a message to a Discord webhook.
 *
 * @param webhookUrl The Discord webhook URL
 * @param message The message payload to send
 * @throws Error if the webhook request fails
 */
export async function sendDiscordNotification(
  webhookUrl: string,
  message: DiscordMessage
): Promise<void> {
  if (!webhookUrl) {
    console.warn("[DiscordService] No webhook URL provided, skipping notification");
    return;
  }

  // Validate webhook URL format
  if (!webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    throw new Error("Invalid Discord webhook URL format");
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...message,
        username: message.username ?? "EA Bank Statements",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Discord webhook failed (${response.status}): ${errorText}`
      );
    }
  } catch (error) {
    console.error("[DiscordService] Failed to send notification:", error);
    throw error;
  }
}

/**
 * Send an MFA required notification.
 * Used when a bank requires multi-factor authentication.
 */
export async function sendMFANotification(
  webhookUrl: string,
  bank: string
): Promise<void> {
  const message: DiscordMessage = {
    embeds: [
      {
        title: "🔐 MFA Required",
        description: `Multi-factor authentication is needed for **${bank}**. The browser is waiting for you to complete authentication.`,
        color: DiscordColors.MFA,
        timestamp: new Date().toISOString(),
        footer: {
          text: "EA Bank Statement Automation",
        },
      },
    ],
  };

  await sendDiscordNotification(webhookUrl, message);
}

/**
 * Send a run completion notification.
 * Summarizes the results of a statement download run.
 */
export async function sendRunCompletionNotification(
  webhookUrl: string,
  data: {
    status: "completed" | "failed" | "partial";
    statementsDownloaded: number;
    banksProcessed: number;
    banksSuccessful: number;
    duration?: number;
    errors?: string[];
  }
): Promise<void> {
  const { status, statementsDownloaded, banksProcessed, banksSuccessful, duration, errors } = data;

  let title: string;
  let color: number;
  let emoji: string;

  switch (status) {
    case "completed":
      title = "Statement Download Complete";
      color = DiscordColors.SUCCESS;
      emoji = "✅";
      break;
    case "partial":
      title = "Statement Download Partially Complete";
      color = DiscordColors.WARNING;
      emoji = "⚠️";
      break;
    case "failed":
      title = "Statement Download Failed";
      color = DiscordColors.ERROR;
      emoji = "❌";
      break;
  }

  const fields: DiscordEmbed["fields"] = [
    {
      name: "Statements Downloaded",
      value: statementsDownloaded.toString(),
      inline: true,
    },
    {
      name: "Banks Processed",
      value: `${banksSuccessful}/${banksProcessed}`,
      inline: true,
    },
  ];

  if (duration !== undefined) {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationStr =
      minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    fields.push({
      name: "Duration",
      value: durationStr,
      inline: true,
    });
  }

  let description = "";
  if (errors && errors.length > 0) {
    description = `**Errors:**\n${errors.map((e) => `• ${e}`).join("\n")}`;
  }

  const message: DiscordMessage = {
    embeds: [
      {
        title: `${emoji} ${title}`,
        description: description || undefined,
        color,
        fields,
        timestamp: new Date().toISOString(),
        footer: {
          text: "EA Bank Statement Automation",
        },
      },
    ],
  };

  await sendDiscordNotification(webhookUrl, message);
}

/**
 * Send an error notification.
 * Used for critical errors during automation.
 */
export async function sendErrorNotification(
  webhookUrl: string,
  error: string,
  context?: string
): Promise<void> {
  const message: DiscordMessage = {
    embeds: [
      {
        title: "❌ Statement Automation Error",
        description: error,
        color: DiscordColors.ERROR,
        fields: context
          ? [
              {
                name: "Context",
                value: context,
              },
            ]
          : undefined,
        timestamp: new Date().toISOString(),
        footer: {
          text: "EA Bank Statement Automation",
        },
      },
    ],
  };

  await sendDiscordNotification(webhookUrl, message);
}

/**
 * Send a run started notification.
 * Optional notification when automation begins.
 */
export async function sendRunStartedNotification(
  webhookUrl: string,
  banks: string[]
): Promise<void> {
  const message: DiscordMessage = {
    embeds: [
      {
        title: "🚀 Statement Download Started",
        description: `Processing ${banks.length} bank${banks.length === 1 ? "" : "s"}: ${banks.join(", ")}`,
        color: DiscordColors.INFO,
        timestamp: new Date().toISOString(),
        footer: {
          text: "EA Bank Statement Automation",
        },
      },
    ],
  };

  await sendDiscordNotification(webhookUrl, message);
}

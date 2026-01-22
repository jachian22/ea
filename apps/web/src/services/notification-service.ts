import {
  createNotification,
  findNotificationPreferencesByUserId,
  getDefaultChannelsForType,
  getDefaultUrgencyForType,
  isWithinQuietHours,
  updateNotificationDeliveryStatus,
} from "~/data-access/notifications";
import type {
  CreateNotificationData,
  Notification,
  NotificationType,
  NotificationChannel,
  NotificationPreferences,
} from "~/db/schema";

// ============================================================================
// Notification Service
// ============================================================================

/**
 * Service for creating and sending notifications with user preference handling.
 *
 * This service:
 * - Respects user notification preferences
 * - Handles quiet hours
 * - Routes to appropriate delivery channels
 * - Tracks delivery status
 */
export class NotificationService {
  private userId: string;
  private preferences: NotificationPreferences | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Load user's notification preferences
   */
  async loadPreferences(): Promise<void> {
    this.preferences = await findNotificationPreferencesByUserId(this.userId);
  }

  /**
   * Send a notification respecting user preferences
   */
  async sendNotification(
    type: NotificationType,
    title: string,
    body: string,
    options: {
      relatedType?: "commitment" | "meeting" | "person" | "brief";
      relatedId?: string;
      metadata?: Record<string, unknown>;
      scheduleFor?: Date;
      forceChannels?: NotificationChannel[];
    } = {}
  ): Promise<Notification | null> {
    // Load preferences if not already loaded
    if (!this.preferences) {
      await this.loadPreferences();
    }

    // Check if this notification type is enabled
    if (!this.isTypeEnabled(type)) {
      console.log(`Notification type ${type} is disabled for user ${this.userId}`);
      return null;
    }

    // Get channels for this notification
    const channels = options.forceChannels || this.getChannelsForType(type);
    if (channels.length === 0) {
      console.log(`No channels enabled for notification type ${type}`);
      return null;
    }

    // Check quiet hours (skip if notification is scheduled)
    if (!options.scheduleFor && this.preferences && isWithinQuietHours(this.preferences)) {
      // During quiet hours, only allow high urgency notifications
      const urgency = getDefaultUrgencyForType(type);
      if (urgency !== "high") {
        console.log(`Notification suppressed during quiet hours`);
        // Could queue for later instead of suppressing
        return null;
      }
    }

    // Create the notification
    const notification = await createNotification({
      id: crypto.randomUUID(),
      userId: this.userId,
      type,
      title,
      body,
      urgency: getDefaultUrgencyForType(type),
      channels,
      relatedType: options.relatedType,
      relatedId: options.relatedId,
      metadata: options.metadata,
      scheduledFor: options.scheduleFor,
    });

    // If not scheduled, deliver immediately
    if (!options.scheduleFor) {
      await this.deliverNotification(notification, channels);
    }

    return notification;
  }

  /**
   * Check if a notification type is enabled for the user
   */
  private isTypeEnabled(type: NotificationType): boolean {
    if (!this.preferences || !this.preferences.preferences) {
      return true; // Default to enabled
    }

    const typePrefs = this.preferences.preferences[type];
    return typePrefs?.enabled ?? true;
  }

  /**
   * Get enabled channels for a notification type
   */
  private getChannelsForType(type: NotificationType): NotificationChannel[] {
    if (!this.preferences || !this.preferences.preferences) {
      return getDefaultChannelsForType(type);
    }

    const typePrefs = this.preferences.preferences[type];
    if (!typePrefs?.enabled) {
      return [];
    }

    return typePrefs.channels || getDefaultChannelsForType(type);
  }

  /**
   * Deliver notification through specified channels
   */
  private async deliverNotification(
    notification: Notification,
    channels: NotificationChannel[]
  ): Promise<void> {
    for (const channel of channels) {
      try {
        await this.deliverToChannel(notification, channel);
        await updateNotificationDeliveryStatus(notification.id, channel, {
          sent: true,
          sentAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error(`Failed to deliver notification via ${channel}:`, error);
        await updateNotificationDeliveryStatus(notification.id, channel, {
          sent: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  /**
   * Deliver to a specific channel
   */
  private async deliverToChannel(
    notification: Notification,
    channel: NotificationChannel
  ): Promise<void> {
    switch (channel) {
      case "in_app":
        // In-app notifications are just stored in the database
        // UI will fetch them via polling or websocket
        break;

      case "push":
        await this.sendPushNotification(notification);
        break;

      case "email":
        await this.sendEmailNotification(notification);
        break;

      default:
        console.warn(`Unknown notification channel: ${channel}`);
    }
  }

  /**
   * Send push notification (placeholder for actual implementation)
   */
  private async sendPushNotification(notification: Notification): Promise<void> {
    // TODO: Implement with web push or native push service
    // For now, this is a no-op
    console.log(`[PUSH] Would send push notification: ${notification.title}`);
  }

  /**
   * Send email notification (placeholder for actual implementation)
   */
  private async sendEmailNotification(notification: Notification): Promise<void> {
    // TODO: Implement with email service (SendGrid, Resend, etc.)
    // For now, this is a no-op
    console.log(`[EMAIL] Would send email notification: ${notification.title}`);
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Send a notification to a user
 */
export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  options?: {
    relatedType?: "commitment" | "meeting" | "person" | "brief";
    relatedId?: string;
    metadata?: Record<string, unknown>;
    scheduleFor?: Date;
    forceChannels?: NotificationChannel[];
  }
): Promise<Notification | null> {
  const service = new NotificationService(userId);
  return service.sendNotification(type, title, body, options);
}

/**
 * Send meeting briefing ready notification
 */
export async function sendMeetingBriefingNotification(
  userId: string,
  briefingId: string,
  meetingTitle: string,
  meetingTime: Date
): Promise<Notification | null> {
  const timeStr = meetingTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return sendNotification(
    userId,
    "meeting_briefing_ready",
    `Briefing ready: ${meetingTitle}`,
    `Your meeting briefing for "${meetingTitle}" at ${timeStr} is ready. Review attendee info and talking points before your meeting.`,
    {
      relatedType: "meeting",
      relatedId: briefingId,
    }
  );
}

/**
 * Send commitment due today notification
 */
export async function sendCommitmentDueTodayNotification(
  userId: string,
  commitmentId: string,
  description: string,
  personName?: string
): Promise<Notification | null> {
  const toWhom = personName ? ` to ${personName}` : "";

  return sendNotification(
    userId,
    "commitment_due_today",
    "Commitment due today",
    `Reminder: "${description}"${toWhom} is due today.`,
    {
      relatedType: "commitment",
      relatedId: commitmentId,
    }
  );
}

/**
 * Send commitment overdue notification
 */
export async function sendCommitmentOverdueNotification(
  userId: string,
  commitmentId: string,
  description: string,
  daysOverdue: number,
  personName?: string
): Promise<Notification | null> {
  const toWhom = personName ? ` to ${personName}` : "";

  return sendNotification(
    userId,
    "commitment_overdue",
    `Overdue: ${description}`,
    `Your commitment "${description}"${toWhom} is ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} overdue. Consider following up or marking as complete.`,
    {
      relatedType: "commitment",
      relatedId: commitmentId,
    }
  );
}

/**
 * Send high importance email notification
 */
export async function sendHighImportanceEmailNotification(
  userId: string,
  subject: string,
  fromName: string,
  emailId: string
): Promise<Notification | null> {
  return sendNotification(
    userId,
    "high_importance_email",
    `Important email from ${fromName}`,
    `"${subject}" - This email was flagged as high importance and may need your attention.`,
    {
      metadata: { emailId },
    }
  );
}

/**
 * Send follow-up reminder notification
 */
export async function sendFollowUpReminderNotification(
  userId: string,
  personId: string,
  personName: string,
  daysSinceContact: number,
  suggestedAction?: string
): Promise<Notification | null> {
  const suggestion = suggestedAction || "Consider sending a quick check-in.";

  return sendNotification(
    userId,
    "follow_up_reminder",
    `Follow up with ${personName}`,
    `You haven't been in touch with ${personName} for ${daysSinceContact} days. ${suggestion}`,
    {
      relatedType: "person",
      relatedId: personId,
    }
  );
}

/**
 * Send weekly relationship review notification
 */
export async function sendWeeklyRelationshipReviewNotification(
  userId: string,
  staleContactsCount: number,
  importantUpdates: string[]
): Promise<Notification | null> {
  const updatesText =
    importantUpdates.length > 0
      ? `\n\nHighlights:\n${importantUpdates.map((u) => `• ${u}`).join("\n")}`
      : "";

  return sendNotification(
    userId,
    "weekly_relationship_review",
    "Weekly Relationship Review",
    `You have ${staleContactsCount} contacts you haven't reached out to recently.${updatesText}`,
    {}
  );
}

/**
 * Send daily digest notification
 */
export async function sendDailyDigestNotification(
  userId: string,
  briefId: string,
  summary: {
    meetingsToday: number;
    commitmentsDueToday: number;
    overdueCommitments: number;
    emailsNeedingResponse: number;
  }
): Promise<Notification | null> {
  const parts: string[] = [];

  if (summary.meetingsToday > 0) {
    parts.push(`${summary.meetingsToday} meetings today`);
  }
  if (summary.commitmentsDueToday > 0) {
    parts.push(`${summary.commitmentsDueToday} commitments due`);
  }
  if (summary.overdueCommitments > 0) {
    parts.push(`${summary.overdueCommitments} overdue items`);
  }
  if (summary.emailsNeedingResponse > 0) {
    parts.push(`${summary.emailsNeedingResponse} emails need response`);
  }

  const body =
    parts.length > 0
      ? `Today's overview: ${parts.join(", ")}.`
      : "Your schedule looks clear today!";

  return sendNotification(
    userId,
    "daily_digest",
    "Your Daily Briefing",
    body,
    {
      relatedType: "brief",
      relatedId: briefId,
    }
  );
}

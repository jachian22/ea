import { eq, and, desc, asc, lt, sql, count } from 'drizzle-orm';
import { database } from '~/db';
import {
  notification,
  notificationPreferences,
  user,
  type Notification,
  type CreateNotificationData,
  type UpdateNotificationData,
  type NotificationPreferences,
  type CreateNotificationPreferencesData,
  type UpdateNotificationPreferencesData,
  type NotificationType,
  type NotificationChannel,
  type NotificationDeliveryStatus,
  type User,
} from '~/db/schema';

// ============================================================================
// Types
// ============================================================================

export type NotificationWithUser = Notification & {
  user: Pick<User, 'id' | 'name' | 'image'>;
};

// ============================================================================
// Notification CRUD
// ============================================================================

/**
 * Create a new notification
 */
export async function createNotification(data: CreateNotificationData): Promise<Notification> {
  const [newNotification] = await database.insert(notification).values(data).returning();

  return newNotification;
}

/**
 * Create multiple notifications at once
 */
export async function createNotifications(data: CreateNotificationData[]): Promise<Notification[]> {
  if (data.length === 0) return [];

  const notifications = await database.insert(notification).values(data).returning();

  return notifications;
}

/**
 * Find notification by ID
 */
export async function findNotificationById(id: string): Promise<Notification | null> {
  const [result] = await database
    .select()
    .from(notification)
    .where(eq(notification.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find all notifications for a user (most recent first)
 */
export async function findNotificationsByUserId(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Notification[]> {
  const results = await database
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
}

/**
 * Find user notifications with user info (legacy support)
 */
export async function findUserNotifications(
  userId: string,
  limit: number = 20,
  offset: number = 0
): Promise<NotificationWithUser[]> {
  const results = await database
    .select({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      urgency: notification.urgency,
      channels: notification.channels,
      isRead: notification.isRead,
      readAt: notification.readAt,
      deliveryStatus: notification.deliveryStatus,
      relatedType: notification.relatedType,
      relatedId: notification.relatedId,
      metadata: notification.metadata,
      scheduledFor: notification.scheduledFor,
      createdAt: notification.createdAt,
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    })
    .from(notification)
    .innerJoin(user, eq(notification.userId, user.id))
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(limit)
    .offset(offset);

  return results as NotificationWithUser[];
}

/**
 * Find unread notifications for a user
 */
export async function findUnreadNotificationsByUserId(
  userId: string,
  limit: number = 20
): Promise<Notification[]> {
  const results = await database
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
    .orderBy(desc(notification.createdAt))
    .limit(limit);

  return results;
}

/**
 * Find unread notifications with user info (legacy support)
 */
export async function findUnreadNotifications(
  userId: string,
  limit: number = 20
): Promise<NotificationWithUser[]> {
  const results = await database
    .select({
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      urgency: notification.urgency,
      channels: notification.channels,
      isRead: notification.isRead,
      readAt: notification.readAt,
      deliveryStatus: notification.deliveryStatus,
      relatedType: notification.relatedType,
      relatedId: notification.relatedId,
      metadata: notification.metadata,
      scheduledFor: notification.scheduledFor,
      createdAt: notification.createdAt,
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
    })
    .from(notification)
    .innerJoin(user, eq(notification.userId, user.id))
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
    .orderBy(desc(notification.createdAt))
    .limit(limit);

  return results as NotificationWithUser[];
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [result] = await database
    .select({ count: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)));

  return result?.count || 0;
}

/**
 * Legacy alias for getUnreadNotificationCount
 */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return getUnreadNotificationCount(userId);
}

/**
 * Find notifications by type for a user
 */
export async function findNotificationsByType(
  userId: string,
  type: NotificationType,
  limit: number = 20
): Promise<Notification[]> {
  const results = await database
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.type, type)))
    .orderBy(desc(notification.createdAt))
    .limit(limit);

  return results;
}

/**
 * Find scheduled notifications that need to be sent
 */
export async function findPendingScheduledNotifications(
  before: Date = new Date()
): Promise<Notification[]> {
  const results = await database
    .select()
    .from(notification)
    .where(and(lt(notification.scheduledFor, before), eq(notification.isRead, false)))
    .orderBy(asc(notification.scheduledFor));

  return results;
}

/**
 * Update a notification
 */
export async function updateNotification(
  id: string,
  data: UpdateNotificationData
): Promise<Notification | null> {
  const [updated] = await database
    .update(notification)
    .set(data)
    .where(eq(notification.id, id))
    .returning();

  return updated || null;
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId?: string
): Promise<Notification | null> {
  const conditions = [eq(notification.id, notificationId)];
  if (userId) {
    conditions.push(eq(notification.userId, userId));
  }

  const [updated] = await database
    .update(notification)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(and(...conditions))
    .returning();

  return updated || null;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  const result = await database
    .update(notification)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(and(eq(notification.userId, userId), eq(notification.isRead, false)))
    .returning();

  return result.length;
}

/**
 * Update notification delivery status
 */
export async function updateNotificationDeliveryStatus(
  id: string,
  channel: NotificationChannel,
  status: { sent: boolean; sentAt?: string; error?: string }
): Promise<Notification | null> {
  const existing = await findNotificationById(id);
  if (!existing) return null;

  const currentStatus = (existing.deliveryStatus || {}) as NotificationDeliveryStatus;
  const updatedStatus: NotificationDeliveryStatus = {
    ...currentStatus,
    [channel]: status,
  };

  return updateNotification(id, {
    deliveryStatus: updatedStatus,
  });
}

/**
 * Delete a notification
 */
export async function deleteNotification(
  notificationId: string,
  userId?: string
): Promise<boolean> {
  const conditions = [eq(notification.id, notificationId)];
  if (userId) {
    conditions.push(eq(notification.userId, userId));
  }

  const [deleted] = await database
    .delete(notification)
    .where(and(...conditions))
    .returning();

  return deleted !== undefined;
}

/**
 * Delete old notifications (for cleanup)
 */
export async function deleteOldNotifications(userId: string, olderThan: Date): Promise<number> {
  const deleted = await database
    .delete(notification)
    .where(and(eq(notification.userId, userId), lt(notification.createdAt, olderThan)))
    .returning();

  return deleted.length;
}

// ============================================================================
// Notification Preferences CRUD
// ============================================================================

/**
 * Create notification preferences for a user
 */
export async function createNotificationPreferences(
  data: CreateNotificationPreferencesData
): Promise<NotificationPreferences> {
  const [newPreferences] = await database.insert(notificationPreferences).values(data).returning();

  return newPreferences;
}

/**
 * Find notification preferences by user ID
 */
export async function findNotificationPreferencesByUserId(
  userId: string
): Promise<NotificationPreferences | null> {
  const [result] = await database
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  return result || null;
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: string,
  data: UpdateNotificationPreferencesData
): Promise<NotificationPreferences | null> {
  const [updated] = await database
    .update(notificationPreferences)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  return updated || null;
}

/**
 * Get or create notification preferences for a user
 */
export async function getOrCreateNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  const existing = await findNotificationPreferencesByUserId(userId);

  if (existing) {
    return existing;
  }

  return createNotificationPreferences({
    id: crypto.randomUUID(),
    userId,
  });
}

/**
 * Delete notification preferences
 */
export async function deleteNotificationPreferences(userId: string): Promise<boolean> {
  const [deleted] = await database
    .delete(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  return deleted !== undefined;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get default channels for a notification type
 */
export function getDefaultChannelsForType(type: NotificationType): NotificationChannel[] {
  const channelMap: Record<NotificationType, NotificationChannel[]> = {
    meeting_briefing_ready: ['push', 'in_app'],
    commitment_due_today: ['email'],
    commitment_overdue: ['push', 'email'],
    high_importance_email: ['push'],
    follow_up_reminder: ['in_app'],
    weekly_relationship_review: ['email'],
    daily_digest: ['email'],
  };

  return channelMap[type] || ['in_app'];
}

/**
 * Get default urgency for a notification type
 */
export function getDefaultUrgencyForType(type: NotificationType): 'high' | 'medium' | 'low' {
  const urgencyMap: Record<NotificationType, 'high' | 'medium' | 'low'> = {
    meeting_briefing_ready: 'medium',
    commitment_due_today: 'medium',
    commitment_overdue: 'high',
    high_importance_email: 'high',
    follow_up_reminder: 'low',
    weekly_relationship_review: 'low',
    daily_digest: 'medium',
  };

  return urgencyMap[type] || 'medium';
}

/**
 * Check if a user has a specific notification type enabled
 */
export async function isNotificationTypeEnabled(
  userId: string,
  type: NotificationType
): Promise<boolean> {
  const prefs = await findNotificationPreferencesByUserId(userId);

  if (!prefs || !prefs.preferences) {
    return true; // Default to enabled
  }

  const typePrefs = prefs.preferences[type];
  return typePrefs?.enabled ?? true;
}

/**
 * Get enabled channels for a notification type
 */
export async function getEnabledChannelsForType(
  userId: string,
  type: NotificationType
): Promise<NotificationChannel[]> {
  const prefs = await findNotificationPreferencesByUserId(userId);

  if (!prefs || !prefs.preferences) {
    return getDefaultChannelsForType(type);
  }

  const typePrefs = prefs.preferences[type];
  if (!typePrefs?.enabled) {
    return [];
  }

  return typePrefs.channels || getDefaultChannelsForType(type);
}

/**
 * Check if current time is within quiet hours
 */
export function isWithinQuietHours(
  prefs: NotificationPreferences,
  currentTime: Date = new Date()
): boolean {
  if (!prefs.quietHoursEnabled || !prefs.quietHoursStart || !prefs.quietHoursEnd) {
    return false;
  }

  const timezone = prefs.timezone || 'America/Los_Angeles';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const currentTimeStr = formatter.format(currentTime);
  const [currentHour, currentMinute] = currentTimeStr.split(':').map(Number);
  const currentMinutes = currentHour * 60 + currentMinute;

  const [startHour, startMinute] = prefs.quietHoursStart.split(':').map(Number);
  const [endHour, endMinute] = prefs.quietHoursEnd.split(':').map(Number);
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

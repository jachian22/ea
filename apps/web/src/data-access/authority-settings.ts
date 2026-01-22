import { eq, and, desc } from 'drizzle-orm';
import { database } from '~/db';
import {
  authoritySetting,
  actionType,
  type AuthoritySetting,
  type CreateAuthoritySettingData,
  type UpdateAuthoritySettingData,
  type AuthorityLevel,
  type AuthorityConditions,
} from '~/db/schema';

/**
 * Create a new authority setting for a user
 */
export async function createAuthoritySetting(
  data: CreateAuthoritySettingData
): Promise<AuthoritySetting> {
  const [newSetting] = await database.insert(authoritySetting).values(data).returning();

  return newSetting;
}

/**
 * Find an authority setting by ID
 */
export async function findAuthoritySettingById(id: string): Promise<AuthoritySetting | null> {
  const [result] = await database
    .select()
    .from(authoritySetting)
    .where(eq(authoritySetting.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find authority setting for a specific user and action type
 */
export async function findAuthoritySettingByUserAndActionType(
  userId: string,
  actionTypeId: string
): Promise<AuthoritySetting | null> {
  const [result] = await database
    .select()
    .from(authoritySetting)
    .where(
      and(eq(authoritySetting.userId, userId), eq(authoritySetting.actionTypeId, actionTypeId))
    )
    .limit(1);

  return result || null;
}

/**
 * Find all authority settings for a user
 */
export async function findAuthoritySettingsByUserId(userId: string): Promise<AuthoritySetting[]> {
  return database
    .select()
    .from(authoritySetting)
    .where(eq(authoritySetting.userId, userId))
    .orderBy(desc(authoritySetting.updatedAt));
}

/**
 * Find authority settings for a user with joined action type info
 */
export async function findAuthoritySettingsWithActionTypes(
  userId: string
): Promise<Array<AuthoritySetting & { actionType: typeof actionType.$inferSelect }>> {
  const results = await database
    .select({
      authoritySetting: authoritySetting,
      actionType: actionType,
    })
    .from(authoritySetting)
    .innerJoin(actionType, eq(authoritySetting.actionTypeId, actionType.id))
    .where(eq(authoritySetting.userId, userId))
    .orderBy(actionType.category, actionType.name);

  return results.map((r) => ({
    ...r.authoritySetting,
    actionType: r.actionType,
  }));
}

/**
 * Update an authority setting
 */
export async function updateAuthoritySetting(
  id: string,
  data: UpdateAuthoritySettingData
): Promise<AuthoritySetting | null> {
  const [updated] = await database
    .update(authoritySetting)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(authoritySetting.id, id))
    .returning();

  return updated || null;
}

/**
 * Update or create an authority setting for a user and action type
 */
export async function upsertAuthoritySetting(
  userId: string,
  actionTypeId: string,
  authorityLevel: AuthorityLevel,
  conditions?: AuthorityConditions
): Promise<AuthoritySetting> {
  const existing = await findAuthoritySettingByUserAndActionType(userId, actionTypeId);

  if (existing) {
    const updated = await updateAuthoritySetting(existing.id, {
      authorityLevel,
      conditions,
    });
    return updated!;
  }

  return createAuthoritySetting({
    userId,
    actionTypeId,
    authorityLevel,
    conditions,
  });
}

/**
 * Delete an authority setting
 */
export async function deleteAuthoritySetting(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(authoritySetting)
    .where(eq(authoritySetting.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Delete all authority settings for a user
 */
export async function deleteAuthoritySettingsByUserId(userId: string): Promise<number> {
  const deleted = await database
    .delete(authoritySetting)
    .where(eq(authoritySetting.userId, userId))
    .returning();

  return deleted.length;
}

/**
 * Get the effective authority level for a user and action type
 * Falls back to the action type's default if no user setting exists
 */
export async function getEffectiveAuthorityLevel(
  userId: string,
  actionTypeId: string
): Promise<{
  authorityLevel: AuthorityLevel;
  isUserOverride: boolean;
  conditions: AuthorityConditions | null;
}> {
  // First check for user-specific setting
  const userSetting = await findAuthoritySettingByUserAndActionType(userId, actionTypeId);

  if (userSetting) {
    return {
      authorityLevel: userSetting.authorityLevel,
      isUserOverride: true,
      conditions: userSetting.conditions,
    };
  }

  // Fall back to action type default
  const [type] = await database
    .select()
    .from(actionType)
    .where(eq(actionType.id, actionTypeId))
    .limit(1);

  if (!type) {
    throw new Error(`Action type not found: ${actionTypeId}`);
  }

  return {
    authorityLevel: type.defaultAuthorityLevel,
    isUserOverride: false,
    conditions: null,
  };
}

/**
 * Initialize default authority settings for a new user
 * Creates settings based on action type defaults
 */
export async function initializeUserAuthoritySettings(userId: string): Promise<AuthoritySetting[]> {
  const allActionTypes = await database.select().from(actionType);
  const existingSettings = await findAuthoritySettingsByUserId(userId);
  const existingTypeIds = new Set(existingSettings.map((s) => s.actionTypeId));

  const newSettings: AuthoritySetting[] = [];

  for (const type of allActionTypes) {
    if (!existingTypeIds.has(type.id)) {
      const setting = await createAuthoritySetting({
        userId,
        actionTypeId: type.id,
        authorityLevel: type.defaultAuthorityLevel,
      });
      newSettings.push(setting);
    }
  }

  return newSettings;
}

/**
 * Bulk update authority settings for a user
 */
export async function bulkUpdateAuthoritySettings(
  userId: string,
  updates: Array<{
    actionTypeId: string;
    authorityLevel: AuthorityLevel;
    conditions?: AuthorityConditions;
  }>
): Promise<AuthoritySetting[]> {
  const results: AuthoritySetting[] = [];

  for (const update of updates) {
    const setting = await upsertAuthoritySetting(
      userId,
      update.actionTypeId,
      update.authorityLevel,
      update.conditions
    );
    results.push(setting);
  }

  return results;
}

/**
 * Set all authority settings for a user to a specific level
 * Useful for "enable all automation" or "disable all" actions
 */
export async function setAllAuthorityLevels(
  userId: string,
  authorityLevel: AuthorityLevel
): Promise<number> {
  const updated = await database
    .update(authoritySetting)
    .set({
      authorityLevel,
      updatedAt: new Date(),
    })
    .where(eq(authoritySetting.userId, userId))
    .returning();

  return updated.length;
}

import { eq } from "drizzle-orm";
import { database } from "~/db";
import {
  privacySettings,
  type PrivacySettings,
  type CreatePrivacySettingsData,
  type UpdatePrivacySettingsData,
  type PersonDomain,
} from "~/db/schema";

// ============================================================================
// Privacy Settings CRUD
// ============================================================================

/**
 * Create privacy settings for a user
 */
export async function createPrivacySettings(
  data: CreatePrivacySettingsData
): Promise<PrivacySettings> {
  const [newSettings] = await database
    .insert(privacySettings)
    .values(data)
    .returning();

  return newSettings;
}

/**
 * Find privacy settings by ID
 */
export async function findPrivacySettingsById(
  id: string
): Promise<PrivacySettings | null> {
  const [result] = await database
    .select()
    .from(privacySettings)
    .where(eq(privacySettings.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find privacy settings by user ID
 */
export async function findPrivacySettingsByUserId(
  userId: string
): Promise<PrivacySettings | null> {
  const [result] = await database
    .select()
    .from(privacySettings)
    .where(eq(privacySettings.userId, userId))
    .limit(1);

  return result || null;
}

/**
 * Find or create privacy settings for a user (with defaults)
 */
export async function findOrCreatePrivacySettings(
  userId: string
): Promise<PrivacySettings> {
  const existing = await findPrivacySettingsByUserId(userId);
  if (existing) {
    return existing;
  }

  return createPrivacySettings({
    id: crypto.randomUUID(),
    userId,
    allowCloudAI: true,
    excludedDomains: [],
    excludedPersonIds: [],
    excludedEmailDomains: [],
    redactPatterns: [],
  });
}

/**
 * Update privacy settings
 */
export async function updatePrivacySettings(
  id: string,
  data: UpdatePrivacySettingsData
): Promise<PrivacySettings | null> {
  const [updated] = await database
    .update(privacySettings)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(privacySettings.id, id))
    .returning();

  return updated || null;
}

/**
 * Update privacy settings by user ID
 */
export async function updatePrivacySettingsByUserId(
  userId: string,
  data: UpdatePrivacySettingsData
): Promise<PrivacySettings | null> {
  const [updated] = await database
    .update(privacySettings)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(privacySettings.userId, userId))
    .returning();

  return updated || null;
}

/**
 * Upsert privacy settings for a user
 */
export async function upsertPrivacySettings(
  userId: string,
  data: Omit<UpdatePrivacySettingsData, "id" | "userId">
): Promise<PrivacySettings> {
  const existing = await findPrivacySettingsByUserId(userId);

  if (existing) {
    const updated = await updatePrivacySettings(existing.id, data);
    return updated!;
  }

  return createPrivacySettings({
    id: crypto.randomUUID(),
    userId,
    ...data,
  });
}

/**
 * Delete privacy settings
 */
export async function deletePrivacySettings(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(privacySettings)
    .where(eq(privacySettings.id, id))
    .returning();

  return deleted !== undefined;
}

// ============================================================================
// Privacy Settings Specific Operations
// ============================================================================

/**
 * Add a domain to the excluded domains list
 */
export async function addExcludedDomain(
  userId: string,
  domain: PersonDomain
): Promise<PrivacySettings | null> {
  const settings = await findOrCreatePrivacySettings(userId);
  const currentDomains = settings.excludedDomains || [];

  if (currentDomains.includes(domain)) {
    return settings; // Already excluded
  }

  return updatePrivacySettings(settings.id, {
    excludedDomains: [...currentDomains, domain],
  });
}

/**
 * Remove a domain from the excluded domains list
 */
export async function removeExcludedDomain(
  userId: string,
  domain: PersonDomain
): Promise<PrivacySettings | null> {
  const settings = await findPrivacySettingsByUserId(userId);
  if (!settings) return null;

  const currentDomains = settings.excludedDomains || [];
  const filteredDomains = currentDomains.filter((d) => d !== domain);

  return updatePrivacySettings(settings.id, {
    excludedDomains: filteredDomains,
  });
}

/**
 * Add a person ID to the excluded persons list
 */
export async function addExcludedPerson(
  userId: string,
  personId: string
): Promise<PrivacySettings | null> {
  const settings = await findOrCreatePrivacySettings(userId);
  const currentPersons = settings.excludedPersonIds || [];

  if (currentPersons.includes(personId)) {
    return settings; // Already excluded
  }

  return updatePrivacySettings(settings.id, {
    excludedPersonIds: [...currentPersons, personId],
  });
}

/**
 * Remove a person ID from the excluded persons list
 */
export async function removeExcludedPerson(
  userId: string,
  personId: string
): Promise<PrivacySettings | null> {
  const settings = await findPrivacySettingsByUserId(userId);
  if (!settings) return null;

  const currentPersons = settings.excludedPersonIds || [];
  const filteredPersons = currentPersons.filter((p) => p !== personId);

  return updatePrivacySettings(settings.id, {
    excludedPersonIds: filteredPersons,
  });
}

/**
 * Add an email domain to the excluded email domains list
 */
export async function addExcludedEmailDomain(
  userId: string,
  emailDomain: string
): Promise<PrivacySettings | null> {
  const settings = await findOrCreatePrivacySettings(userId);
  const currentDomains = settings.excludedEmailDomains || [];
  const normalizedDomain = emailDomain.toLowerCase();

  if (currentDomains.includes(normalizedDomain)) {
    return settings; // Already excluded
  }

  return updatePrivacySettings(settings.id, {
    excludedEmailDomains: [...currentDomains, normalizedDomain],
  });
}

/**
 * Remove an email domain from the excluded email domains list
 */
export async function removeExcludedEmailDomain(
  userId: string,
  emailDomain: string
): Promise<PrivacySettings | null> {
  const settings = await findPrivacySettingsByUserId(userId);
  if (!settings) return null;

  const normalizedDomain = emailDomain.toLowerCase();
  const currentDomains = settings.excludedEmailDomains || [];
  const filteredDomains = currentDomains.filter(
    (d) => d.toLowerCase() !== normalizedDomain
  );

  return updatePrivacySettings(settings.id, {
    excludedEmailDomains: filteredDomains,
  });
}

/**
 * Add a redaction pattern
 */
export async function addRedactPattern(
  userId: string,
  pattern: string
): Promise<PrivacySettings | null> {
  const settings = await findOrCreatePrivacySettings(userId);
  const currentPatterns = settings.redactPatterns || [];

  if (currentPatterns.includes(pattern)) {
    return settings; // Already exists
  }

  return updatePrivacySettings(settings.id, {
    redactPatterns: [...currentPatterns, pattern],
  });
}

/**
 * Remove a redaction pattern
 */
export async function removeRedactPattern(
  userId: string,
  pattern: string
): Promise<PrivacySettings | null> {
  const settings = await findPrivacySettingsByUserId(userId);
  if (!settings) return null;

  const currentPatterns = settings.redactPatterns || [];
  const filteredPatterns = currentPatterns.filter((p) => p !== pattern);

  return updatePrivacySettings(settings.id, {
    redactPatterns: filteredPatterns,
  });
}

/**
 * Toggle cloud AI permission
 */
export async function setCloudAIPermission(
  userId: string,
  allow: boolean
): Promise<PrivacySettings | null> {
  const settings = await findOrCreatePrivacySettings(userId);
  return updatePrivacySettings(settings.id, { allowCloudAI: allow });
}

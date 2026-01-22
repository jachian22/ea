import { eq } from 'drizzle-orm';
import { database } from '~/db';
import {
  googleIntegration,
  type GoogleIntegration,
  type CreateGoogleIntegrationData,
  type UpdateGoogleIntegrationData,
} from '~/db/schema';

/**
 * Create a new Google integration for a user
 */
export async function createGoogleIntegration(
  data: CreateGoogleIntegrationData
): Promise<GoogleIntegration> {
  const [newIntegration] = await database.insert(googleIntegration).values(data).returning();

  return newIntegration;
}

/**
 * Find a Google integration by its ID
 */
export async function findGoogleIntegrationById(id: string): Promise<GoogleIntegration | null> {
  const [result] = await database
    .select()
    .from(googleIntegration)
    .where(eq(googleIntegration.id, id))
    .limit(1);

  return result || null;
}

/**
 * Find a Google integration by user ID
 */
export async function findGoogleIntegrationByUserId(
  userId: string
): Promise<GoogleIntegration | null> {
  const [result] = await database
    .select()
    .from(googleIntegration)
    .where(eq(googleIntegration.userId, userId))
    .limit(1);

  return result || null;
}

/**
 * Find a Google integration by Google account ID
 */
export async function findGoogleIntegrationByGoogleAccountId(
  googleAccountId: string
): Promise<GoogleIntegration | null> {
  const [result] = await database
    .select()
    .from(googleIntegration)
    .where(eq(googleIntegration.googleAccountId, googleAccountId))
    .limit(1);

  return result || null;
}

/**
 * Find a Google integration by connected Google email address
 * Used primarily for webhook lookups
 */
export async function findGoogleIntegrationByGoogleEmail(
  googleEmail: string
): Promise<GoogleIntegration | null> {
  const [result] = await database
    .select()
    .from(googleIntegration)
    .where(eq(googleIntegration.googleEmail, googleEmail.toLowerCase()))
    .limit(1);

  return result || null;
}

/**
 * Update a Google integration by ID
 */
export async function updateGoogleIntegration(
  id: string,
  data: UpdateGoogleIntegrationData
): Promise<GoogleIntegration | null> {
  const [updated] = await database
    .update(googleIntegration)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(googleIntegration.id, id))
    .returning();

  return updated || null;
}

/**
 * Update a Google integration by user ID
 */
export async function updateGoogleIntegrationByUserId(
  userId: string,
  data: UpdateGoogleIntegrationData
): Promise<GoogleIntegration | null> {
  const [updated] = await database
    .update(googleIntegration)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(googleIntegration.userId, userId))
    .returning();

  return updated || null;
}

/**
 * Update OAuth tokens for a Google integration
 */
export async function updateGoogleIntegrationTokens(
  userId: string,
  tokens: {
    accessToken: string;
    refreshToken?: string;
    accessTokenExpiresAt: Date;
  }
): Promise<GoogleIntegration | null> {
  const updateData: UpdateGoogleIntegrationData = {
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
  };

  if (tokens.refreshToken) {
    updateData.refreshToken = tokens.refreshToken;
  }

  return updateGoogleIntegrationByUserId(userId, updateData);
}

/**
 * Update the last synced timestamp for a Google integration
 */
export async function updateGoogleIntegrationLastSynced(
  userId: string
): Promise<GoogleIntegration | null> {
  return updateGoogleIntegrationByUserId(userId, {
    lastSyncedAt: new Date(),
  });
}

/**
 * Mark a Google integration as disconnected
 */
export async function disconnectGoogleIntegration(
  userId: string
): Promise<GoogleIntegration | null> {
  return updateGoogleIntegrationByUserId(userId, {
    isConnected: false,
  });
}

/**
 * Mark a Google integration as connected
 */
export async function reconnectGoogleIntegration(
  userId: string
): Promise<GoogleIntegration | null> {
  return updateGoogleIntegrationByUserId(userId, {
    isConnected: true,
  });
}

/**
 * Delete a Google integration by ID
 */
export async function deleteGoogleIntegration(id: string): Promise<boolean> {
  const [deleted] = await database
    .delete(googleIntegration)
    .where(eq(googleIntegration.id, id))
    .returning();

  return deleted !== undefined;
}

/**
 * Delete a Google integration by user ID
 */
export async function deleteGoogleIntegrationByUserId(userId: string): Promise<boolean> {
  const [deleted] = await database
    .delete(googleIntegration)
    .where(eq(googleIntegration.userId, userId))
    .returning();

  return deleted !== undefined;
}

/**
 * Check if a user has an active Google integration
 */
export async function hasActiveGoogleIntegration(userId: string): Promise<boolean> {
  const integration = await findGoogleIntegrationByUserId(userId);
  return integration !== null && integration.isConnected;
}

/**
 * Check if a Google integration's access token is expired
 */
export function isAccessTokenExpired(integration: GoogleIntegration): boolean {
  // Add a 5-minute buffer to account for clock skew and request time
  const bufferMs = 5 * 60 * 1000;
  const expiresAt = new Date(integration.accessTokenExpiresAt).getTime();
  return Date.now() >= expiresAt - bufferMs;
}

/**
 * Upsert a Google integration - create if not exists, update if exists
 */
export async function upsertGoogleIntegration(
  userId: string,
  data: Omit<CreateGoogleIntegrationData, 'userId'>
): Promise<GoogleIntegration> {
  const existing = await findGoogleIntegrationByUserId(userId);

  if (existing) {
    const updated = await updateGoogleIntegration(existing.id, {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      accessTokenExpiresAt: data.accessTokenExpiresAt,
      scope: data.scope,
      googleEmail: data.googleEmail,
      googleAccountId: data.googleAccountId,
      isConnected: true,
    });
    return updated!;
  }

  return createGoogleIntegration({
    ...data,
    userId,
  });
}

/**
 * Find all connected Google integrations (for batch processing like daily briefs)
 */
export async function findAllConnectedGoogleIntegrations(): Promise<GoogleIntegration[]> {
  const results = await database
    .select()
    .from(googleIntegration)
    .where(eq(googleIntegration.isConnected, true));

  return results;
}

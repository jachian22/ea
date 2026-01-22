/**
 * Google OAuth2 Client for EA Bot
 *
 * Creates authenticated OAuth2 clients using stored tokens from the database.
 * Handles automatic token refresh with proper concurrency control.
 */

import { google, type Auth } from 'googleapis';
import { database } from '../db/index.js';
import { googleIntegration, type GoogleIntegration } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn(
    '[GoogleClient] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables'
  );
}

// Mutex for token refresh operations to prevent race conditions
const refreshLocks = new Map<string, Promise<Auth.Credentials>>();

/**
 * Creates a base OAuth2 client without user credentials.
 */
export function createOAuth2Client(): Auth.OAuth2Client {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    // Redirect URI not needed for token refresh
    undefined
  );
}

/**
 * Creates an authenticated OAuth2 client for a user with automatic token refresh.
 * Uses mutex to prevent race conditions during concurrent token refreshes.
 */
export async function createAuthenticatedClient(
  integration: GoogleIntegration
): Promise<Auth.OAuth2Client> {
  const oauth2Client = createOAuth2Client();

  // Set the user's stored credentials
  oauth2Client.setCredentials({
    access_token: integration.accessToken,
    refresh_token: integration.refreshToken,
    expiry_date: integration.accessTokenExpiresAt.getTime(),
  });

  // Set up automatic token refresh handler with proper cleanup
  // Using a bound function so we can potentially remove it later
  const tokenHandler = async (tokens: Auth.Credentials) => {
    try {
      await updateStoredTokens(integration.userId, tokens);
    } catch (error) {
      console.error('[GoogleClient] Failed to update stored tokens:', error);
    }
  };
  oauth2Client.on('tokens', tokenHandler);

  // Check if token needs refresh (within 5 minutes of expiry)
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const expiresAt = integration.accessTokenExpiresAt.getTime();

  if (now >= expiresAt - expiryBuffer) {
    // Token is expired or about to expire, force refresh with mutex
    const newTokens = await refreshAccessTokenWithLock(oauth2Client, integration.userId);
    oauth2Client.setCredentials({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? integration.refreshToken,
      expiry_date: newTokens.expiry_date,
    });
  }

  return oauth2Client;
}

/**
 * Refreshes the access token with a mutex lock to prevent race conditions.
 * If a refresh is already in progress for this user, waits for it to complete.
 */
async function refreshAccessTokenWithLock(
  oauth2Client: Auth.OAuth2Client,
  userId: string
): Promise<Auth.Credentials> {
  // Check if a refresh is already in progress for this user
  const existingRefresh = refreshLocks.get(userId);
  if (existingRefresh) {
    console.log(`[GoogleClient] Token refresh already in progress for user ${userId}, waiting...`);
    return existingRefresh;
  }

  // Create a new refresh promise
  const refreshPromise = refreshAccessToken(oauth2Client, userId);
  refreshLocks.set(userId, refreshPromise);

  try {
    const result = await refreshPromise;
    return result;
  } finally {
    // Clean up the lock
    refreshLocks.delete(userId);
  }
}

/**
 * Manually refreshes the access token using the refresh token.
 */
async function refreshAccessToken(
  oauth2Client: Auth.OAuth2Client,
  userId: string
): Promise<Auth.Credentials> {
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await updateStoredTokens(userId, credentials);
    return credentials;
  } catch (error) {
    await markIntegrationDisconnected(userId);
    throw new GoogleAuthError(
      'Failed to refresh access token. User needs to re-authenticate.',
      'TOKEN_REFRESH_FAILED',
      error
    );
  }
}

/**
 * Updates the stored tokens in the database after a refresh.
 */
async function updateStoredTokens(userId: string, tokens: Auth.Credentials): Promise<void> {
  const updateData: Partial<GoogleIntegration> = {
    updatedAt: new Date(),
  };

  if (tokens.access_token) {
    updateData.accessToken = tokens.access_token;
  }

  if (tokens.refresh_token) {
    updateData.refreshToken = tokens.refresh_token;
  }

  if (tokens.expiry_date) {
    updateData.accessTokenExpiresAt = new Date(tokens.expiry_date);
  }

  await database
    .update(googleIntegration)
    .set(updateData)
    .where(eq(googleIntegration.userId, userId));
}

/**
 * Marks a user's Google integration as disconnected.
 */
export async function markIntegrationDisconnected(userId: string): Promise<void> {
  await database
    .update(googleIntegration)
    .set({
      isConnected: false,
      updatedAt: new Date(),
    })
    .where(eq(googleIntegration.userId, userId));
}

/**
 * Validates that an integration has valid tokens and is still connected.
 */
export function isIntegrationValid(
  integration: GoogleIntegration | null
): integration is GoogleIntegration {
  if (!integration) return false;
  if (!integration.isConnected) return false;
  if (!integration.accessToken || !integration.refreshToken) return false;
  return true;
}

/**
 * Custom error class for Google authentication errors.
 */
export class GoogleAuthError extends Error {
  code: string;
  cause?: unknown;

  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Error codes for Google authentication errors.
 */
export const GoogleAuthErrorCodes = {
  TOKEN_REFRESH_FAILED: 'TOKEN_REFRESH_FAILED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INTEGRATION_NOT_FOUND: 'INTEGRATION_NOT_FOUND',
  INTEGRATION_DISCONNECTED: 'INTEGRATION_DISCONNECTED',
  API_ERROR: 'API_ERROR',
} as const;

export type GoogleAuthErrorCode = keyof typeof GoogleAuthErrorCodes;

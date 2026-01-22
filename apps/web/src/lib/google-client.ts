import { google, type Auth } from 'googleapis';
import { privateEnv } from '~/config/privateEnv';
import { database } from '~/db';
import { googleIntegration, type GoogleIntegration } from '~/db/schema';
import { eq } from 'drizzle-orm';

// Google OAuth2 scopes required for Gmail and Calendar access
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Creates a base OAuth2 client without user credentials.
 * Use this for generating authorization URLs and exchanging auth codes.
 */
export function createOAuth2Client(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    privateEnv.GOOGLE_CLIENT_ID,
    privateEnv.GOOGLE_CLIENT_SECRET,
    privateEnv.GOOGLE_OAUTH_REDIRECT_URI
  );
}

/**
 * Generates the Google OAuth authorization URL for user consent.
 * @param state Optional state parameter for CSRF protection
 * @returns The authorization URL to redirect users to
 */
export function getGoogleAuthUrl(state?: string): string {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: GOOGLE_SCOPES,
    prompt: 'consent', // Force consent screen to always get refresh token
    state,
  });
}

/**
 * Exchanges an authorization code for access and refresh tokens.
 * @param code The authorization code from Google OAuth callback
 * @returns The tokens object containing access_token, refresh_token, etc.
 */
export async function exchangeCodeForTokens(code: string): Promise<Auth.Credentials> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Gets user info from Google using an access token.
 * @param accessToken A valid Google access token
 * @returns User info including email and profile details
 */
export async function getGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name?: string;
  picture?: string;
}> {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  if (!data.id || !data.email) {
    throw new Error('Failed to retrieve Google user info');
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name ?? undefined,
    picture: data.picture ?? undefined,
  };
}

/**
 * Creates an authenticated OAuth2 client for a user with automatic token refresh.
 * This client can be used to make authenticated requests to Google APIs.
 *
 * When the access token expires, it will automatically refresh using the
 * refresh token and update the stored credentials in the database.
 *
 * @param integration The user's Google integration record from the database
 * @returns An authenticated OAuth2 client ready for API calls
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

  // Set up automatic token refresh handler
  oauth2Client.on('tokens', async (tokens) => {
    try {
      await updateStoredTokens(integration.userId, tokens);
    } catch (error) {
      console.error('Failed to update stored tokens:', error);
    }
  });

  // Check if token needs refresh (within 5 minutes of expiry)
  const expiryBuffer = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();
  const expiresAt = integration.accessTokenExpiresAt.getTime();

  if (now >= expiresAt - expiryBuffer) {
    // Token is expired or about to expire, force refresh
    const newTokens = await refreshAccessToken(oauth2Client, integration.userId);
    oauth2Client.setCredentials({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token ?? integration.refreshToken,
      expiry_date: newTokens.expiry_date,
    });
  }

  return oauth2Client;
}

/**
 * Manually refreshes the access token using the refresh token.
 * Updates the stored tokens in the database.
 *
 * @param oauth2Client The OAuth2 client with refresh token set
 * @param userId The user ID to update in the database
 * @returns The new tokens
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
    // If refresh fails, mark integration as disconnected
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
 * @param userId The user ID to update
 * @param tokens The new tokens from Google
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
 * This should be called when token refresh fails or user revokes access.
 * @param userId The user ID to update
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
 * @param integration The Google integration to validate
 * @returns true if valid, false otherwise
 */
export function isIntegrationValid(integration: GoogleIntegration | null): boolean {
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

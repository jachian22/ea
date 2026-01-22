import { createServerFn } from "@tanstack/react-start";
import { authenticatedMiddleware } from "./middleware";
import {
  getGoogleAuthUrl,
  GOOGLE_SCOPES,
  createOAuth2Client,
} from "~/lib/google-client";
import {
  findGoogleIntegrationByUserId,
  deleteGoogleIntegrationByUserId,
} from "~/data-access/google-integration";
import crypto from "crypto";

/**
 * Initiates the Google OAuth flow by generating an authorization URL.
 *
 * The state parameter includes a cryptographic nonce and the user ID,
 * which will be validated in the callback to prevent CSRF attacks
 * and associate the tokens with the correct user.
 *
 * @returns The authorization URL to redirect the user to Google's consent screen
 */
export const initiateGoogleAuthFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      // Generate a secure state parameter for CSRF protection
      // The state contains: userId|nonce
      // This allows us to:
      // 1. Verify the callback is for a legitimate request (nonce)
      // 2. Associate the tokens with the correct user (userId)
      const nonce = crypto.randomBytes(16).toString("hex");
      const state = Buffer.from(`${userId}|${nonce}`).toString("base64url");

      // Generate the Google OAuth authorization URL
      const authUrl = getGoogleAuthUrl(state);

      return {
        success: true,
        data: {
          authUrl,
          scopes: GOOGLE_SCOPES,
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to initiate Google OAuth flow:", error);
      return {
        success: false,
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate Google authentication",
      };
    }
  });

/**
 * Parses the state parameter from the OAuth callback.
 * This is used internally by the callback route handler.
 *
 * @param state The base64url-encoded state parameter from the callback
 * @returns The parsed userId and nonce, or null if invalid
 */
export function parseOAuthState(
  state: string
): { userId: string; nonce: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const [userId, nonce] = decoded.split("|");

    if (!userId || !nonce) {
      return null;
    }

    return { userId, nonce };
  } catch {
    return null;
  }
}

/**
 * Disconnects the user's Google integration.
 *
 * This function:
 * 1. Retrieves the user's Google integration record
 * 2. Attempts to revoke the access token with Google (best practice)
 * 3. Deletes the integration record from the database
 *
 * Even if token revocation fails (e.g., token already expired/invalid),
 * the integration record will still be deleted to ensure a clean disconnect.
 *
 * @returns Success/failure status of the disconnect operation
 */
export const disconnectGoogleIntegrationFn = createServerFn({ method: "POST" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      // Find the user's Google integration
      const integration = await findGoogleIntegrationByUserId(userId);

      if (!integration) {
        return {
          success: false,
          data: null,
          error: "No Google integration found for this user",
        };
      }

      // Attempt to revoke the access token with Google
      // This is a best practice to properly de-authorize the app
      // We don't fail the disconnect if this fails (token might already be invalid)
      try {
        const oauth2Client = createOAuth2Client();
        await oauth2Client.revokeToken(integration.accessToken);
      } catch (revokeError) {
        // Log but don't fail - the token might already be invalid/expired
        console.warn(
          "Failed to revoke Google token (may already be invalid):",
          revokeError
        );
      }

      // Delete the integration record from the database
      const deleted = await deleteGoogleIntegrationByUserId(userId);

      if (!deleted) {
        return {
          success: false,
          data: null,
          error: "Failed to delete Google integration record",
        };
      }

      return {
        success: true,
        data: {
          message: "Google integration disconnected successfully",
        },
        error: null,
      };
    } catch (error) {
      console.error("Failed to disconnect Google integration:", error);
      return {
        success: false,
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to disconnect Google integration",
      };
    }
  });

/**
 * Response type for Google integration status
 */
export type GoogleIntegrationStatus = {
  /** Whether the user has a Google integration record */
  hasIntegration: boolean;
  /** Whether the integration is currently connected and active */
  isConnected: boolean;
  /** The Google email address associated with the integration */
  googleEmail: string | null;
  /** The OAuth scopes granted by the user */
  scope: string | null;
  /** When the integration was last successfully synced */
  lastSyncedAt: Date | null;
  /** When the integration was first created */
  connectedAt: Date | null;
  /** Whether the access token is expired or about to expire */
  needsReauthorization: boolean;
};

/**
 * Checks the status of the user's Google integration.
 *
 * This function retrieves the current state of the user's Google integration,
 * including whether they have an active connection, the associated email,
 * and whether the token needs to be refreshed.
 *
 * Use this to display the integration status in the UI and determine
 * whether to show connect/disconnect options.
 *
 * @returns The Google integration status for the authenticated user
 */
export const getGoogleIntegrationStatusFn = createServerFn({ method: "GET" })
  .middleware([authenticatedMiddleware])
  .handler(async ({ context }) => {
    const { userId } = context;

    try {
      const integration = await findGoogleIntegrationByUserId(userId);

      // User has no Google integration
      if (!integration) {
        return {
          success: true,
          data: {
            hasIntegration: false,
            isConnected: false,
            googleEmail: null,
            scope: null,
            lastSyncedAt: null,
            connectedAt: null,
            needsReauthorization: false,
          } satisfies GoogleIntegrationStatus,
          error: null,
        };
      }

      // Check if the access token is expired or about to expire
      // We use a 5-minute buffer to account for clock skew
      const bufferMs = 5 * 60 * 1000;
      const expiresAt = new Date(integration.accessTokenExpiresAt).getTime();
      const isTokenExpired = Date.now() >= expiresAt - bufferMs;

      // needsReauthorization is true if:
      // 1. The token is expired AND there's no refresh token (shouldn't happen but safety check)
      // 2. The integration is marked as disconnected (user revoked access externally)
      const needsReauthorization =
        !integration.isConnected ||
        (isTokenExpired && !integration.refreshToken);

      return {
        success: true,
        data: {
          hasIntegration: true,
          isConnected: integration.isConnected,
          googleEmail: integration.googleEmail,
          scope: integration.scope,
          lastSyncedAt: integration.lastSyncedAt,
          connectedAt: integration.createdAt,
          needsReauthorization,
        } satisfies GoogleIntegrationStatus,
        error: null,
      };
    } catch (error) {
      console.error("Failed to get Google integration status:", error);
      return {
        success: false,
        data: null,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get Google integration status",
      };
    }
  });

import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
  GOOGLE_SCOPES,
} from "~/lib/google-client";
import { parseOAuthState } from "~/fn/google-auth";
import { upsertGoogleIntegration } from "~/data-access/google-integration";
import { nanoid } from "nanoid";

/**
 * Google OAuth callback route handler.
 *
 * This endpoint is called by Google after the user completes the OAuth consent flow.
 * It receives an authorization code which is exchanged for access and refresh tokens.
 *
 * Flow:
 * 1. Validate the state parameter to prevent CSRF attacks
 * 2. Exchange the authorization code for tokens
 * 3. Fetch the user's Google profile info
 * 4. Store/update the integration in the database
 * 5. Redirect to the dashboard with success/error status
 */
export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Base redirect URL for dashboard settings
        const dashboardSettingsUrl = "/dashboard/settings";

        // Handle error from Google (user denied access, etc.)
        if (error) {
          console.error("Google OAuth error:", error);
          const errorDescription =
            url.searchParams.get("error_description") || "Access denied";
          return redirectWithError(dashboardSettingsUrl, errorDescription);
        }

        // Validate required parameters
        if (!code) {
          console.error("Google OAuth callback missing code parameter");
          return redirectWithError(
            dashboardSettingsUrl,
            "Missing authorization code"
          );
        }

        if (!state) {
          console.error("Google OAuth callback missing state parameter");
          return redirectWithError(
            dashboardSettingsUrl,
            "Invalid state parameter"
          );
        }

        // Parse and validate the state parameter
        const parsedState = parseOAuthState(state);
        if (!parsedState) {
          console.error("Google OAuth callback: failed to parse state");
          return redirectWithError(
            dashboardSettingsUrl,
            "Invalid state parameter"
          );
        }

        const { userId } = parsedState;

        try {
          // Exchange the authorization code for tokens
          const tokens = await exchangeCodeForTokens(code);

          if (!tokens.access_token) {
            throw new Error("No access token received from Google");
          }

          if (!tokens.refresh_token) {
            // This can happen if the user has already authorized the app before
            // and we didn't get a new refresh token. We should still allow this
            // for re-authorization scenarios, but log a warning.
            console.warn(
              "No refresh token received - user may have previously authorized this app"
            );
          }

          // Get the user's Google profile info
          const googleUserInfo = await getGoogleUserInfo(tokens.access_token);

          // Calculate token expiry date
          // Google tokens typically expire in 1 hour (3600 seconds)
          const expiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : new Date(Date.now() + 3600 * 1000);

          // Store or update the integration in the database
          await upsertGoogleIntegration(userId, {
            id: nanoid(),
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || "",
            accessTokenExpiresAt: expiresAt,
            scope: GOOGLE_SCOPES.join(" "),
            googleEmail: googleUserInfo.email,
            googleAccountId: googleUserInfo.id,
            isConnected: true,
          });

          console.log(
            `Google integration connected for user ${userId} (${googleUserInfo.email})`
          );

          // Redirect to dashboard with success message
          return Response.redirect(
            new URL(
              `${dashboardSettingsUrl}?google_connected=true`,
              request.url
            ),
            302
          );
        } catch (err) {
          console.error("Failed to complete Google OAuth flow:", err);

          const errorMessage =
            err instanceof Error
              ? err.message
              : "Failed to connect Google account";

          return redirectWithError(dashboardSettingsUrl, errorMessage);
        }
      },
    },
  },
});

/**
 * Creates a redirect response with an error message in the query params.
 */
function redirectWithError(basePath: string, error: string): Response {
  const errorUrl = `${basePath}?google_error=${encodeURIComponent(error)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: errorUrl,
    },
  });
}

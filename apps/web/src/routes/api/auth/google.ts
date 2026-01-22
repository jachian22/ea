import { createFileRoute } from "@tanstack/react-router";
import { getGoogleAuthUrl } from "~/lib/google-client";
import crypto from "crypto";

const OAUTH_STATE_COOKIE = "oauth_state";
const OAUTH_STATE_MAX_AGE = 600; // 10 minutes
const STATE_TYPE_SIGNIN = "signin";

/**
 * Creates an HMAC signature for the OAuth state.
 */
function signState(data: string): string {
  const secret = process.env.SESSION_SECRET || "development-secret-change-in-production";
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Validates that a redirect URL is safe (relative path only).
 */
function isValidRedirect(url: string): boolean {
  // Must start with / and not be a protocol-relative URL (//)
  // Also reject any URL with a colon before the first slash (protocol)
  return url.startsWith("/") && !url.startsWith("//") && !url.includes(":");
}

/**
 * Initiates Google OAuth for sign-in.
 *
 * Unlike the integration connection flow, this doesn't require an existing session.
 * The state parameter uses a special format to indicate this is a sign-in flow.
 */
export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirectParam = url.searchParams.get("redirect") || "/dashboard";

        // Validate redirect URL to prevent open redirect attacks
        const redirectTo = isValidRedirect(redirectParam) ? redirectParam : "/dashboard";

        // Generate a secure nonce for CSRF protection
        const nonce = crypto.randomBytes(16).toString("hex");

        // Create state payload and sign it with HMAC
        // Format: type|nonce|redirectUrl|signature
        const stateData = `${STATE_TYPE_SIGNIN}|${nonce}|${redirectTo}`;
        const signature = signState(stateData);
        const state = Buffer.from(`${stateData}|${signature}`).toString("base64url");

        // Generate the Google OAuth authorization URL
        const authUrl = getGoogleAuthUrl(state);

        // Set a cookie with the nonce for verification on callback
        const isProduction = process.env.NODE_ENV === "production";
        const securePart = isProduction ? "; Secure" : "";
        const nonceCookie = `${OAUTH_STATE_COOKIE}=${nonce}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=${OAUTH_STATE_MAX_AGE}`;

        // Redirect to Google OAuth consent screen
        return new Response(null, {
          status: 302,
          headers: {
            Location: authUrl,
            "Set-Cookie": nonceCookie,
          },
        });
      },
    },
  },
});

export { OAUTH_STATE_COOKIE, STATE_TYPE_SIGNIN, signState, isValidRedirect };

import { createFileRoute } from "@tanstack/react-router";
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
  GOOGLE_SCOPES,
} from "~/lib/google-client";
import { upsertGoogleIntegration } from "~/data-access/google-integration";
import { findOrCreateUserByEmail } from "~/data-access/users";
import { createSession, createSessionCookie } from "~/lib/session";
import { nanoid } from "nanoid";
import crypto from "crypto";

const OAUTH_STATE_COOKIE = "oauth_state";
const STATE_TYPE_SIGNIN = "signin";

/**
 * Creates an HMAC signature for the OAuth state (must match google.ts).
 */
function signState(data: string): string {
  const secret = process.env.SESSION_SECRET || "development-secret-change-in-production";
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

/**
 * Validates that a redirect URL is safe (relative path only).
 */
function isValidRedirect(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//") && !url.includes(":");
}

/**
 * Extracts the nonce from the oauth_state cookie.
 */
function getNonceFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((c) => c.trim());
  const stateCookie = cookies.find((c) => c.startsWith(`${OAUTH_STATE_COOKIE}=`));
  if (!stateCookie) return null;
  return stateCookie.slice(OAUTH_STATE_COOKIE.length + 1) || null;
}

/**
 * Creates a cookie header to clear the oauth_state cookie.
 */
function createClearOAuthStateCookie(): string {
  const isProduction = process.env.NODE_ENV === "production";
  const securePart = isProduction ? "; Secure" : "";
  return `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}

/**
 * Parses and validates the state parameter from the OAuth callback.
 * Verifies HMAC signature and nonce against cookie.
 *
 * Supports two formats:
 * 1. Sign-in flow: "signin|nonce|redirectUrl|signature" (base64url encoded)
 * 2. Integration connection flow: "userId|nonce|signature" (base64url encoded)
 */
function parseAndValidateOAuthState(
  state: string,
  expectedNonce: string | null
): {
  type: "signin" | "integration";
  userId?: string;
  nonce: string;
  redirectUrl?: string;
} | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parts = decoded.split("|");

    if (parts[0] === STATE_TYPE_SIGNIN) {
      // Sign-in flow: signin|nonce|redirectUrl|signature
      const [type, nonce, redirectUrl, signature] = parts;
      if (!nonce || !signature) return null;

      // Verify HMAC signature
      const stateData = `${type}|${nonce}|${redirectUrl || ""}`;
      const expectedSignature = signState(stateData);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error("OAuth state signature verification failed");
        return null;
      }

      // Verify nonce matches cookie (CSRF protection)
      if (expectedNonce && nonce !== expectedNonce) {
        console.error("OAuth state nonce mismatch");
        return null;
      }

      // Validate redirect URL
      const safeRedirect = redirectUrl && isValidRedirect(redirectUrl) ? redirectUrl : "/dashboard";

      return { type: "signin", nonce, redirectUrl: safeRedirect };
    } else {
      // Integration connection flow: userId|nonce|signature
      const [userId, nonce, signature] = parts;
      if (!userId || !nonce || !signature) return null;

      // Verify HMAC signature
      const stateData = `${userId}|${nonce}`;
      const expectedSignature = signState(stateData);
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        console.error("OAuth state signature verification failed");
        return null;
      }

      // Verify nonce matches cookie (CSRF protection)
      if (expectedNonce && nonce !== expectedNonce) {
        console.error("OAuth state nonce mismatch");
        return null;
      }

      return { type: "integration", userId, nonce };
    }
  } catch {
    return null;
  }
}

/**
 * Google OAuth callback route handler.
 *
 * This endpoint handles two flows:
 * 1. Sign-in: User is signing in with Google (no existing session)
 * 2. Integration: User is connecting Google to an existing account
 *
 * The flow is determined by the state parameter format.
 */
export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Handle error from Google (user denied access, etc.)
        if (error) {
          console.error("Google OAuth error:", error);
          const errorDescription =
            url.searchParams.get("error_description") || "Access denied";
          return redirectWithError("/sign-in", errorDescription, true);
        }

        // Validate required parameters
        if (!code) {
          console.error("Google OAuth callback missing code parameter");
          return redirectWithError("/sign-in", "Missing authorization code", true);
        }

        if (!state) {
          console.error("Google OAuth callback missing state parameter");
          return redirectWithError("/sign-in", "Invalid state parameter", true);
        }

        // Extract nonce from cookie for CSRF verification
        const cookieHeader = request.headers.get("cookie");
        const cookieNonce = getNonceFromCookie(cookieHeader);

        // Parse and validate the state parameter (verifies signature and nonce)
        const parsedState = parseAndValidateOAuthState(state, cookieNonce);
        if (!parsedState) {
          console.error("Google OAuth callback: state validation failed");
          return redirectWithError("/sign-in", "Invalid or expired state parameter", true);
        }

        try {
          // Exchange the authorization code for tokens
          const tokens = await exchangeCodeForTokens(code);

          // Validate access token before proceeding
          const accessToken = tokens.access_token;
          if (!accessToken) {
            throw new Error("No access token received from Google");
          }

          // Get the user's Google profile info
          const googleUserInfo = await getGoogleUserInfo(accessToken);

          // Calculate token expiry date (default to 1 hour if not provided)
          const DEFAULT_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
          const expiresAt = tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : new Date(Date.now() + DEFAULT_TOKEN_EXPIRY_MS);

          // Prepare validated tokens object
          const validatedTokens = {
            accessToken,
            refreshToken: tokens.refresh_token,
          };

          if (parsedState.type === "signin") {
            // Sign-in flow: Create/find user and create session
            return handleSignIn(
              request,
              googleUserInfo,
              validatedTokens,
              expiresAt,
              parsedState.redirectUrl || "/dashboard"
            );
          } else {
            // Integration connection flow: Store tokens for existing user
            if (!parsedState.userId) {
              throw new Error("Missing user ID for integration flow");
            }
            return handleIntegrationConnection(
              request,
              parsedState.userId,
              googleUserInfo,
              validatedTokens,
              expiresAt
            );
          }
        } catch (err) {
          console.error("Failed to complete Google OAuth flow:", err);
          const errorMessage =
            err instanceof Error
              ? err.message
              : "Failed to authenticate with Google";

          const redirectPath =
            parsedState.type === "signin" ? "/sign-in" : "/dashboard/settings";
          return redirectWithError(redirectPath, errorMessage, true);
        }
      },
    },
  },
});

/**
 * Handles the sign-in flow: creates user, session, and stores tokens.
 */
async function handleSignIn(
  request: Request,
  googleUserInfo: { id: string; email: string; name?: string; picture?: string },
  tokens: { accessToken: string; refreshToken?: string | null },
  expiresAt: Date,
  redirectUrl: string
): Promise<Response> {
  // Find or create user
  const user = await findOrCreateUserByEmail({
    email: googleUserInfo.email,
    name: googleUserInfo.name || googleUserInfo.email.split("@")[0],
    image: googleUserInfo.picture,
  });

  // Create session
  const sessionToken = await createSession(user.id);

  // Store Google integration for Gmail/Calendar access
  await upsertGoogleIntegration(user.id, {
    id: nanoid(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    accessTokenExpiresAt: expiresAt,
    scope: GOOGLE_SCOPES.join(" "),
    googleEmail: googleUserInfo.email,
    googleAccountId: googleUserInfo.id,
    isConnected: true,
  });

  // Log without PII
  console.log(`User signed in: ${user.id}`);

  // Redirect to dashboard with session cookie and clear OAuth state cookie
  const headers = new Headers();
  headers.set("Location", new URL(redirectUrl, request.url).toString());
  headers.append("Set-Cookie", createSessionCookie(sessionToken));
  headers.append("Set-Cookie", createClearOAuthStateCookie());

  return new Response(null, { status: 302, headers });
}

/**
 * Handles the integration connection flow: stores tokens for existing user.
 */
async function handleIntegrationConnection(
  request: Request,
  userId: string,
  googleUserInfo: { id: string; email: string; name?: string; picture?: string },
  tokens: { accessToken: string; refreshToken?: string | null },
  expiresAt: Date
): Promise<Response> {
  if (!tokens.refreshToken) {
    console.warn(
      "No refresh token received - user may have previously authorized this app"
    );
  }

  // Store or update the integration in the database
  await upsertGoogleIntegration(userId, {
    id: nanoid(),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken || "",
    accessTokenExpiresAt: expiresAt,
    scope: GOOGLE_SCOPES.join(" "),
    googleEmail: googleUserInfo.email,
    googleAccountId: googleUserInfo.id,
    isConnected: true,
  });

  // Log without PII
  console.log(`Google integration connected for user ${userId}`);

  // Redirect to dashboard settings with success message and clear OAuth state cookie
  const headers = new Headers();
  headers.set("Location", new URL("/dashboard/settings?google_connected=true", request.url).toString());
  headers.append("Set-Cookie", createClearOAuthStateCookie());

  return new Response(null, { status: 302, headers });
}

/**
 * Creates a redirect response with an error message in the query params.
 * Optionally clears the OAuth state cookie.
 */
function redirectWithError(basePath: string, error: string, clearOAuthCookie = false): Response {
  const errorUrl = `${basePath}?error=${encodeURIComponent(error)}`;
  const headers = new Headers();
  headers.set("Location", errorUrl);

  if (clearOAuthCookie) {
    headers.append("Set-Cookie", createClearOAuthStateCookie());
  }

  return new Response(null, { status: 302, headers });
}

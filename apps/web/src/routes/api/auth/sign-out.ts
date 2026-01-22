import { createFileRoute } from "@tanstack/react-router";
import {
  deleteSession,
  getSessionTokenFromCookie,
  createClearSessionCookie,
} from "~/lib/session";

/**
 * Validates that the request origin matches the expected host.
 * This provides CSRF protection for state-changing requests.
 */
function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  // If there's no origin header (e.g., same-origin requests from some browsers),
  // check the referer header instead
  if (!origin) {
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        return refererUrl.host === host;
      } catch {
        return false;
      }
    }
    // No origin or referer - could be a direct API call
    // For sign-out, we'll allow it since the SameSite cookie provides some protection
    return true;
  }

  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * Sign out - clears the session cookie and deletes the session from the database.
 * Includes CSRF protection via Origin header validation.
 */
export const Route = createFileRoute("/api/auth/sign-out")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // CSRF protection: validate origin matches host
        if (!validateOrigin(request)) {
          return Response.json(
            { error: "Invalid request origin" },
            { status: 403 }
          );
        }

        const cookieHeader = request.headers.get("cookie");
        const token = getSessionTokenFromCookie(cookieHeader);

        if (token) {
          await deleteSession(token);
        }

        return Response.json(
          { success: true },
          {
            status: 200,
            headers: {
              "Set-Cookie": createClearSessionCookie(),
            },
          }
        );
      },
    },
  },
});

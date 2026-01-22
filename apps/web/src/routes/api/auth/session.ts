import { createFileRoute } from '@tanstack/react-router';
import { getUserFromSession, getSessionTokenFromCookie, extendSession } from '~/lib/session';

// Extend session if it's been more than 1 day since last activity
const SESSION_EXTENSION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

// Track last extension time to avoid extending on every request
const lastExtensionTimes = new Map<string, number>();

/**
 * Get current session/user info.
 * Returns the authenticated user or null if not logged in.
 * Also extends the session if it hasn't been extended recently.
 */
export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cookieHeader = request.headers.get('cookie');
        const token = getSessionTokenFromCookie(cookieHeader);

        if (!token) {
          return Response.json({ user: null });
        }

        const user = await getUserFromSession(token);

        if (!user) {
          return Response.json({ user: null });
        }

        // Extend session if needed (sliding window)
        const lastExtension = lastExtensionTimes.get(token) || 0;
        const now = Date.now();
        if (now - lastExtension > SESSION_EXTENSION_INTERVAL_MS) {
          // Fire and forget - don't block the response
          extendSession(token).catch((err) => console.error('Failed to extend session:', err));
          lastExtensionTimes.set(token, now);

          // Clean up old entries to prevent memory leak
          if (lastExtensionTimes.size > 10000) {
            const entries = [...lastExtensionTimes.entries()];
            entries
              .sort((a, b) => a[1] - b[1])
              .slice(0, 5000)
              .forEach(([key]) => lastExtensionTimes.delete(key));
          }
        }

        return Response.json({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        });
      },
    },
  },
});

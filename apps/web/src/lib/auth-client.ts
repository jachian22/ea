/**
 * Simple auth client for Google-only authentication.
 *
 * This replaces Better Auth with a minimal implementation that:
 * - Provides useSession() hook for React components
 * - Provides getSession() for route guards
 * - Provides signOut() function
 * - Redirects to Google OAuth for sign-in
 */

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";

type User = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

type SessionData = {
  user: User | null;
};

// Global session state management
let sessionCache: SessionData | null = null;
const sessionListeners: Set<() => void> = new Set();

// Promise-based fetch deduplication (instead of polling)
let fetchPromise: Promise<SessionData> | null = null;

function notifyListeners() {
  sessionListeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

function getSnapshot(): SessionData | null {
  return sessionCache;
}

/**
 * Fetches the session from the server.
 * Uses Promise deduplication to prevent concurrent fetches.
 */
async function fetchSession(): Promise<SessionData> {
  // If a fetch is already in progress, return the existing promise
  if (fetchPromise) {
    return fetchPromise;
  }

  // Create a new fetch promise
  fetchPromise = (async (): Promise<SessionData> => {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
      });

      let result: SessionData;
      if (!response.ok) {
        result = { user: null };
      } else {
        result = await response.json();
      }

      sessionCache = result;
      notifyListeners();
      return result;
    } catch (error) {
      console.error("Failed to fetch session:", error);
      const result: SessionData = { user: null };
      sessionCache = result;
      notifyListeners();
      return result;
    } finally {
      // Clear the promise so future calls will make a new request
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * React hook to get the current session.
 * Automatically fetches and caches the session.
 */
export function useSession() {
  // Keep hooks in consistent order - useSyncExternalStore first
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null // Server snapshot - always null during SSR
  );

  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    // Fetch session on mount if not cached
    if (sessionCache === null) {
      setIsPending(true);
      fetchSession().finally(() => setIsPending(false));
    } else {
      setIsPending(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    sessionCache = null;
    setIsPending(true);
    await fetchSession();
    setIsPending(false);
  }, []);

  return {
    data: session,
    isPending: isPending || session === null,
    refetch,
  };
}

/**
 * Get the current session (for use in route guards).
 * Returns the cached session if available, otherwise fetches it.
 */
export async function getSession(): Promise<SessionData | null> {
  if (sessionCache !== null) {
    return sessionCache;
  }
  return fetchSession();
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
  } catch (error) {
    console.error("Sign out error:", error);
  }

  // Clear the session cache
  sessionCache = { user: null };
  notifyListeners();
}

/**
 * Initiate Google sign-in by redirecting to the OAuth endpoint.
 */
export function signInWithGoogle(redirectUrl?: string): void {
  const url = new URL("/api/auth/google", window.location.origin);
  if (redirectUrl) {
    url.searchParams.set("redirect", redirectUrl);
  }
  window.location.href = url.toString();
}

/**
 * Clear the session cache (useful after sign-out).
 */
export function clearSessionCache(): void {
  sessionCache = null;
  notifyListeners();
}

// Export a compatible authClient object for easier migration
export const authClient = {
  useSession,
  getSession,
  signOut,
  signIn: {
    social: ({ provider }: { provider: string }) => {
      if (provider === "google") {
        signInWithGoogle();
      }
    },
  },
};

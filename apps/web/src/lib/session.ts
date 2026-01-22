/**
 * Simple cookie-based session management for Google-only auth.
 *
 * Sessions are stored in the database and referenced by a secure token in a cookie.
 * Session tokens are hashed before storage for security.
 */

import { database } from '~/db';
import { session, user } from '~/db/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'ea_session';
const SESSION_DURATION_DAYS = 30;

/**
 * Hashes a session token using SHA-256.
 * The hashed token is stored in the database, not the raw token.
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new session for a user.
 * The raw token is returned for the cookie; a hashed version is stored in the database.
 * @returns The session token to store in a cookie
 */
export async function createSession(userId: string): Promise<string> {
  const token = nanoid(32);
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await database.insert(session).values({
    id: nanoid(),
    userId,
    token: tokenHash, // Store hashed token, not raw
    expiresAt,
    createdAt: now,
    updatedAt: now,
  });

  return token; // Return raw token for cookie
}

/**
 * Validates a session token and returns the user ID if valid.
 * The token is hashed before comparing against the database.
 * @returns The user ID or null if session is invalid/expired
 */
export async function validateSession(token: string): Promise<string | null> {
  if (!token) return null;

  const tokenHash = hashToken(token);

  const result = await database
    .select({ userId: session.userId })
    .from(session)
    .where(and(eq(session.token, tokenHash), gt(session.expiresAt, new Date())))
    .limit(1);

  return result[0]?.userId ?? null;
}

/**
 * Gets the full user object from a session token.
 * The token is hashed before comparing against the database.
 */
export async function getUserFromSession(token: string) {
  if (!token) return null;

  const tokenHash = hashToken(token);

  const result = await database
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    })
    .from(session)
    .innerJoin(user, eq(session.userId, user.id))
    .where(and(eq(session.token, tokenHash), gt(session.expiresAt, new Date())))
    .limit(1);

  return result[0] ?? null;
}

/**
 * Deletes a session (logout).
 * The token is hashed before comparing against the database.
 */
export async function deleteSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await database.delete(session).where(eq(session.token, tokenHash));
}

/**
 * Deletes all sessions for a user.
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await database.delete(session).where(eq(session.userId, userId));
}

/**
 * Extends a session's expiry time.
 * The token is hashed before comparing against the database.
 */
export async function extendSession(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await database
    .update(session)
    .set({ expiresAt, updatedAt: new Date() })
    .where(eq(session.token, tokenHash));
}

/**
 * Creates the session cookie header value.
 * Includes Secure flag in production to prevent transmission over HTTP.
 */
export function createSessionCookie(token: string): string {
  const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60;
  const isProduction = process.env.NODE_ENV === 'production';
  const securePart = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=${maxAge}`;
}

/**
 * Creates a cookie header to clear the session.
 * Includes Secure flag in production.
 */
export function createClearSessionCookie(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const securePart = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax${securePart}; Max-Age=0`;
}

/**
 * Extracts the session token from a cookie header.
 */
export function getSessionTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) return null;

  return sessionCookie.slice(SESSION_COOKIE_NAME.length + 1) || null;
}

/**
 * Deletes all expired sessions from the database.
 * This should be called periodically (e.g., via a cron job) to prevent table bloat.
 * @returns The number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await database.delete(session).where(lt(session.expiresAt, new Date()));

  // Drizzle returns the deleted rows count in different ways depending on driver
  // This is a safe way to report cleanup
  return (result as { rowCount?: number }).rowCount ?? 0;
}

export { SESSION_COOKIE_NAME };

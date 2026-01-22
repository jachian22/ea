import { createMiddleware } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { validateSession, getSessionTokenFromCookie } from '~/lib/session';
import { isUserAdmin } from '~/data-access/users';

async function getAuthenticatedUserId(): Promise<string> {
  const request = getRequest();

  if (!request?.headers) {
    throw new Error('No headers');
  }

  const cookieHeader = request.headers.get('cookie');
  const token = getSessionTokenFromCookie(cookieHeader);

  if (!token) {
    throw new Error('No session');
  }

  const userId = await validateSession(token);

  if (!userId) {
    throw new Error('Invalid or expired session');
  }

  return userId;
}

export const authenticatedMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const userId = await getAuthenticatedUserId();

  return next({
    context: { userId },
  });
});

export const assertAdminMiddleware = createMiddleware({
  type: 'function',
}).server(async ({ next }) => {
  const userId = await getAuthenticatedUserId();

  const adminCheck = await isUserAdmin(userId);
  if (!adminCheck) {
    throw new Error('Unauthorized: Only admins can perform this action');
  }

  return next({
    context: { userId },
  });
});

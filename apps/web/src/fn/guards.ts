import { redirect } from '@tanstack/react-router';
import { validateSession, getSessionTokenFromCookie } from '~/lib/session';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';

export const assertAuthenticatedFn = createServerFn({ method: 'GET' }).handler(async () => {
  const headers = getRequest().headers;
  const cookieHeader = headers.get('cookie');
  const token = getSessionTokenFromCookie(cookieHeader);

  if (!token) {
    throw redirect({ to: '/unauthenticated' });
  }

  const userId = await validateSession(token);
  if (!userId) {
    throw redirect({ to: '/unauthenticated' });
  }
});

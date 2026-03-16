import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionToken } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies, locals }) => {
  const cookieToken = getSessionToken(cookies);
  
  return json({
    hasLocalsSessionToken: !!locals.sessionToken,
    hasCookieSessionToken: !!cookieToken,
    cookieNames: cookies.getAll().map(c => c.name),
    env: {
      nodeEnv: process.env.NODE_ENV,
      authCookieSecure: process.env.AUTH_COOKIE_SECURE,
      authCookieSameSite: process.env.AUTH_COOKIE_SAME_SITE,
    }
  });
};

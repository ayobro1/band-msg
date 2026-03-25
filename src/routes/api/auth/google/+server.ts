import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createGoogleOAuthState, setGoogleOAuthStateCookie } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`;
  
  if (!GOOGLE_CLIENT_ID) {
    console.error('ERROR: GOOGLE_CLIENT_ID is not set');
    return new Response(JSON.stringify({ error: 'Google OAuth not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const state = createGoogleOAuthState();
  setGoogleOAuthStateCookie(cookies, state);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  throw redirect(302, authUrl);
};

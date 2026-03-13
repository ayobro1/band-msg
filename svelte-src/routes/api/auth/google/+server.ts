import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/auth/google/callback';

export const GET: RequestHandler = async () => {
  if (!GOOGLE_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'Google OAuth not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  });

  throw redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};

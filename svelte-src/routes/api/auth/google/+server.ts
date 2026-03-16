import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/auth/google/callback';

export const GET: RequestHandler = async () => {
  console.log('=== Google OAuth Initiation ===');
  console.log('GOOGLE_CLIENT_ID exists:', !!GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_ID length:', GOOGLE_CLIENT_ID?.length);
  console.log('GOOGLE_REDIRECT_URI:', GOOGLE_REDIRECT_URI);
  
  if (!GOOGLE_CLIENT_ID) {
    console.error('ERROR: GOOGLE_CLIENT_ID is not set');
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

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('Redirecting to Google OAuth URL');
  console.log('Auth URL (first 100 chars):', authUrl.substring(0, 100));

  throw redirect(302, authUrl);
};

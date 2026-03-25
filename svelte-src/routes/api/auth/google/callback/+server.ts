import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSqlClient } from '$lib/server/db';
import {
  createSessionToken,
  setSessionCookie,
  expiresAtMs,
  getAuthBridgeSecret,
  getRequestUserAgentHash
} from '$lib/server/auth';
import { api } from "../../../../../../convex/_generated/api";
import crypto from 'node:crypto';
import { getConvexHttpClient } from "$lib/server/convex";
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ url, cookies, request }) => {
  const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET || '';
  const GOOGLE_REDIRECT_URI = env.GOOGLE_REDIRECT_URI || `${url.origin}/api/auth/google/callback`;
  
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    console.error('OAuth error or no code:', error);
    throw redirect(302, '/?error=google_auth_failed');
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials');
    throw redirect(302, '/?error=google_not_configured');
  }

  try {
    const convex = await getConvexHttpClient();
    const sql = getSqlClient();

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();

    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const googleUser = await userInfoResponse.json();
    if (googleUser.verified_email !== true) {
      throw new Error('Google account email is not verified');
    }

    // Check SQL for existing user
    const existingUsers = (await sql`
      SELECT * FROM users 
      WHERE google_id = ${googleUser.id} OR LOWER(username) = LOWER(${googleUser.email})
      LIMIT 1
    `) as any[];

    let user;
    
    if (existingUsers.length > 0) {
      user = existingUsers[0];
      
      // Update Google ID if not set
      if (!user.google_id) {
        await sql`
          UPDATE users 
          SET google_id = ${googleUser.id}
          WHERE id = ${user.id}
        `;
        user.google_id = googleUser.id;
      }
    } else {
      // Create new user with temporary username
      const userId = crypto.randomUUID();
      const now = Date.now();
      const tempUsername = `user_${googleUser.id.substring(0, 8)}`;
      
      await sql`
        INSERT INTO users (id, username, google_id, role, status, needs_username_setup, created_at)
        VALUES (${userId}, ${tempUsername}, ${googleUser.id}, 'member', 'pending', true, ${now})
      `;
      
      user = {
        id: userId,
        username: tempUsername,
        google_id: googleUser.id,
        role: 'member',
        status: 'pending',
        needs_username_setup: true
      };
    }

    // Create session
    const sessionToken = createSessionToken();
    const expiresAt = expiresAtMs();
    const userAgentHash = getRequestUserAgentHash(request);
    const serverSecret = getAuthBridgeSecret();
    
    try {
      if (user.needs_username_setup) {
        await convex.mutation(api.auth.syncExternalUser, {
          username: user.username,
          externalId: user.google_id || '',
          role: user.role,
          status: user.status,
          needsUsernameSetup: true,
          sessionToken,
          userAgentHash,
          expiresAt,
          serverSecret
        });
      } else {
        await convex.mutation(api.auth.syncExternalSession, {
          username: user.username,
          externalId: user.google_id || '',
          sessionToken,
          userAgentHash,
          expiresAt,
          serverSecret
        });
      }
    } catch (syncError) {
      console.error('Convex sync failed:', syncError);
      throw new Error('Failed to synchronize authenticated session');
    }

    await sql`
      INSERT INTO sessions (token, user_id, expires_at, created_at)
      VALUES (${sessionToken}, ${user.id}, ${expiresAt}, ${Date.now()})
    `;
    
    setSessionCookie(cookies, sessionToken);
    
    // Redirect to home - the page will show PendingSetup if user is pending
    throw redirect(302, '/');
  } catch (error) {
    console.error('Google OAuth Error:', error);
    throw redirect(302, '/?error=google_auth_error');
  }
};

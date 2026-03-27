import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSqlClient } from '$lib/server/db';
import { lucia } from '$lib/server/auth';
import crypto from 'node:crypto';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/auth/google/callback';

const sql = getSqlClient();

export const GET: RequestHandler = async ({ url, cookies }) => {
  console.log('=== Google OAuth Callback ===');
  
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  console.log('Callback received - code exists:', !!code);
  console.log('Callback received - error:', error);

  if (error || !code) {
    console.error('OAuth error or no code:', error);
    throw redirect(302, '/?error=google_auth_failed');
  }

  console.log('GOOGLE_CLIENT_ID exists:', !!GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET exists:', !!GOOGLE_CLIENT_SECRET);
  console.log('GOOGLE_REDIRECT_URI:', GOOGLE_REDIRECT_URI);

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials');
    throw redirect(302, '/?error=google_not_configured');
  }

  try {
    console.log('Exchanging code for tokens...');
    
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

    console.log('Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      throw new Error('Failed to exchange code for tokens');
    }

    const tokens = await tokenResponse.json();
    console.log('Tokens received, access_token exists:', !!tokens.access_token);

    // Get user info
    console.log('Fetching user info...');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    console.log('User info response status:', userInfoResponse.status);

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.text();
      console.error('User info fetch failed:', errorData);
      throw new Error('Failed to get user info');
    }

    const googleUser = await userInfoResponse.json();
    console.log('Google user received:', {
      id: googleUser.id,
      email: googleUser.email,
      name: googleUser.name
    });

    // Check if user exists by Google ID or email
    console.log('Checking if user exists...');
    const existingUsers = await sql`
      SELECT * FROM users 
      WHERE google_id = ${googleUser.id} OR username = ${googleUser.email}
      LIMIT 1
    `;

    console.log('Existing users found:', existingUsers.length);

    let user;
    
    if (existingUsers.length > 0) {
      user = existingUsers[0];
      console.log('Existing user found:', user.id);
      
      // Update Google ID if not set
      if (!user.google_id) {
        console.log('Linking Google ID to existing user...');
        await sql`
          UPDATE users 
          SET google_id = ${googleUser.id}
          WHERE id = ${user.id}
        `;
        user.google_id = googleUser.id;
      }
    } else {
      // Create new user with temporary username
      console.log('Creating new user...');
      const userId = crypto.randomUUID();
      const now = Date.now();
      const tempUsername = `user_${googleUser.id.substring(0, 8)}`;
      
      console.log('New user details:', {
        userId,
        tempUsername,
        googleId: googleUser.id
      });
      
      await sql`
        INSERT INTO users (id, username, google_id, role, status, needs_username_setup, created_at)
        VALUES (${userId}, ${tempUsername}, ${googleUser.id}, 'member', 'approved', true, ${now})
      `;
      
      user = {
        id: userId,
        username: tempUsername,
        google_id: googleUser.id,
        role: 'member',
        status: 'approved',
        needs_username_setup: true
      };
      
      console.log('New user created successfully');
    }

    // Create session
    console.log('Creating session...');
    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    
    console.log('Session created:', session.id);
    
    cookies.set(sessionCookie.name, sessionCookie.value, {
      path: '.',
      ...sessionCookie.attributes
    });

    console.log('Session cookie set, redirecting to home');
    throw redirect(302, '/');
  } catch (error) {
    console.error('=== Google OAuth Error ===');
    console.error('Error type:', error?.constructor?.name);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw redirect(302, '/?error=google_auth_error');
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthBridgeSecret } from '$lib/server/auth';
import { getSqlClient, getUserBySession } from '$lib/server/db';
import { getSessionBinding } from '$lib/server/request';
import { getConvexHttpClient } from "$lib/server/convex";
import { api } from "../../../../../convex/_generated/api";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

export const POST: RequestHandler = async ({ request, locals }) => {
  const sql = getSqlClient();
  const convex = await getConvexHttpClient();
  const sessionBinding = getSessionBinding(request);
  const sessionToken = (locals as any).sessionToken;
  if (!sessionToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getUserBySession(sessionToken, sessionBinding);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username, displayName } = await request.json();

    if (!username || typeof username !== 'string') {
      return json({ error: 'Username is required' }, { status: 400 });
    }

    const trimmedUsername = username.trim().toLowerCase();

    if (!USERNAME_PATTERN.test(trimmedUsername)) {
      return json({ 
        error: 'Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores' 
      }, { status: 400 });
    }

    // Check if username is already taken
    const existingUsers = await sql`
      SELECT id FROM users 
      WHERE LOWER(username) = ${trimmedUsername} AND id != ${user.id}
      LIMIT 1
    ` as any[];

    if (existingUsers.length > 0) {
      return json({ error: 'Username is already taken' }, { status: 400 });
    }

    const userRows = await sql`
      SELECT google_id
      FROM users
      WHERE id = ${user.id}
      LIMIT 1
    ` as any[];

    await convex.mutation(api.auth.syncExternalUser, {
      username: trimmedUsername,
      externalId: typeof userRows[0]?.google_id === 'string' ? userRows[0].google_id : '',
      role: user.role,
      status: user.status,
      needsUsernameSetup: false,
      sessionToken,
      userAgentHash: sessionBinding,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      serverSecret: getAuthBridgeSecret()
    });

    await sql`
      UPDATE users 
      SET username = ${trimmedUsername}, display_name = ${displayName?.trim()?.substring(0, 50) || null}, needs_username_setup = false
      WHERE id = ${user.id}
    `;

    return json({ success: true, username: trimmedUsername });
  } catch (error) {
    console.error('Error setting username:', error);
    return json({ error: 'Failed to set username' }, { status: 500 });
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSqlClient } from '$lib/server/db';

const sql = getSqlClient();

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

export const POST: RequestHandler = async ({ request, locals }) => {
  const session = locals.session;
  const user = locals.user;

  if (!session || !user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username } = await request.json();

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
    `;

    if (existingUsers.length > 0) {
      return json({ error: 'Username is already taken' }, { status: 400 });
    }

    // Update username and clear the setup flag
    await sql`
      UPDATE users 
      SET username = ${trimmedUsername}, needs_username_setup = false
      WHERE id = ${user.id}
    `;

    return json({ success: true, username: trimmedUsername });
  } catch (error) {
    console.error('Error setting username:', error);
    return json({ error: 'Failed to set username' }, { status: 500 });
  }
};

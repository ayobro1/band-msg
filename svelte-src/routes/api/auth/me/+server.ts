import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionUser } from '$lib/server/db';
import { getSessionToken } from '$lib/server/auth';

export const GET: RequestHandler = async ({ cookies }) => {
  const sessionToken = getSessionToken(cookies);

  if (!sessionToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = await getSessionUser(sessionToken);

  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  return json(user);
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRequestUserAgentHash, getSessionToken } from '$lib/server/auth';
import { api } from "../../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

export const GET: RequestHandler = async ({ cookies, locals, request }) => {
  const sessionToken = locals.sessionToken ?? getSessionToken(cookies);

  if (!sessionToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const convex = await getConvexHttpClient();
    const userAgentHash = getRequestUserAgentHash(request);
    // Read from Convex to get fresh user data (including updated status after approval)
    const user = await convex.query(api.auth.getUser, { sessionToken, userAgentHash });

    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    return json(user);
  } catch (error) {
    console.error('[/api/auth/me] Error fetching user from Convex:', error);
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
};

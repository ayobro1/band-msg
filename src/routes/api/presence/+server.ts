import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { consumeRateLimit } from '$lib/server/db';
import { getClientIp } from '$lib/server/request';
import { api } from '../../../../convex/_generated/api';
import { getConvexHttpClient } from '$lib/server/convex';

const PRESENCE_POST_IP_MAX_ATTEMPTS = 120;
const PRESENCE_POST_USER_MAX_ATTEMPTS = 30;
const PRESENCE_POST_WINDOW_MS = 60 * 1000;

export const POST: RequestHandler = async ({ request, locals }) => {
  const sessionToken = locals.sessionToken;
  
  if (!sessionToken) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { status } = await request.json();
    
    if (!['online', 'idle', 'dnd', 'offline'].includes(status)) {
      return json({ error: 'Invalid status' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const actorId =
      typeof locals.user?.id === 'string' && locals.user.id.length > 0
        ? locals.user.id
        : sessionToken;
    const ipLimit = await consumeRateLimit(
      `presence-post-ip:${ip}`,
      PRESENCE_POST_IP_MAX_ATTEMPTS,
      PRESENCE_POST_WINDOW_MS
    );
    const userLimit = await consumeRateLimit(
      `presence-post-user:${actorId}`,
      PRESENCE_POST_USER_MAX_ATTEMPTS,
      PRESENCE_POST_WINDOW_MS
    );

    if (!ipLimit.allowed || !userLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
      return json(
        { error: 'Too many presence updates, try again later' },
        {
          status: 429,
          headers:
            retryAfterMs > 0
              ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
              : undefined
        }
      );
    }

    const convex = await getConvexHttpClient();
    await convex.mutation(api.auth.updatePresence, {
      sessionToken,
      userAgentHash: locals.sessionBinding,
      status,
    });

    return json({ success: true });
  } catch (error) {
    console.error('Presence update error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

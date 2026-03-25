import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { api } from "../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";
import { consumeRateLimit } from '$lib/server/db';
import { getClientIp } from '$lib/server/request';

const REPORT_IP_MAX_ATTEMPTS = 5;
const REPORT_USER_MAX_ATTEMPTS = 3;
const REPORT_WINDOW_MS = 15 * 60 * 1000;
const REPORT_MESSAGE_MAX_LENGTH = 4000;

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const { message } = await request.json();

    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    if (!normalizedMessage) {
      return json({ error: 'Missing message' }, { status: 400 });
    }

    if (normalizedMessage.length > REPORT_MESSAGE_MAX_LENGTH) {
      return json({ error: 'Report is too long' }, { status: 400 });
    }

    if (!locals.sessionToken) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = getClientIp(request);
    const actorId =
      typeof locals.user?.id === 'string' && locals.user.id.length > 0
        ? locals.user.id
        : locals.sessionToken;
    const ipLimit = await consumeRateLimit(
      `report-ip:${ip}`,
      REPORT_IP_MAX_ATTEMPTS,
      REPORT_WINDOW_MS
    );
    const userLimit = await consumeRateLimit(
      `report-user:${actorId}`,
      REPORT_USER_MAX_ATTEMPTS,
      REPORT_WINDOW_MS
    );

    if (!ipLimit.allowed || !userLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
      return json(
        { error: 'Too many report submissions, try again later' },
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
    await convex.mutation(api.users.createReport, {
      sessionToken: locals.sessionToken,
      userAgentHash: locals.sessionBinding,
      message: normalizedMessage,
    });

    return json({ success: true });
  } catch (error) {
    console.error('[Reports API] Error:', error);
    return json({ error: 'Failed to submit report' }, { status: 500 });
  }
};

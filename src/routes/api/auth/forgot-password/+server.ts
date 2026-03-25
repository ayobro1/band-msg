import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { getAuthBridgeSecret, isPasswordResetEnabled } from '$lib/server/auth';
import { consumeRateLimit } from '$lib/server/db';
import { getClientIp } from '$lib/server/request';
import { api } from '../../../../../convex/_generated/api';
import { getConvexHttpClient } from '$lib/server/convex';

const RESET_REQUEST_IP_MAX_ATTEMPTS = 5;
const RESET_REQUEST_ACCOUNT_MAX_ATTEMPTS = 3;
const RESET_REQUEST_WINDOW_MS = 15 * 60 * 1000;

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isPasswordResetEnabled()) {
      return json({ error: 'Password reset is temporarily unavailable' }, { status: 503 });
    }

    const convex = await getConvexHttpClient();
    const body = await request.json().catch(() => null);
    const rawIdentifier =
      typeof body?.identifier === 'string'
        ? body.identifier
        : typeof body?.username === 'string'
          ? body.username
          : typeof body?.email === 'string'
            ? body.email
            : '';

    if (!rawIdentifier) {
      return json({ error: 'Username is required' }, { status: 400 });
    }

    const normalizedIdentifier = rawIdentifier.trim().toLowerCase();
    const ip = getClientIp(request);
    const ipLimit = await consumeRateLimit(
      `forgot-password-ip:${ip}`,
      RESET_REQUEST_IP_MAX_ATTEMPTS,
      RESET_REQUEST_WINDOW_MS
    );
    const accountLimit = await consumeRateLimit(
      `forgot-password-user:${normalizedIdentifier}`,
      RESET_REQUEST_ACCOUNT_MAX_ATTEMPTS,
      RESET_REQUEST_WINDOW_MS
    );

    if (!ipLimit.allowed || !accountLimit.allowed) {
      return json({ error: 'Too many password reset attempts, try again later' }, { status: 429 });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = Date.now() + 3600000; // 1 hour
    await convex.mutation(api.auth.createPasswordResetToken, {
      username: normalizedIdentifier,
      tokenHash: resetTokenHash,
      expiresAt,
      serverSecret: getAuthBridgeSecret()
    });

    return json({ 
      success: true,
      message: 'If an account exists with that username, a password reset link has been prepared.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

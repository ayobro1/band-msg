import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { getAuthBridgeSecret, hashPassword, isPasswordResetEnabled, isPasswordResetTokenFormat } from '$lib/server/auth';
import { consumeRateLimit } from '$lib/server/db';
import { getClientIp } from '$lib/server/request';
import { api } from '../../../../../convex/_generated/api';
import { getConvexHttpClient } from '$lib/server/convex';

const RESET_PASSWORD_IP_MAX_ATTEMPTS = 5;
const RESET_PASSWORD_TOKEN_MAX_ATTEMPTS = 5;
const RESET_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

export const POST: RequestHandler = async ({ request }) => {
  try {
    if (!isPasswordResetEnabled()) {
      return json({ error: 'Password reset is temporarily unavailable' }, { status: 503 });
    }

    const convex = await getConvexHttpClient();
    const serverSecret = getAuthBridgeSecret();
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!token || !password) {
      return json({ error: 'Token and password are required' }, { status: 400 });
    }

    if (!isPasswordResetTokenFormat(token)) {
      return json({ error: 'Token and password are required' }, { status: 400 });
    }

    if (password.length < 12 || password.length > 128) {
      return json({ error: 'Password must be between 12 and 128 characters' }, { status: 400 });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const ip = getClientIp(request);
    const ipLimit = await consumeRateLimit(
      `reset-password-ip:${ip}`,
      RESET_PASSWORD_IP_MAX_ATTEMPTS,
      RESET_PASSWORD_WINDOW_MS
    );
    const tokenLimit = await consumeRateLimit(
      `reset-password-token:${tokenHash}`,
      RESET_PASSWORD_TOKEN_MAX_ATTEMPTS,
      RESET_PASSWORD_WINDOW_MS
    );

    if (!ipLimit.allowed || !tokenLimit.allowed) {
      return json({ error: 'Too many password reset attempts, try again later' }, { status: 429 });
    }

    const validation = await convex.query(api.auth.validatePasswordResetToken, {
      tokenHash,
      serverSecret
    });

    if (!validation.valid) {
      return json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
    }

    const { salt, hash } = await hashPassword(password);
    await convex.mutation(api.auth.resetPasswordWithToken, {
      tokenHash,
      passwordHash: hash,
      passwordSalt: salt,
      serverSecret
    });

    return json({
      success: true,
      message: 'Your password has been reset. You can sign in now.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    const message = error instanceof Error ? error.message : 'Failed to reset password';
    const status =
      message === 'This reset link is invalid or has expired'
        ? 400
        : message === 'Password reset is temporarily unavailable'
          ? 503
          : 500;
    return json({ error: message }, { status });
  }
};

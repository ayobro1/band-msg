import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSqlClient } from '$lib/server/db';
import crypto from 'node:crypto';

const sql = getSqlClient();

// TODO: Configure email service (SendGrid, AWS SES, etc.)
// For now, this is a placeholder that logs the reset token
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check if user exists
    const users = await sql`
      SELECT id, username FROM users 
      WHERE username = ${normalizedEmail}
      LIMIT 1
    `;

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (users.length > 0) {
      const user = users[0];
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = Date.now() + 3600000; // 1 hour

      // Store reset token in database
      // TODO: Create password_reset_tokens table
      // For now, log the token (INSECURE - for development only)
      console.log('=== PASSWORD RESET REQUEST ===');
      console.log('User:', user.username);
      console.log('Reset Token:', resetToken);
      console.log('Reset Link:', `${process.env.PUBLIC_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}`);
      console.log('Expires:', new Date(expiresAt).toISOString());
      console.log('=============================');

      // TODO: Send email with reset link
      // await sendPasswordResetEmail(user.username, resetToken);
    }

    // Always return success (security best practice)
    return json({ 
      success: true,
      message: 'If an account exists with that email, a password reset link has been sent.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};

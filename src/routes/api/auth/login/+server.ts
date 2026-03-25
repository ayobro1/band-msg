import {
  createSessionToken,
  expiresAtMs,
  getAuthBridgeSecret,
  hashPassword,
  setSessionCookie
} from "$lib/server/auth";
import { clearRateLimit, consumeRateLimit } from "$lib/server/db";
import { delayMs, getClientIp, getSessionBinding } from "$lib/server/request";
import { api } from "../../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

const LOGIN_IP_MAX_ATTEMPTS = 30;
const LOGIN_ACCOUNT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_FAILURE_DELAY_MS = 450;

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request, cookies }: any) => {
  try {
    const convex = await getConvexHttpClient();
    const sessionBinding = getSessionBinding(request);
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || !password) {
      return toJson({ error: "username and password are required" }, 400);
    }

    const ip = getClientIp(request);
    const ipKey = `login-ip:${ip}`;
    const userKey = `login-user:${username.trim().toLowerCase()}`;

    const ipLimit = await consumeRateLimit(ipKey, LOGIN_IP_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
    if (!ipLimit.allowed) {
      return toJson({ error: "Too many login attempts, try again later" }, 429);
    }

    const userLimit = await consumeRateLimit(
      userKey,
      LOGIN_ACCOUNT_MAX_ATTEMPTS,
      RATE_LIMIT_WINDOW_MS
    );
    if (!userLimit.allowed) {
      return toJson({ error: "Too many login attempts, try again later" }, 429);
    }

    // Get salt from Convex
    const bridgeSecret = getAuthBridgeSecret();
    const salt = await convex.query(api.auth.getLoginSalt, { username, serverSecret: bridgeSecret });
    if (!salt) {
      await delayMs(LOGIN_FAILURE_DELAY_MS);
      return toJson({ error: "Invalid username or password" }, 401);
    }

    const hashed = await hashPassword(password, salt);
    const sessionToken = createSessionToken();

    try {
      const user = await convex.mutation(api.auth.login, {
        username,
        passwordHash: hashed.hash,
        sessionToken,
        userAgentHash: sessionBinding,
        expiresAt: expiresAtMs(),
        serverSecret: bridgeSecret
      });

      // BLOCK PENDING USERS FROM LOGGING IN
      if (user.status === 'pending') {
        await delayMs(LOGIN_FAILURE_DELAY_MS);
        return toJson({ error: "Your account is pending admin approval. You will be able to log in once approved." }, 401);
      }

      await clearRateLimit(ipKey);
      await clearRateLimit(userKey);

      setSessionCookie(cookies, sessionToken);
      
      // Sync to SQL so /api/auth/me works
      try {
        const { getSqlClient } = await import('$lib/server/db');
        const sql = getSqlClient();
        
        // Find or create user in SQL
        let sqlUser = await sql`SELECT id FROM users WHERE username = ${user.username} LIMIT 1`;
        let sqlUserId = sqlUser[0]?.id;
        
        if (!sqlUserId) {
          const crypto = await import('node:crypto');
          sqlUserId = crypto.randomUUID();
          await sql`
            INSERT INTO users (id, username, role, status, created_at)
            VALUES (${sqlUserId}, ${user.username}, ${user.role}, ${user.status}, ${Date.now()})
          `;
        } else {
          // Update status/role if needed
          await sql`
            UPDATE users 
            SET role = ${user.role}, status = ${user.status}
            WHERE id = ${sqlUserId}
          `;
        }
        
        // Create session in SQL
        await sql`
          INSERT INTO sessions (token, user_id, user_agent_hash, expires_at, created_at)
          VALUES (${sessionToken}, ${sqlUserId}, ${sessionBinding}, ${expiresAtMs()}, ${Date.now()})
        `;
      } catch (sqlError) {
        console.error('[Login] SQL sync failed:', sqlError);
      }
      
      return toJson(user);
    } catch (error: any) {
      await delayMs(LOGIN_FAILURE_DELAY_MS);
      if (error?.message === "Too many login attempts, try again later") {
        return toJson({ error: error.message }, 429);
      }

      return toJson({ error: error.message || "Invalid username or password" }, 401);
    }
  } catch (error: any) {
    const expose = process.env.AUTH_DEBUG === "true" && process.env.NODE_ENV !== "production";
    return toJson(
      {
        error: expose
          ? `Login failed: ${error?.message ?? "unknown server error"}`
          : "Login failed due to server configuration"
      },
      500
    );
  }
};

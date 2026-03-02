import { getConvexClient } from "$lib/server/convex";
import { hashPassword } from "$lib/server/auth";
import { getClientIp } from "$lib/server/request";

const REGISTER_MAX_ATTEMPTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request }: any) => {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || password.length < 12 || password.length > 128) {
    return toJson({ error: "username and strong password are required" }, 400);
  }

  const { salt, hash } = await hashPassword(password);
  const convex = getConvexClient();
  const ip = getClientIp(request);
  const key = `register:${ip}:${username.trim().toLowerCase()}`;

  const limit = await convex.mutation("auth:consumeRateLimit" as any, {
    key,
    maxAttempts: REGISTER_MAX_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS
  });

  if (!limit.allowed) {
    return toJson({ error: "Too many registration attempts, try again later" }, 429);
  }

  const result = await convex.mutation("auth:register" as any, {
    username,
    passwordHash: hash,
    passwordSalt: salt
  });

  if (!result.ok) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson(result.user, 201);
};

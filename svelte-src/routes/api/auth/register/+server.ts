import { hashPassword } from "$lib/server/auth";
import { getClientIp } from "$lib/server/request";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const CONVEX_URL = process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL || "";
const convex = new ConvexHttpClient(CONVEX_URL);

const REGISTER_MAX_ATTEMPTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Simple in-memory rate limiting for registration
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function consumeRateLimit(key: string): { allowed: boolean } {
  const now = Date.now();
  const limit = rateLimits.get(key);

  if (!limit || limit.resetAt < now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (limit.count >= REGISTER_MAX_ATTEMPTS) {
    return { allowed: false };
  }

  limit.count++;
  return { allowed: true };
}

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request }: any) => {
  try {
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!username || password.length < 12 || password.length > 128) {
      return toJson({ error: "username and strong password are required" }, 400);
    }

    const { salt, hash } = await hashPassword(password);
    const ip = getClientIp(request);
    const key = `register:${ip}:${username.trim().toLowerCase()}`;

    const limit = consumeRateLimit(key);

    if (!limit.allowed) {
      return toJson({ error: "Too many registration attempts, try again later" }, 429);
    }

    try {
      const result = await convex.mutation(api.auth.register, {
        username,
        passwordHash: hash,
        passwordSalt: salt
      });

      return toJson(result, 201);
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        return toJson({ error: "Username already exists" }, 409);
      }
      throw error;
    }
  } catch (error: any) {
    const expose = process.env.AUTH_DEBUG === "true";
    return toJson(
      {
        error: expose
          ? `Registration failed: ${error?.message ?? "unknown server error"}`
          : "Registration failed due to server configuration"
      },
      500
    );
  }
};

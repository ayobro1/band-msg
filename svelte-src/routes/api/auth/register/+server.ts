import {
  getAuthBridgeSecret,
  hashPassword,
  isRegistrationEnabled
} from "$lib/server/auth";
import { consumeRateLimit } from "$lib/server/db";
import { getClientIp } from "$lib/server/request";
import { api } from "../../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

const REGISTER_USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;
const REGISTER_IP_MAX_ATTEMPTS = 4;
const REGISTER_IP_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_ACCOUNT_MAX_ATTEMPTS = 2;
const REGISTER_ACCOUNT_WINDOW_MS = 60 * 60 * 1000;

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request }: any) => {
  try {
    if (!isRegistrationEnabled()) {
      return toJson({ error: "Registration is temporarily disabled" }, 503);
    }

    const convex = await getConvexHttpClient();
    const body = await request.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const normalizedUsername = username.trim().toLowerCase();

    if (
      !REGISTER_USERNAME_PATTERN.test(normalizedUsername) ||
      password.length < 12 ||
      password.length > 128
    ) {
      return toJson({ error: "username and strong password are required" }, 400);
    }

    const { salt, hash } = await hashPassword(password);
    const ip = getClientIp(request);
    const ipLimit = await consumeRateLimit(
      `register-ip:${ip}`,
      REGISTER_IP_MAX_ATTEMPTS,
      REGISTER_IP_WINDOW_MS
    );
    const accountLimit = await consumeRateLimit(
      `register-user:${normalizedUsername}`,
      REGISTER_ACCOUNT_MAX_ATTEMPTS,
      REGISTER_ACCOUNT_WINDOW_MS
    );

    if (!ipLimit.allowed || !accountLimit.allowed) {
      return toJson({ error: "Too many registration attempts, try again later" }, 429);
    }

    try {
      const result = await convex.mutation(api.auth.register, {
        username,
        passwordHash: hash,
        passwordSalt: salt,
        serverSecret: getAuthBridgeSecret()
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

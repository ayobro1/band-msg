import { createSessionToken, expiresAtMs, hashPassword, setSessionCookie } from "$lib/server/auth";
import { clearRateLimit, consumeRateLimit, getLoginSalt, loginUser } from "$lib/server/db";
import { delayMs, getClientIp } from "$lib/server/request";

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

  const userLimit = await consumeRateLimit(userKey, LOGIN_ACCOUNT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS);
  if (!userLimit.allowed) {
    return toJson({ error: "Too many login attempts, try again later" }, 429);
  }

  const salt = await getLoginSalt(username);
  if (!salt) {
    await delayMs(LOGIN_FAILURE_DELAY_MS);
    return toJson({ error: "Invalid username or password" }, 401);
  }

  const hashed = await hashPassword(password, salt);
  const sessionToken = createSessionToken();

  const result = await loginUser({
    username,
    passwordHash: hashed.hash,
    sessionToken,
    expiresAt: expiresAtMs()
  });

  if (!result.ok) {
    await delayMs(LOGIN_FAILURE_DELAY_MS);
    return toJson({ error: result.error }, result.code ?? 401);
  }

  await clearRateLimit(ipKey);
  await clearRateLimit(userKey);

  setSessionCookie(cookies, sessionToken);
  return toJson(result.value);
};

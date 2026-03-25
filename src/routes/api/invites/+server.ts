import { json } from "@sveltejs/kit";
import { consumeRateLimit, createInvite, useInvite } from "$lib/server/db";
import { getClientIp } from "$lib/server/request";

const INVITE_CREATE_IP_MAX_ATTEMPTS = 20;
const INVITE_CREATE_USER_MAX_ATTEMPTS = 10;
const INVITE_CREATE_WINDOW_MS = 15 * 60 * 1000;

const INVITE_USE_IP_MAX_ATTEMPTS = 30;
const INVITE_USE_USER_MAX_ATTEMPTS = 15;
const INVITE_USE_WINDOW_MS = 15 * 60 * 1000;

export async function POST({ request, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, serverId, code, maxUses, expiresInMs } = body;
  const ip = getClientIp(request);
  const actorId =
    typeof locals.user?.id === "string" && locals.user.id.length > 0
      ? locals.user.id
      : sessionToken;

  if (action === "use") {
    if (!code || typeof code !== "string") {
      return json({ error: "Missing invite code" }, { status: 400 });
    }

    const ipLimit = await consumeRateLimit(
      `invite-use-ip:${ip}`,
      INVITE_USE_IP_MAX_ATTEMPTS,
      INVITE_USE_WINDOW_MS
    );
    const userLimit = await consumeRateLimit(
      `invite-use-user:${actorId}`,
      INVITE_USE_USER_MAX_ATTEMPTS,
      INVITE_USE_WINDOW_MS
    );

    if (!ipLimit.allowed || !userLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
      return json(
        { error: "Too many invite redemption attempts, try again later" },
        {
          status: 429,
          headers:
            retryAfterMs > 0
              ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
              : undefined
        }
      );
    }

    const result = await useInvite({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      code
    });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  } else {
    if (!serverId || typeof serverId !== "string") {
      return json({ error: "Missing serverId" }, { status: 400 });
    }

    const ipLimit = await consumeRateLimit(
      `invite-create-ip:${ip}`,
      INVITE_CREATE_IP_MAX_ATTEMPTS,
      INVITE_CREATE_WINDOW_MS
    );
    const userLimit = await consumeRateLimit(
      `invite-create-user:${actorId}`,
      INVITE_CREATE_USER_MAX_ATTEMPTS,
      INVITE_CREATE_WINDOW_MS
    );

    if (!ipLimit.allowed || !userLimit.allowed) {
      const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
      return json(
        { error: "Too many invite creation attempts, try again later" },
        {
          status: 429,
          headers:
            retryAfterMs > 0
              ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
              : undefined
        }
      );
    }

    const result = await createInvite({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      serverId,
      maxUses,
      expiresInMs
    });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  }
};

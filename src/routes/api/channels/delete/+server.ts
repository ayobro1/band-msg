import { consumeRateLimit, deleteChannel } from "$lib/server/db";
import { getClientIp } from "$lib/server/request";

const CHANNEL_DELETE_IP_MAX_ATTEMPTS = 10;
const CHANNEL_DELETE_USER_MAX_ATTEMPTS = 5;
const CHANNEL_DELETE_WINDOW_MS = 15 * 60 * 1000;

const toJson = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });

export const POST = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  if (!channelId) {
    return toJson({ error: "channelId is required" }, 400);
  }

  const ip = getClientIp(request);
  const actorId =
    typeof locals.user?.id === "string" && locals.user.id.length > 0
      ? locals.user.id
      : locals.sessionToken;
  const ipLimit = await consumeRateLimit(
    `channel-delete-ip:${ip}`,
    CHANNEL_DELETE_IP_MAX_ATTEMPTS,
    CHANNEL_DELETE_WINDOW_MS
  );
  const userLimit = await consumeRateLimit(
    `channel-delete-user:${actorId}`,
    CHANNEL_DELETE_USER_MAX_ATTEMPTS,
    CHANNEL_DELETE_WINDOW_MS
  );

  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
    return toJson(
      { error: "Too many channel deletion attempts, try again later" },
      429,
      retryAfterMs > 0 ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : undefined
    );
  }

  const result = await deleteChannel({
    sessionToken: locals.sessionToken,
    userAgentHash: locals.sessionBinding,
    channelId
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 403);
  }

  return toJson({ ok: true });
};

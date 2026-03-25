import { consumeRateLimit, createChannel, listChannels } from "$lib/server/db";
import { getClientIp } from "$lib/server/request";

const CHANNEL_CREATE_IP_MAX_ATTEMPTS = 10;
const CHANNEL_CREATE_USER_MAX_ATTEMPTS = 3;
const CHANNEL_CREATE_WINDOW_MS = 15 * 60 * 1000;

const toJson = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const result = await listChannels(locals.sessionToken, locals.sessionBinding);

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson(result.value);
};

export const POST = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  // All authenticated users can create channels
  // The sessionToken already validates the user is authenticated

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const description = typeof body?.description === "string" ? body.description : "";
  const isPrivate = typeof body?.isPrivate === "boolean" ? body.isPrivate : false;
  const memberIds = Array.isArray(body?.memberIds) ? body.memberIds : [];

  if (!name) {
    return toJson({ error: "name is required" }, 400);
  }

  const ip = getClientIp(request);
  const actorId =
    typeof locals.user?.id === "string" && locals.user.id.length > 0
      ? locals.user.id
      : locals.sessionToken;
  const ipLimit = await consumeRateLimit(
    `channel-create-ip:${ip}`,
    CHANNEL_CREATE_IP_MAX_ATTEMPTS,
    CHANNEL_CREATE_WINDOW_MS
  );
  const userLimit = await consumeRateLimit(
    `channel-create-user:${actorId}`,
    CHANNEL_CREATE_USER_MAX_ATTEMPTS,
    CHANNEL_CREATE_WINDOW_MS
  );

  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
    return toJson(
      { error: "Too many channel creation attempts, try again later" },
      429,
      retryAfterMs > 0 ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : undefined
    );
  }

  const result = await createChannel({
    sessionToken: locals.sessionToken,
    userAgentHash: locals.sessionBinding,
    name,
    description,
    isPrivate,
    memberIds
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ id: result.value.channelId }, 201);
};

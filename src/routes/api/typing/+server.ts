import { json } from "@sveltejs/kit";
import {
  consumeRateLimit,
  getTypingUsers,
  getUserBySession,
  startTyping,
  stopTyping
} from "$lib/server/db";
import { getClientIp } from "$lib/server/request";
import { triggerTyping } from "$lib/server/pusher";

const TYPING_POST_IP_MAX_ATTEMPTS = 500;
const TYPING_POST_USER_MAX_ATTEMPTS = 180;
const TYPING_POST_WINDOW_MS = 10 * 1000;

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

  const { channelId, action } = body;

  if (!channelId || typeof channelId !== "string") {
    return json({ error: "Missing channelId" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const actorId =
    typeof locals.user?.id === "string" && locals.user.id.length > 0
      ? locals.user.id
      : sessionToken;
  const ipLimit = await consumeRateLimit(
    `typing-post-ip:${ip}`,
    TYPING_POST_IP_MAX_ATTEMPTS,
    TYPING_POST_WINDOW_MS
  );
  const userLimit = await consumeRateLimit(
    `typing-post-user:${actorId}`,
    TYPING_POST_USER_MAX_ATTEMPTS,
    TYPING_POST_WINDOW_MS
  );

  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
    return json(
      { error: "Too many typing updates, try again later" },
      {
        status: 429,
        headers:
          retryAfterMs > 0
            ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) }
            : undefined
      }
    );
  }

  // Get user info for Pusher event
  const user = await getUserBySession(sessionToken, locals.sessionBinding);
  if (!user) {
    return json({ error: "User not found" }, { status: 401 });
  }

  if (action === "stop") {
    const result = await stopTyping({ sessionToken, userAgentHash: locals.sessionBinding, channelId });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Trigger Pusher event
    triggerTyping(channelId, user.username, false);
    
    return json(result.value);
  } else {
    const result = await startTyping({ sessionToken, userAgentHash: locals.sessionBinding, channelId });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Trigger Pusher event
    triggerTyping(channelId, user.username, true);
    
    return json(result.value);
  }
};

export async function GET({ url, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return json({ error: "Missing channelId" }, { status: 400 });
  }

  const result = await getTypingUsers({ sessionToken, userAgentHash: locals.sessionBinding, channelId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

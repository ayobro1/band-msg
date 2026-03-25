import { json } from "@sveltejs/kit";
import { addReaction, consumeRateLimit, getMessageReactions, getSqlClient, removeReaction } from "$lib/server/db";
import { triggerReactionUpdate } from "$lib/server/pusher";
import { getClientIp } from "$lib/server/request";

const REACTION_POST_IP_MAX_ATTEMPTS = 120;
const REACTION_POST_SESSION_MAX_ATTEMPTS = 60;
const REACTION_POST_WINDOW_MS = 60 * 1000;

async function getChannelIdForMessage(messageId: string): Promise<string | null> {
  const sql = getSqlClient();
  const rows = await sql`SELECT channel_id FROM messages WHERE id = ${messageId} LIMIT 1`;
  return rows[0]?.channel_id ?? null;
}

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

  const { messageId, emoji, action } = body;

  if (!messageId || typeof messageId !== "string") {
    return json({ error: "Missing messageId" }, { status: 400 });
  }

  if (!emoji || typeof emoji !== "string") {
    return json({ error: "Missing emoji" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const ipLimit = await consumeRateLimit(
    `reaction-post-ip:${ip}`,
    REACTION_POST_IP_MAX_ATTEMPTS,
    REACTION_POST_WINDOW_MS
  );
  const sessionLimit = await consumeRateLimit(
    `reaction-post-session:${sessionToken}`,
    REACTION_POST_SESSION_MAX_ATTEMPTS,
    REACTION_POST_WINDOW_MS
  );

  if (!ipLimit.allowed || !sessionLimit.allowed) {
    return json({ error: "Too many reaction updates, try again later" }, { status: 429 });
  }

  if (action === "remove") {
    const result = await removeReaction({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      messageId,
      emoji
    });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Get updated reactions and trigger Pusher event
    const reactionsResult = await getMessageReactions({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      messageId
    });
    const channelId = await getChannelIdForMessage(messageId);
    if (reactionsResult.ok && channelId) {
      triggerReactionUpdate(channelId, messageId, reactionsResult.value);
    }
    
    return json(result.value);
  } else {
    const result = await addReaction({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      messageId,
      emoji
    });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Get updated reactions and trigger Pusher event
    const reactionsResult = await getMessageReactions({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      messageId
    });
    const channelId = await getChannelIdForMessage(messageId);
    if (reactionsResult.ok && channelId) {
      triggerReactionUpdate(channelId, messageId, reactionsResult.value);
    }
    
    return json(result.value);
  }
};

export async function GET({ url, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = url.searchParams.get("messageId");
  const messageIds = url.searchParams.get("messageIds");
  
  // Batch load reactions for multiple messages
  if (messageIds) {
    const ids = messageIds.split(',');
    const allReactions: Record<string, any[]> = {};
    
    for (const id of ids) {
      const result = await getMessageReactions({
        sessionToken,
        userAgentHash: locals.sessionBinding,
        messageId: id
      });
      if (result.ok) {
        allReactions[id] = result.value;
      }
    }
    
    return json(allReactions);
  }
  
  // Single message load (legacy)
  if (!messageId) {
    return json({ error: "Missing messageId" }, { status: 400 });
  }

  const result = await getMessageReactions({
    sessionToken,
    userAgentHash: locals.sessionBinding,
    messageId
  });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

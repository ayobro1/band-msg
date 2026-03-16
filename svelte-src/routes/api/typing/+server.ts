import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { startTyping, stopTyping, getTypingUsers, getUserBySession } from "$lib/server/db";
import { triggerTyping } from "$lib/server/pusher";

export async function POST({ request, cookies }: any) {
  const sessionToken = getSessionToken(cookies);
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

  // Get user info for Pusher event
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return json({ error: "User not found" }, { status: 401 });
  }

  if (action === "stop") {
    const result = await stopTyping({ sessionToken, channelId });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Trigger Pusher event
    triggerTyping(channelId, user.username, false);
    
    return json(result.value);
  } else {
    const result = await startTyping({ sessionToken, channelId });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    
    // Trigger Pusher event
    triggerTyping(channelId, user.username, true);
    
    return json(result.value);
  }
};

export async function GET({ url, cookies }: any) {
  const sessionToken = getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return json({ error: "Missing channelId" }, { status: 400 });
  }

  const result = await getTypingUsers({ sessionToken, channelId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

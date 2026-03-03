import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { addReaction, removeReaction, getMessageReactions } from "$lib/server/db";

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

  const { messageId, emoji, action } = body;

  if (!messageId || typeof messageId !== "string") {
    return json({ error: "Missing messageId" }, { status: 400 });
  }

  if (!emoji || typeof emoji !== "string") {
    return json({ error: "Missing emoji" }, { status: 400 });
  }

  if (action === "remove") {
    const result = await removeReaction({ sessionToken, messageId, emoji });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  } else {
    const result = await addReaction({ sessionToken, messageId, emoji });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  }
};

export async function GET({ url, cookies }: any) {
  const sessionToken = getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = url.searchParams.get("messageId");
  if (!messageId) {
    return json({ error: "Missing messageId" }, { status: 400 });
  }

  const result = await getMessageReactions({ sessionToken, messageId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

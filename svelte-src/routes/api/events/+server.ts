import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { createEvent, listEvents, respondToEvent } from "$lib/server/db";

export async function GET({ url, cookies }: any) {
  const sessionToken = getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = url.searchParams.get("serverId") || undefined;
  
  const result = await listEvents({ sessionToken, serverId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

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

  const { action, eventId, status, title, description, location, startsAt, endsAt, serverId, channelId } = body;

  if (action === "respond") {
    if (!eventId || !status) {
      return json({ error: "Missing eventId or status" }, { status: 400 });
    }

    const result = await respondToEvent({ sessionToken, eventId, status });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  } else {
    if (!title || !startsAt || !endsAt) {
      return json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await createEvent({
      sessionToken,
      serverId,
      channelId,
      title,
      description,
      location,
      startsAt: Number(startsAt),
      endsAt: Number(endsAt)
    });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  }
};

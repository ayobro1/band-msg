import { json } from "@sveltejs/kit";
import { createEvent, deleteEvent, listEvents, respondToEvent, updateEvent } from "$lib/server/db";

export async function GET({ url, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = url.searchParams.get("serverId") || undefined;
  
  const result = await listEvents({ sessionToken, userAgentHash: locals.sessionBinding, serverId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

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

  const { action, eventId, status, title, description, location, startsAt, endsAt, serverId, channelId } = body;

  if (action === "respond") {
    if (!eventId || !status) {
      return json({ error: "Missing eventId or status" }, { status: 400 });
    }

    const result = await respondToEvent({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      eventId,
      status
    });
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
      userAgentHash: locals.sessionBinding,
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

export async function PATCH({ request, locals }: any) {
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

  const { eventId, title, description, location, startsAt, endsAt } = body;
  if (!eventId || !title || !startsAt || !endsAt) {
    return json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = await updateEvent({
    sessionToken,
    userAgentHash: locals.sessionBinding,
    eventId,
    title,
    description,
    location,
    startsAt: Number(startsAt),
    endsAt: Number(endsAt),
  });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
}

export async function DELETE({ request, locals }: any) {
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

  const { eventId } = body;
  if (!eventId) {
    return json({ error: "Missing eventId" }, { status: 400 });
  }

  const result = await deleteEvent({
    sessionToken,
    userAgentHash: locals.sessionBinding,
    eventId
  });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
}

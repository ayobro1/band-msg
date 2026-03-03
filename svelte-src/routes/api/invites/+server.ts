import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { createInvite, useInvite } from "$lib/server/db";

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

  const { action, serverId, code, maxUses, expiresInMs } = body;

  if (action === "use") {
    if (!code || typeof code !== "string") {
      return json({ error: "Missing invite code" }, { status: 400 });
    }

    const result = await useInvite({ sessionToken, code });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  } else {
    if (!serverId || typeof serverId !== "string") {
      return json({ error: "Missing serverId" }, { status: 400 });
    }

    const result = await createInvite({ sessionToken, serverId, maxUses, expiresInMs });
    if (result.ok === false) {
      return json({ error: result.error }, { status: result.code });
    }
    return json(result.value);
  }
};

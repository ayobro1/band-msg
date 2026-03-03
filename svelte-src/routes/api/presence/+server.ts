import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { updatePresence } from "$lib/server/db";

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

  const { status, customStatus } = body;

  if (!status || !["online", "idle", "dnd", "offline"].includes(status)) {
    return json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await updatePresence({ sessionToken, status, customStatus });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

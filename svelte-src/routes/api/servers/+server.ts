import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { createServer, listServers } from "$lib/server/db";

export async function GET({ cookies }: any) {
  const sessionToken = getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listServers(sessionToken);
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

  const { name, description } = body;

  if (!name || typeof name !== "string") {
    return json({ error: "Missing name" }, { status: 400 });
  }

  const result = await createServer({ sessionToken, name, description });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

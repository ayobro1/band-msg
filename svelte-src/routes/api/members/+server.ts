import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { listServerMembers } from "$lib/server/db";

export async function GET({ url, cookies, locals }: any) {
  const sessionToken = locals.sessionToken ?? getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverId = url.searchParams.get("serverId");
  if (!serverId) {
    return json({ error: "Missing serverId" }, { status: 400 });
  }

  const result = await listServerMembers({ sessionToken, serverId });
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
}

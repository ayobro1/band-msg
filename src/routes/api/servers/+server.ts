import { json } from "@sveltejs/kit";
import { listServers } from "$lib/server/db";

export async function GET({ locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listServers(sessionToken);
  if (result.ok === false) {
    return json({ error: result.error }, { status: result.code });
  }

  return json(result.value);
};

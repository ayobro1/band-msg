import { json } from "@sveltejs/kit";
import { getRequestUserAgentHash, getSessionToken } from "$lib/server/auth";
import { api } from "../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

export async function GET({ url, cookies, locals, request }: any) {
  const sessionToken = locals.sessionToken ?? getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = await getConvexHttpClient();
    const userAgentHash = getRequestUserAgentHash(request);
    // Fetch all approved users from Convex
    const users = await convex.query(api.auth.getApprovedUsers, { sessionToken, userAgentHash });
    
    return json({ members: users });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

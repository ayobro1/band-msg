import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { api } from "../../../../convex/_generated/api";
import { getConvexHttpClient } from "$lib/server/convex";

export async function GET({ url, cookies, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = await getConvexHttpClient();
    // Fetch all approved users from Convex
    const users = await convex.query(api.auth.getApprovedUsers, {
      sessionToken,
      userAgentHash: locals.sessionBinding,
    });
    
    return json({ members: users });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

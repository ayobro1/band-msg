import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const CONVEX_URL = process.env.CONVEX_URL || process.env.PUBLIC_CONVEX_URL || "";
const convex = new ConvexHttpClient(CONVEX_URL);

export async function GET({ url, cookies, locals }: any) {
  const sessionToken = locals.sessionToken ?? getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all approved users from Convex
    const users = await convex.query(api.auth.getApprovedUsers, { sessionToken });
    
    return json({ members: users });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

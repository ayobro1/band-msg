import { json } from "@sveltejs/kit";
import { getSessionToken } from "$lib/server/auth";
import { getSqlClient } from "$lib/server/db";

export async function GET({ url, cookies, locals }: any) {
  const sessionToken = locals.sessionToken ?? getSessionToken(cookies);
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // For simplicity, just return all approved users with their presence status
  try {
    const sql = getSqlClient();
    const users = await sql`
      SELECT id, username, role, presence_status as "presenceStatus"
      FROM users
      WHERE status = 'approved'
      ORDER BY username
    `;
    
    return json({ members: users });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

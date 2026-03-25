import { getSqlClient, getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals, params }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const { messageId } = params;
  if (!messageId) {
    return toJson({ error: "messageId is required" }, 400);
  }

  try {
    const user = await getUserBySession(locals.sessionToken, locals.sessionBinding);
    if (!user) {
      return toJson({ error: "unauthorized" }, 401);
    }

    const sql = await getSqlClient();

    const parentRows = await sql`
      SELECT m.id, m.channel_id, c.is_private, cm.user_id AS member_id, cm.can_read
      FROM messages m
      JOIN channels c ON c.id = m.channel_id
      LEFT JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ${user.id}
      WHERE m.id = ${messageId}
      LIMIT 1
    `;

    const parent = parentRows[0] as any;
    if (!parent) {
      return toJson({ error: "message not found" }, 404);
    }

    if (parent.is_private && user.role !== "admin" && (!parent.member_id || !parent.can_read)) {
      return toJson({ error: "forbidden" }, 403);
    }

    const replies = await sql`
      SELECT 
        m.id,
        m.content,
        m.created_at as "createdAt",
        u.username as author
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.reply_to_id = ${messageId}
      ORDER BY m.created_at ASC
    `;

    return toJson(replies);
  } catch (error) {
    console.error('Failed to load thread replies:', error);
    return toJson({ error: "Failed to load replies" }, 500);
  }
};

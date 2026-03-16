import { getSqlClient } from "$lib/server/db";

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
    const sql = await getSqlClient();
    
    // Get all replies to this message
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

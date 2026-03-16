import { getSqlClient, getUserBySession } from "$lib/server/db";
const sql = (strings: TemplateStringsArray, ...params: any[]) => getSqlClient()(strings, ...params);

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals, params }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const user = await getUserBySession(locals.sessionToken);
  if (!user || user.role !== "admin") {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = params.id;
  const rows = await sql`
    SELECT u.id, u.username, cm.can_read, cm.can_write
    FROM channel_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.channel_id = ${channelId}
  `;

  return toJson(rows);
};

export const POST = async ({ locals, params, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const user = await getUserBySession(locals.sessionToken);
  if (!user || user.role !== "admin") {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = params.id;
  const body = await request.json().catch(() => null);
  const targetUsername = typeof body?.username === "string" ? body.username.toLowerCase() : "";
  const canRead = typeof body?.canRead === "boolean" ? body.canRead : true;
  const canWrite = typeof body?.canWrite === "boolean" ? body.canWrite : true;

  if (!targetUsername) {
    return toJson({ error: "username is required" }, 400);
  }

  const userRows = await sql`SELECT id FROM users WHERE username = ${targetUsername} LIMIT 1`;
  const targetUser = userRows[0];

  if (!targetUser) {
    return toJson({ error: "User not found" }, 404);
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO channel_members (id, channel_id, user_id, can_read, can_write, added_at)
    VALUES (${id}, ${channelId}, ${targetUser.id}, ${canRead}, ${canWrite}, ${Date.now()})
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET can_read = ${canRead}, can_write = ${canWrite}
  `;

  return toJson({ ok: true });
};

export const DELETE = async ({ locals, params, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const user = await getUserBySession(locals.sessionToken);
  if (!user || user.role !== "admin") {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = params.id;
  const body = await request.json().catch(() => null);
  const targetUsername = typeof body?.username === "string" ? body.username.toLowerCase() : "";

  if (!targetUsername) {
    return toJson({ error: "username is required" }, 400);
  }

  const userRows = await sql`SELECT id FROM users WHERE username = ${targetUsername} LIMIT 1`;
  const targetUser = userRows[0];

  if (!targetUser) {
    return toJson({ error: "User not found" }, 404);
  }

  await sql`
    DELETE FROM channel_members
    WHERE channel_id = ${channelId} AND user_id = ${targetUser.id}
  `;

  return toJson({ ok: true });
};

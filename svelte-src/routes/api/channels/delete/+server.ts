import { deleteChannel } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  if (!channelId) {
    return toJson({ error: "channelId is required" }, 400);
  }

  const result = await deleteChannel({
    sessionToken: locals.sessionToken,
    channelId
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 403);
  }

  return toJson({ ok: true });
};

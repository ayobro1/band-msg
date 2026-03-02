import { getConvexClient } from "$lib/server/convex";

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
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const emoji = typeof body?.emoji === "string" ? body.emoji : "";

  if (!messageId || !emoji) {
    return toJson({ error: "messageId and emoji are required" }, 400);
  }

  const convex = getConvexClient();
  const result = await convex.mutation("chat:toggleReaction" as any, {
    sessionToken: locals.sessionToken,
    messageId,
    emoji
  });

  if (!result.ok) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ ok: true });
};

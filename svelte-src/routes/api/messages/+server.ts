import { getConvexClient } from "$lib/server/convex";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals, url }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return toJson({ error: "channelId is required" }, 400);
  }

  const convex = getConvexClient();
  const result = await convex.query("chat:listMessages" as any, {
    sessionToken: locals.sessionToken,
    channelId
  });

  if (!result.ok) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson(result.messages);
};

export const POST = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  const content = typeof body?.content === "string" ? body.content : "";

  if (!channelId || !content) {
    return toJson({ error: "channelId and content are required" }, 400);
  }

  const convex = getConvexClient();
  const result = await convex.mutation("chat:sendMessage" as any, {
    sessionToken: locals.sessionToken,
    channelId,
    content
  });

  if (!result.ok) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ id: result.messageId }, 201);
};

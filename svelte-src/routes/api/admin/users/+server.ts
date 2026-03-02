import { getConvexClient } from "$lib/server/convex";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const convex = getConvexClient();
  const result = await convex.query("auth:listPendingUsers" as any, {
    sessionToken: locals.sessionToken
  });

  if (!result.ok) {
    return toJson({ error: result.error }, result.code ?? 403);
  }

  return toJson(result.users);
};

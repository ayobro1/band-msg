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
  const user = await convex.query("auth:me" as any, {
    sessionToken: locals.sessionToken
  });

  if (!user) {
    return toJson({ error: "unauthorized" }, 401);
  }

  return toJson(user);
};

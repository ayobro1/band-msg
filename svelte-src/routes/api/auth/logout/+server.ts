import { clearSessionCookie, getSessionToken } from "$lib/server/auth";
import { getConvexClient } from "$lib/server/convex";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ cookies }: any) => {
  const sessionToken = getSessionToken(cookies);
  if (sessionToken) {
    const convex = getConvexClient();
    await convex.mutation("auth:logout" as any, { sessionToken });
  }

  clearSessionCookie(cookies);
  return toJson({ ok: true });
};

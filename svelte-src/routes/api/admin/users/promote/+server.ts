import { promoteUser } from "$lib/server/db";

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
  const username = typeof body?.username === "string" ? body.username : "";
  if (!username) {
    return toJson({ error: "username is required" }, 400);
  }

  const result = await promoteUser({
    sessionToken: locals.sessionToken,
    username
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 403);
  }

  return toJson({ ok: true });
};

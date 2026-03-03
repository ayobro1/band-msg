import { listPendingUsers } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const result = await listPendingUsers(locals.sessionToken);

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 403);
  }

  return toJson(result.value);
};

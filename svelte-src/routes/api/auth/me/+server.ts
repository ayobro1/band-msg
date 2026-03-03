import { getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const user = await getUserBySession(locals.sessionToken);

  if (!user) {
    return toJson({ error: "unauthorized" }, 401);
  }

  return toJson(user);
};

import { createChannel, listChannels } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const result = await listChannels(locals.sessionToken);

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson(result.value);
};

export const POST = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const description = typeof body?.description === "string" ? body.description : "";

  if (!name) {
    return toJson({ error: "name is required" }, 400);
  }

  const result = await createChannel({
    sessionToken: locals.sessionToken,
    name,
    description
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ id: result.value.channelId }, 201);
};

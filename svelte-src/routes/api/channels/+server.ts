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
  const isPrivate = typeof body?.isPrivate === "boolean" ? body.isPrivate : false;
  const memberIds = Array.isArray(body?.memberIds) ? body.memberIds : [];

  if (!name) {
    return toJson({ error: "name is required" }, 400);
  }

  // Only admins can create private channels
  if (isPrivate && locals.user?.role !== 'admin') {
    return toJson({ error: "Only admins can create private channels" }, 403);
  }

  const result = await createChannel({
    sessionToken: locals.sessionToken,
    name,
    description,
    isPrivate,
    memberIds
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ id: result.value.channelId }, 201);
};

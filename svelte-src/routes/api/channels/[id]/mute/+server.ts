import { setChannelMuted, getMutedChannelIds } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const result = await getMutedChannelIds({
    sessionToken: locals.sessionToken
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson(result.value);
};

export const POST = async ({ locals, params, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = params.id;
  const body = await request.json().catch(() => null);
  const muted = typeof body?.muted === "boolean" ? body.muted : true;

  const result = await setChannelMuted({
    sessionToken: locals.sessionToken,
    channelId,
    muted
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ ok: true });
};

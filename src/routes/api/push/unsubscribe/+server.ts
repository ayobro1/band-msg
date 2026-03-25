import { clearPushSubscriptions, removePushSubscription, getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request, locals }: any) => {
  try {
    const body = await request.json().catch(() => null);
    const { endpoint } = body || {};

    const sessionToken = locals.sessionToken;
    if (!sessionToken) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const user = await getUserBySession(sessionToken, locals.sessionBinding);
    if (!user) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const result = endpoint
      ? await removePushSubscription({
          sessionToken,
          endpoint
        })
      : await clearPushSubscriptions({ sessionToken });

    if (result.ok === false) {
      return toJson({ error: result.error }, result.code ?? 500);
    }
    
    return toJson({ success: true });
  } catch (error: any) {
    console.error('Unsubscribe error:', error);
    return toJson({ error: "Failed to remove subscription" }, 500);
  }
};

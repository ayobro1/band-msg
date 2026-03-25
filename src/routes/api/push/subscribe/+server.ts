import { savePushSubscription, getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const POST = async ({ request, locals }: any) => {
  try {
    const body = await request.json().catch(() => null);
    const { fcmToken, endpoint, p256dhKey, authKey } = body || {};
    const sessionToken = locals.sessionToken;

    if (!sessionToken) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    // Support both FCM token format and web push format
    if (fcmToken) {
      // FCM format - store the token
      const user = await getUserBySession(sessionToken, locals.sessionBinding);
      if (!user) {
        return toJson({ error: "Unauthorized" }, 401);
      }

      const result = await savePushSubscription({
        sessionToken,
        userAgentHash: locals.sessionBinding,
        endpoint: fcmToken,
        p256dhKey: 'fcm',
        authKey: 'fcm'
      });

      if (result.ok === false) {
        return toJson({ error: result.error }, result.code ?? 500);
      }
      
      return toJson({ success: true });
    }

    // Web push format
    if (!endpoint || !p256dhKey || !authKey) {
      return toJson({ error: "Missing required subscription parameters" }, 400);
    }

    const user = await getUserBySession(sessionToken, locals.sessionBinding);
    if (!user) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const result = await savePushSubscription({
      sessionToken,
      userAgentHash: locals.sessionBinding,
      endpoint,
      p256dhKey,
      authKey
    });

    if (result.ok === false) {
      return toJson({ error: result.error }, result.code ?? 500);
    }
    
    return toJson({ success: true });
  } catch (error: any) {
    console.error('Subscribe error:', error);
    return toJson({ error: "Failed to save subscription" }, 500);
  }
};

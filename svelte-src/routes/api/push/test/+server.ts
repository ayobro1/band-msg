import webPush from 'web-push';
import { ensureServerEnv } from "$lib/server/env";
import { getSessionToken } from "$lib/server/auth";
import { getPushSubscriptionsForUser, getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

function configureWebPush() {
  ensureServerEnv();

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (publicKey && privateKey) {
    webPush.setVapidDetails(
      'mailto:admin@bandchat.local',
      publicKey,
      privateKey
    );
  }

  return { publicKey, privateKey };
}

export const POST = async ({ cookies }: any) => {
  try {
    const { publicKey, privateKey } = configureWebPush();
    if (!publicKey || !privateKey) {
      return toJson({ error: "Push notifications are not configured on the server." }, 503);
    }

    const sessionToken = getSessionToken(cookies);
    if (!sessionToken) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const subscriptions = await getPushSubscriptionsForUser({ sessionToken });
    if (subscriptions.ok === false) {
      return toJson({ error: subscriptions.error }, subscriptions.code ?? 400);
    }

    if (subscriptions.value.length === 0) {
      return toJson({
        error: "No active push subscription was found for this device. Enable notifications here first."
      }, 400);
    }

    const payload = JSON.stringify({
      title: 'Band Chat',
      body: `Notifications are live for ${user.username}.`,
      url: '/',
      tag: `band-chat-test-${user.id}`
    });

    const results = await Promise.all(
      subscriptions.value.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dhKey,
                auth: subscription.authKey
              }
            },
            payload
          );

          return { success: true };
        } catch (error: any) {
          return {
            success: false,
            error: error?.message || 'Unknown delivery error'
          };
        }
      })
    );

    const sent = results.filter((result) => result.success).length;
    if (sent === 0) {
      return toJson({
        error: "The test push could not be delivered to this device yet."
      }, 502);
    }

    return toJson({
      success: true,
      sent,
      total: subscriptions.value.length
    });
  } catch (error: any) {
    console.error('Push notification test error:', error);
    return toJson({ error: "Failed to send test push" }, 500);
  }
};

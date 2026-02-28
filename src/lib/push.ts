import { getDb } from "./db";

/**
 * Send push notifications to all subscribed users except the sender.
 * Uses dynamic import for web-push to avoid build failure if not installed.
 */
export async function sendPushNotifications(
  senderUsername: string,
  channelName: string,
  messageContent: string
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webpushModule: any = await import("web-push").catch(() => null);
    if (!webpushModule) return;
    const webpush = webpushModule.default ?? webpushModule;

    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:admin@lazzycal.com";

    if (!vapidPublicKey || !vapidPrivateKey) return;

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const db = getDb();
    const subscriptions = db
      .prepare("SELECT endpoint, username, p256dh, auth FROM push_subscriptions WHERE username != ?")
      .all(senderUsername) as { endpoint: string; username: string; p256dh: string; auth: string }[];

    const body = messageContent
      ? `${senderUsername}: ${messageContent.slice(0, 200)}`
      : `${senderUsername} sent an attachment`;

    const payload = JSON.stringify({
      title: `#${channelName}`,
      body,
      icon: "/icons/icon-192.svg",
      tag: `channel-${channelName}`,
      url: "/",
    });

    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            staleEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      const del = db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?");
      for (const ep of staleEndpoints) {
        del.run(ep);
      }
    }
  } catch (error) {
    console.error("Push notification error:", error);
  }
}

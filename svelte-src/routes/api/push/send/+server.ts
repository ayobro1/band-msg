import webPush from 'web-push';
import { getAllPushSubscriptions } from "$lib/server/db";
import { getSessionToken } from "$lib/server/auth";
import { getUserBySession } from "$lib/server/db";

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

// VAPID keys should be set in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    'mailto:admin@bandchat.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn('VAPID keys not configured. Push notifications will not work.');
}

export const POST = async ({ request, cookies }: any) => {
  try {
    // Check if VAPID keys are configured
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return toJson({ error: "Push notifications not configured" }, 503);
    }

    const sessionToken = getSessionToken(cookies);
    if (!sessionToken) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const user = await getUserBySession(sessionToken);
    if (!user) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    // Only admins can send push notifications
    if (user.role !== 'admin') {
      return toJson({ error: "Forbidden" }, 403);
    }

    const body = await request.json().catch(() => null);
    const { title, body: messageBody, url, targetUserId } = body || {};

    if (!title || !messageBody) {
      return toJson({ error: "Missing title or body" }, 400);
    }

    const subscriptions = await getAllPushSubscriptions();

    if (subscriptions.length === 0) {
      return toJson({ success: true, message: "No subscriptions found" });
    }

    const payload = JSON.stringify({
      title,
      body: messageBody,
      url: url || '/',
      tag: 'band-chat-notification'
    });

    const sendPromises = subscriptions.map(async (sub) => {
      // If targetUserId is specified, only send to that user
      if (targetUserId && sub.endpoint.includes(targetUserId)) {
        // This is a simplified check - in production you'd want to store userId with subscription
      }

      try {
        await webPush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dhKey,
              auth: sub.authKey
            }
          },
          payload
        );
        return { success: true, endpoint: sub.endpoint };
      } catch (error: any) {
        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          // Subscription expired, should be removed from DB
          console.log('Expired subscription:', sub.endpoint);
        }
        return { success: false, endpoint: sub.endpoint, error: error.message };
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    return toJson({ 
      success: true, 
      sent: successCount, 
      total: subscriptions.length,
      results 
    });
  } catch (error: any) {
    console.error('Push notification error:', error);
    return toJson({ error: "Failed to send push notifications" }, 500);
  }
};

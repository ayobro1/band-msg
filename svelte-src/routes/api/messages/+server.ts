import { listMessages, sendMessage, deleteMessage, getPushSubscriptionsExceptUser, getUserBySession } from "$lib/server/db";
import webPush from 'web-push';

// VAPID keys should be set in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    'mailto:admin@bandchat.local',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
}


const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });

export const GET = async ({ locals, url }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const channelId = url.searchParams.get("channelId");
  if (!channelId) {
    return toJson({ error: "channelId is required" }, 400);
  }

  const result = await listMessages({
    sessionToken: locals.sessionToken,
    channelId
  });

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
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  const content = typeof body?.content === "string" ? body.content : "";

  if (!channelId || !content) {
    return toJson({ error: "channelId and content are required" }, 400);
  }

  const result = await sendMessage({
    sessionToken: locals.sessionToken,
    channelId,
    content
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  // Trigger push notifications in the background
  try {
    const user = await getUserBySession(locals.sessionToken);
    if (user && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      const subscriptions = await getPushSubscriptionsExceptUser(user.id);
      
      if (subscriptions.length > 0) {
        // Strip markdown image syntax for notifications if it's a GIF
        const isGif = content.match(/!\[GIF\]\((.*?)\)/);
        const displayContent = isGif ? 'Sent a GIF' : content.length > 100 ? content.substring(0, 97) + '...' : content;
        
        const payload = JSON.stringify({
          title: `New message from ${user.username}`,
          body: displayContent,
          url: '/',
          tag: 'band-chat-message'
        });

        // Send notifications asynchronously
        Promise.all(subscriptions.map(async (sub) => {
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
          } catch (error: any) {
            if (error.statusCode === 410 || error.statusCode === 404) {
              console.log('Expired subscription on new message:', sub.endpoint);
              // In a real app we would delete the subscription here
            }
          }
        })).catch(console.error);
      }
    }
  } catch (pushErr) {
    console.error('Failed to trigger push notifications on new message:', pushErr);
  }

  return toJson({ id: result.value.messageId }, 201);
};

export const DELETE = async ({ locals, request }: any) => {
  if (!locals.sessionToken) {
    return toJson({ error: "unauthorized" }, 401);
  }

  const body = await request.json().catch(() => null);
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";

  if (!messageId) {
    return toJson({ error: "messageId is required" }, 400);
  }

  const result = await deleteMessage({
    sessionToken: locals.sessionToken,
    messageId
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  return toJson({ deleted: true });
};

import {
  consumeRateLimit,
  deleteMessage,
  getPushSubscriptionsForMessage,
  getUserBySession,
  listMessages,
  sendMessage
} from "$lib/server/db";
import { triggerNewMessage, triggerMessageDeleted } from "$lib/server/pusher";
import webPush from 'web-push';
import { ensureServerEnv } from "$lib/server/env";
import { getClientIp } from "$lib/server/request";

const MESSAGE_POST_IP_MAX_ATTEMPTS = 90;
const MESSAGE_POST_USER_MAX_ATTEMPTS = 30;
const MESSAGE_POST_WINDOW_MS = 60 * 1000;
const MESSAGE_DELETE_SESSION_MAX_ATTEMPTS = 20;
const MESSAGE_DELETE_WINDOW_MS = 5 * 60 * 1000;

function getVapidConfig() {
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


const toJson = (body: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
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
    userAgentHash: locals.sessionBinding,
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
  const replyToId = typeof body?.replyToId === "string" ? body.replyToId : undefined;

  if (!channelId || !content) {
    return toJson({ error: "channelId and content are required" }, 400);
  }

  const ip = getClientIp(request);
  const actorId =
    typeof locals.user?.id === "string" && locals.user.id.length > 0
      ? locals.user.id
      : locals.sessionToken;
  const ipLimit = await consumeRateLimit(
    `message-post-ip:${ip}`,
    MESSAGE_POST_IP_MAX_ATTEMPTS,
    MESSAGE_POST_WINDOW_MS
  );
  const userLimit = await consumeRateLimit(
    `message-post-user:${actorId}`,
    MESSAGE_POST_USER_MAX_ATTEMPTS,
    MESSAGE_POST_WINDOW_MS
  );

  if (!ipLimit.allowed || !userLimit.allowed) {
    const retryAfterMs = Math.max(ipLimit.retryAfterMs ?? 0, userLimit.retryAfterMs ?? 0);
    return toJson(
      { error: "Too many messages sent, try again later" },
      429,
      retryAfterMs > 0 ? { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } : undefined
    );
  }

  const { publicKey, privateKey } = getVapidConfig();

  const result = await sendMessage({
    sessionToken: locals.sessionToken,
    userAgentHash: locals.sessionBinding,
    channelId,
    content,
    replyToId
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  // Get user info and trigger Pusher event
  const user = await getUserBySession(locals.sessionToken, locals.sessionBinding);
  if (user) {
      triggerNewMessage(channelId, {
        id: result.value.messageId,
        author: user.username,
        content,
        createdAt: Date.now(),
        replyToId: replyToId ?? null,
        reactions: []
      });
    }

  // Trigger push notifications in the background
  try {
    if (user && publicKey && privateKey) {
      const subscriptions = await getPushSubscriptionsForMessage({
        userId: user.id,
        channelId: channelId
      });
      
      if (subscriptions.length > 0) {
        // Strip markdown image syntax for notifications if it's a GIF
        const isGif = content.match(/!\[GIF\]\((.*?)\)/);
        const displayContent = isGif ? 'Sent a GIF' : content.length > 100 ? content.substring(0, 97) + '...' : content;
        
        const payload = JSON.stringify({
          title: `New message from ${user.username}`,
          body: displayContent,
          url: '/',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: `band-chat-message-${channelId}`
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

  const deleteLimit = await consumeRateLimit(
    `message-delete-session:${locals.sessionToken}`,
    MESSAGE_DELETE_SESSION_MAX_ATTEMPTS,
    MESSAGE_DELETE_WINDOW_MS
  );

  if (!deleteLimit.allowed) {
    return toJson(
      { error: "Too many message deletion attempts, try again later" },
      429,
      deleteLimit.retryAfterMs
        ? { "Retry-After": String(Math.max(1, Math.ceil(deleteLimit.retryAfterMs / 1000))) }
        : undefined
    );
  }

  const result = await deleteMessage({
    sessionToken: locals.sessionToken,
    userAgentHash: locals.sessionBinding,
    messageId
  });

  if (result.ok === false) {
    return toJson({ error: result.error }, result.code ?? 400);
  }

  // Note: We'd need channelId to trigger Pusher event properly
  // For now, clients handle deletion optimistically
  
  return toJson({ deleted: true });
};

"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import webpush from "web-push";

// Action to send push notifications (runs in Node.js environment)
export const sendPushNotifications = action({
  args: {
    messageId: v.id("messages"),
    channelId: v.id("channels"),
    authorId: v.id("users"),
    authorName: v.string(),
    content: v.string(),
    isReply: v.boolean(),
  },
  handler: async (ctx, args) => {
    try {
      // Get channel info
      const channel = await ctx.runQuery(api.messages.getChannelInfo, {
        channelId: args.channelId,
      });

      if (!channel) {
        console.log("[sendPushNotifications] Channel not found");
        return;
      }

      // Get all push subscriptions for users in this channel (except the author)
      const subscriptions = await ctx.runQuery(api.messages.getPushSubscriptionsForChannel, {
        channelId: args.channelId,
        excludeUserId: args.authorId,
      });

      if (subscriptions.length === 0) {
        console.log("[sendPushNotifications] No subscriptions found");
        return;
      }

      // Prepare notification payload
      const notificationTitle = `#${channel.name}`;
      const notificationBody = args.isReply
        ? `${args.authorName} replied: ${args.content.substring(0, 100)}`
        : `${args.authorName}: ${args.content.substring(0, 100)}`;

      const payload = JSON.stringify({
        title: notificationTitle,
        body: notificationBody,
        icon: "/notification-icon.png",
        badge: "/notification-icon.png",
        tag: args.channelId,
        data: {
          channelId: args.channelId,
          messageId: args.messageId,
          url: "/",
        },
      });

      console.log(`[sendPushNotifications] Sending to ${subscriptions.length} subscriptions`);

      // Get VAPID keys from environment
      const vapidPublicKey = process.env.VITE_FIREBASE_VAPID_KEY;
      const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
      const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@bandchat.local";

      if (!vapidPublicKey || !vapidPrivateKey) {
        console.error("[sendPushNotifications] VAPID keys not configured");
        console.error("Public key:", vapidPublicKey ? "present" : "missing");
        console.error("Private key:", vapidPrivateKey ? "present" : "missing");
        return;
      }

      // Configure web-push
      webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey
      );

      // Send to each subscription
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dhKey,
                  auth: sub.authKey,
                },
              },
              payload
            );
            console.log("[sendPushNotifications] Sent to:", sub.endpoint.substring(0, 50) + "...");
          } catch (error: any) {
            console.error("[sendPushNotifications] Error sending to subscription:", error.message);
            // If subscription is invalid (410 Gone), we should remove it
            if (error.statusCode === 410) {
              console.log("[sendPushNotifications] Subscription expired (410), should be removed");
            }
          }
        })
      );

      const successful = results.filter((r) => r.status === "fulfilled").length;
      console.log(`[sendPushNotifications] Sent ${successful}/${subscriptions.length} notifications`);
    } catch (error) {
      console.error("[sendPushNotifications] Error:", error);
    }
  },
});

"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// Action to send push notifications via Firebase Cloud Messaging HTTP v1 API
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
      console.log("[sendPushNotifications] Starting notification send for message:", args.messageId);
      
      // Get channel info
      const channel = await ctx.runQuery(api.messages.getChannelInfo, {
        channelId: args.channelId,
      });

      if (!channel) {
        console.log("[sendPushNotifications] Channel not found");
        return;
      }

      console.log("[sendPushNotifications] Channel found:", channel.name);

      // Get all push subscriptions for users in this channel (except the author)
      const subscriptions = await ctx.runQuery(api.messages.getPushSubscriptionsForChannel, {
        channelId: args.channelId,
        excludeUserId: args.authorId,
      });

      console.log(`[sendPushNotifications] Found ${subscriptions.length} subscriptions`);

      if (subscriptions.length === 0) {
        console.log("[sendPushNotifications] No subscriptions found");
        return;
      }

      // Prepare notification payload
      const notificationTitle = `#${channel.name}`;
      const notificationBody = args.isReply
        ? `${args.authorName} replied: ${args.content.substring(0, 100)}`
        : `${args.authorName}: ${args.content.substring(0, 100)}`;

      console.log(`[sendPushNotifications] Notification: "${notificationTitle}" - "${notificationBody}"`);

      // Get Firebase credentials from environment
      const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

      console.log("[sendPushNotifications] Credentials check:", {
        hasProjectId: !!projectId,
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
        privateKeyLength: privateKey?.length
      });

      if (!projectId || !clientEmail || !privateKey) {
        console.error("[sendPushNotifications] Firebase Admin credentials not configured");
        return;
      }

      console.log("[sendPushNotifications] Getting OAuth2 access token...");
      
      // Get OAuth2 access token using service account
      const accessToken = await getAccessToken(clientEmail, privateKey);
      
      if (!accessToken) {
        console.error("[sendPushNotifications] Failed to get access token");
        return;
      }

      console.log("[sendPushNotifications] Access token obtained successfully");

      // Send to each FCM token
      const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            const endpoint = sub.endpoint;
            
            console.log(`[sendPushNotifications] Sending to FCM: ${endpoint.substring(0, 30)}...`);

            // Send via Firebase Cloud Messaging HTTP v1 API
            const response = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                  message: {
                    token: endpoint,
                    notification: {
                      title: notificationTitle,
                      body: notificationBody,
                    },
                    data: {
                      channelId: args.channelId,
                      messageId: args.messageId,
                    },
                    webpush: {
                      notification: {
                        icon: "/notification-icon.png",
                        badge: "/notification-icon.png",
                        tag: args.channelId,
                      },
                      fcm_options: {
                        link: "/",
                      },
                    },
                  },
                }),
              }
            );

            if (!response.ok) {
              const errorText = await response.text();
              console.error("[sendPushNotifications] FCM error:", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
                token: endpoint.substring(0, 30) + "..."
              });
            } else {
              const result = await response.json();
              console.log("[sendPushNotifications] Successfully sent to:", endpoint.substring(0, 30) + "...", result);
            }
          } catch (error: any) {
            console.error("[sendPushNotifications] Error sending to subscription:", error.message);
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

// Generate OAuth2 access token from service account
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600; // 1 hour

    // Create JWT header and payload
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const payload = {
      iss: clientEmail,
      sub: clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: expiry,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    };

    // Encode header and payload
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with private key using Web Crypto API
    const signature = await signRS256(signatureInput, privateKey);
    const jwt = `${signatureInput}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("[getAccessToken] Failed to get access token:", error);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("[getAccessToken] Error:", error);
    return null;
  }
}

// Base64 URL encode
function base64UrlEncode(str: string): string {
  const base64 = Buffer.from(str).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// Sign with RS256
async function signRS256(data: string, privateKey: string): Promise<string> {
  const crypto = await import("crypto");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  const signature = sign.sign(privateKey);
  // Convert buffer directly to base64url without double encoding
  const base64 = signature.toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

// Test action to manually trigger a notification
export const testPushNotification = action({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("[testPushNotification] Starting test...");
    
    // Get user
    const user = await ctx.runQuery(api.auth.getUserByToken, {
      sessionToken: args.sessionToken,
    });
    
    if (!user) {
      console.error("[testPushNotification] User not found");
      return { success: false, error: "User not found" };
    }
    
    console.log("[testPushNotification] User:", user.username);
    
    // Get user's push subscription
    const subscription = await ctx.runQuery(api.pushSubscriptions.isSubscribed, {
      sessionToken: args.sessionToken,
    });
    
    console.log("[testPushNotification] Subscription status:", subscription);
    
    if (!subscription.subscribed) {
      return { success: false, error: "User not subscribed to push notifications" };
    }
    
    // Get a channel to test with
    const channels = await ctx.runQuery(api.channels.list, {
      sessionToken: args.sessionToken,
    });
    
    if (channels.length === 0) {
      return { success: false, error: "No channels found" };
    }
    
    const testChannel = channels[0];
    console.log("[testPushNotification] Using channel:", testChannel.name);
    
    // Trigger notification
    await ctx.scheduler.runAfter(0, api.pushNotifications.sendPushNotifications, {
      messageId: "test" as any,
      channelId: testChannel.id,
      authorId: user._id,
      authorName: user.username,
      content: "This is a test notification!",
      isReply: false,
    });
    
    return { success: true, message: "Test notification scheduled" };
  },
});

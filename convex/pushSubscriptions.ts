import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

// Check if user has push subscription
export const isSubscribed = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) return { subscribed: false };

    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    return { subscribed: !!subscription };
  },
});

// Subscribe to push notifications
export const subscribe = mutation({
  args: {
    sessionToken: v.string(),
    endpoint: v.string(),
    p256dhKey: v.string(),
    authKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    // Check if subscription already exists
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      // Update existing subscription
      await ctx.db.patch(existing._id, {
        userId: user._id,
        p256dhKey: args.p256dhKey,
        authKey: args.authKey,
      });
      return { success: true };
    }

    // Create new subscription
    await ctx.db.insert("pushSubscriptions", {
      userId: user._id,
      endpoint: args.endpoint,
      p256dhKey: args.p256dhKey,
      authKey: args.authKey,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Unsubscribe from push notifications
export const unsubscribe = mutation({
  args: {
    sessionToken: v.string(),
    endpoint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    if (args.endpoint) {
      // Remove specific subscription
      const subscription = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
        .first();

      if (subscription) {
        await ctx.db.delete(subscription._id);
      }
    } else {
      // Remove all subscriptions for user
      const subscriptions = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      for (const sub of subscriptions) {
        await ctx.db.delete(sub._id);
      }
    }

    return { success: true };
  },
});

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { getUserByToken } from "./auth";

export const add = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    // Check if already reacted
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (existing) {
      return { success: true };
    }

    await ctx.db.insert("reactions", {
      messageId: args.messageId,
      userId: user._id,
      emoji: args.emoji,
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const reaction = await ctx.db
      .query("reactions")
      .withIndex("by_message_user", (q) =>
        q.eq("messageId", args.messageId).eq("userId", user._id)
      )
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .first();

    if (reaction) {
      await ctx.db.delete(reaction._id);
    }

    return { success: true };
  },
});

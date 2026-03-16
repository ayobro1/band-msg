import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

export const list = query({
  args: {
    channelId: v.id("channels"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    // Check channel access
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("Channel not found");

    if (channel.isPrivate && user.role !== "admin") {
      const membership = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel_user", (q) =>
          q.eq("channelId", args.channelId).eq("userId", user._id)
        )
        .first();

      if (!membership || !membership.canRead) {
        throw new Error("No permission to read this channel");
      }
    }

    // Get messages (exclude thread replies - only show top-level messages)
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .filter((q) => q.eq(q.field("replyToId"), undefined))
      .order("asc")
      .take(200);

    // Get user info for each message
    const messagesWithAuthors = await Promise.all(
      messages.map(async (msg) => {
        const author = await ctx.db.get(msg.userId);
        
        // Get reactions for this message
        const reactions = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q) => q.eq("messageId", msg._id))
          .collect();

        // Group reactions by emoji
        const reactionMap = new Map<string, { emoji: string; count: number; users: string[] }>();
        for (const reaction of reactions) {
          const reactUser = await ctx.db.get(reaction.userId);
          if (!reactUser) continue;

          if (!reactionMap.has(reaction.emoji)) {
            reactionMap.set(reaction.emoji, {
              emoji: reaction.emoji,
              count: 0,
              users: [],
            });
          }
          const r = reactionMap.get(reaction.emoji)!;
          r.count++;
          r.users.push(reactUser.username);
        }

        // Get reply count
        const replies = await ctx.db
          .query("messages")
          .withIndex("by_reply_to", (q) => q.eq("replyToId", msg._id))
          .collect();

        return {
          id: msg._id,
          content: msg.content,
          channelId: msg.channelId,
          createdAt: msg.createdAt,
          author: author?.username || "Unknown",
          reactions: Array.from(reactionMap.values()),
          replyCount: replies.length,
        };
      })
    );

    return messagesWithAuthors;
  },
});

export const send = mutation({
  args: {
    channelId: v.id("channels"),
    content: v.string(),
    sessionToken: v.string(),
    replyToId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const content = args.content.trim();
    if (content.length === 0 || content.length > 4000) {
      throw new Error("Message must be 1-4000 chars");
    }

    // Check channel access
    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("Channel not found");

    if (channel.isPrivate && user.role !== "admin") {
      const membership = await ctx.db
        .query("channelMembers")
        .withIndex("by_channel_user", (q) =>
          q.eq("channelId", args.channelId).eq("userId", user._id)
        )
        .first();

      if (!membership || !membership.canWrite) {
        throw new Error("No permission to write in this channel");
      }
    }

    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      userId: user._id,
      content,
      replyToId: args.replyToId,
      createdAt: Date.now(),
    });

    return { messageId };
  },
});

export const remove = mutation({
  args: {
    messageId: v.id("messages"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    if (message.userId !== user._id && user.role !== "admin") {
      throw new Error("Not authorized to delete this message");
    }

    await ctx.db.delete(args.messageId);
    return { deleted: true };
  },
});

export const getThread = query({
  args: {
    messageId: v.id("messages"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const replies = await ctx.db
      .query("messages")
      .withIndex("by_reply_to", (q) => q.eq("replyToId", args.messageId))
      .collect();

    const repliesWithAuthors = await Promise.all(
      replies.map(async (msg) => {
        const author = await ctx.db.get(msg.userId);
        return {
          id: msg._id,
          content: msg.content,
          createdAt: msg.createdAt,
          author: author?.username || "Unknown",
        };
      })
    );

    return repliesWithAuthors;
  },
});

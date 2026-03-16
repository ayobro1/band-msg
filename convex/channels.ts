import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

export const list = query({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    // Get all channels
    const allChannels = await ctx.db.query("channels").collect();

    // Filter channels based on permissions
    const channels = await Promise.all(
      allChannels.map(async (channel) => {
        // Public channels are visible to everyone
        if (!channel.isPrivate) {
          return {
            id: channel._id,
            name: channel.name,
            description: channel.description,
            isPrivate: channel.isPrivate,
          };
        }

        // Private channels - check membership or admin
        if (user.role === "admin") {
          return {
            id: channel._id,
            name: channel.name,
            description: channel.description,
            isPrivate: channel.isPrivate,
          };
        }

        const membership = await ctx.db
          .query("channelMembers")
          .withIndex("by_channel_user", (q) =>
            q.eq("channelId", channel._id).eq("userId", user._id)
          )
          .first();

        if (membership && membership.canRead) {
          return {
            id: channel._id,
            name: channel.name,
            description: channel.description,
            isPrivate: channel.isPrivate,
          };
        }

        return null;
      })
    );

    return channels.filter((c) => c !== null);
  },
});

export const remove = mutation({
  args: {
    channelId: v.id("channels"),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");
    if (user.role !== "admin") throw new Error("Admin access required");

    const channel = await ctx.db.get(args.channelId);
    if (!channel) throw new Error("Channel not found");

    // Delete all messages in the channel
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    
    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    // Delete all channel members
    const members = await ctx.db
      .query("channelMembers")
      .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
      .collect();
    
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    // Delete the channel
    await ctx.db.delete(args.channelId);

    return { deleted: true };
  },
});

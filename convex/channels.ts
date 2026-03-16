import { v } from "convex/values";
import { query } from "./_generated/server";
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

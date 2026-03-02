// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function getUserFromSession(ctx: any, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", token))
    .unique();

  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  const user = await ctx.db.get(session.userId);
  if (!user || user.status !== "approved") {
    return null;
  }

  return user;
}

export const listChannels = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const channels = await ctx.db.query("channels").order("asc").collect();
    return {
      ok: true,
      channels: channels.map((channel) => ({
        id: channel._id,
        name: channel.name,
        description: channel.description
      }))
    };
  }
});

export const createChannel = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    description: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };
    if (user.role !== "admin") return { ok: false, code: 403, error: "Admin required" };

    const name = args.name.trim().toLowerCase();
    if (!/^([a-z0-9-]{2,32})$/.test(name)) {
      return { ok: false, code: 400, error: "Invalid channel name" };
    }

    const existing = await ctx.db
      .query("channels")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) {
      return { ok: false, code: 409, error: "Channel already exists" };
    }

    const id = await ctx.db.insert("channels", {
      name,
      description: args.description.trim().slice(0, 300),
      createdBy: user._id,
      createdAt: Date.now()
    });

    return { ok: true, channelId: id };
  }
});

export const listMessages = query({
  args: {
    sessionToken: v.string(),
    channelId: v.id("channels")
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const rows = await ctx.db
      .query("messages")
      .withIndex("by_channel_created", (q) => q.eq("channelId", args.channelId))
      .take(200);

    const messages = await Promise.all(
      rows.map(async (row) => {
        const author = await ctx.db.get(row.userId);
        return {
          id: row._id,
          content: row.content,
          channelId: row.channelId,
          createdAt: row.createdAt,
          author: author?.username ?? "unknown"
        };
      })
    );

    return { ok: true, messages };
  }
});

export const sendMessage = mutation({
  args: {
    sessionToken: v.string(),
    channelId: v.id("channels"),
    content: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const content = args.content.trim();
    if (content.length === 0 || content.length > 4000) {
      return { ok: false, code: 400, error: "Message must be 1-4000 chars" };
    }

    const messageId = await ctx.db.insert("messages", {
      channelId: args.channelId,
      userId: user._id,
      content,
      createdAt: Date.now()
    });

    return { ok: true, messageId };
  }
});

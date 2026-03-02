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

        // aggregate reactions: emoji → { count, byMe }
        const reactionRows = await ctx.db
          .query("reactions")
          .withIndex("by_message", (q: any) => q.eq("messageId", row._id))
          .collect();

        const map = new Map<string, { count: number; byMe: boolean }>();
        for (const r of reactionRows) {
          const cur = map.get(r.emoji) ?? { count: 0, byMe: false };
          map.set(r.emoji, { count: cur.count + 1, byMe: cur.byMe || r.userId === user._id });
        }
        const reactions = Array.from(map.entries()).map(([emoji, d]) => ({
          emoji, count: d.count, byMe: d.byMe
        }));

        return {
          id: row._id,
          content: row.deleted ? "" : row.content,
          deleted: !!row.deleted,
          editedAt: row.editedAt ?? null,
          channelId: row.channelId,
          createdAt: row.createdAt,
          author: author?.username ?? "unknown",
          isMe: row.userId === user._id,
          replyToId: row.replyToId ?? null,
          replyToContent: row.replyToContent ?? null,
          replyToAuthor: row.replyToAuthor ?? null,
          reactions
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
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    replyToContent: v.optional(v.string()),
    replyToAuthor: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const content = args.content.trim();
    if (content.length === 0 || content.length > 4000) {
      return { ok: false, code: 400, error: "Message must be 1-4000 chars" };
    }

    const data: any = {
      channelId: args.channelId,
      userId: user._id,
      content,
      createdAt: Date.now()
    };
    if (args.replyToId) {
      data.replyToId = args.replyToId;
      data.replyToContent = (args.replyToContent ?? "").slice(0, 200);
      data.replyToAuthor = args.replyToAuthor ?? "";
    }

    const messageId = await ctx.db.insert("messages", data);
    return { ok: true, messageId };
  }
});

export const editMessage = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("messages"),
    content: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const msg = await ctx.db.get(args.messageId);
    if (!msg) return { ok: false, code: 404, error: "Message not found" };
    if (msg.userId !== user._id) return { ok: false, code: 403, error: "You can only edit your own messages" };
    if (msg.deleted) return { ok: false, code: 400, error: "Cannot edit a deleted message" };

    const content = args.content.trim();
    if (content.length === 0 || content.length > 4000) {
      return { ok: false, code: 400, error: "Message must be 1–4000 characters" };
    }

    await ctx.db.patch(args.messageId, { content, editedAt: Date.now() });
    return { ok: true };
  }
});


  args: {
    sessionToken: v.string(),
    messageId: v.id("messages")
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const msg = await ctx.db.get(args.messageId);
    if (!msg) return { ok: false, code: 404, error: "Message not found" };
    if (msg.userId !== user._id && user.role !== "admin") {
      return { ok: false, code: 403, error: "Forbidden" };
    }

    await ctx.db.patch(args.messageId, { deleted: true, content: "" });
    return { ok: true };
  }
});

export const toggleReaction = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("messages"),
    emoji: v.string()
  },
  handler: async (ctx, args) => {
    const user = await getUserFromSession(ctx, args.sessionToken);
    if (!user) return { ok: false, code: 401, error: "Unauthorized" };

    const ALLOWED = ["👍","❤️","😂","😮","😢","😡","🔥","👏","🎉","🤔","😍","💯","✅","👀","🙌","😅","💀","🤣","🥳","💪"];
    if (!ALLOWED.includes(args.emoji)) {
      return { ok: false, code: 400, error: "Invalid emoji" };
    }

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q: any) =>
        q.eq("messageId", args.messageId).eq("userId", user._id).eq("emoji", args.emoji)
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      await ctx.db.insert("reactions", {
        messageId: args.messageId,
        userId: user._id,
        emoji: args.emoji,
        createdAt: Date.now()
      });
    }

    return { ok: true };
  }
});

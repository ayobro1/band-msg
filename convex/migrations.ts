import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const createUser = mutation({
  args: {
    username: v.string(),
    email: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    googleId: v.optional(v.string()),
    role: v.string(),
    presenceStatus: v.string(),
    lastSeen: v.number(),
    needsUsernameSetup: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", args);
  },
});

export const createSession = mutation({
  args: {
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", args);
  },
});

export const createChannel = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    isPrivate: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("channels", args);
  },
});

export const createChannelMember = mutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
    canRead: v.boolean(),
    canWrite: v.boolean(),
    isMuted: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("channelMembers", args);
  },
});

export const createMessage = mutation({
  args: {
    channelId: v.id("channels"),
    userId: v.id("users"),
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", args);
  },
});

export const createReaction = mutation({
  args: {
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("reactions", args);
  },
});

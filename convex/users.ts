import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;
const RESERVED_USERNAMES = new Set([
  "admin",
  "api",
  "auth",
  "bot",
  "channel",
  "channels",
  "events",
  "help",
  "login",
  "logout",
  "message",
  "messages",
  "mod",
  "moderator",
  "owner",
  "profile",
  "push",
  "register",
  "root",
  "security",
  "server",
  "servers",
  "settings",
  "signup",
  "support",
  "system",
  "typing",
  "users",
]);

function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username) || username.startsWith("bot_") || username.startsWith("bot-");
}

export const updateProfile = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!user) throw new Error("Unauthorized");

    const updates: Record<string, any> = {};
    if (args.username !== undefined) {
      const username = args.username.trim().toLowerCase();
      if (!USERNAME_PATTERN.test(username)) {
        throw new Error("Invalid username");
      }
      if (isReservedUsername(username)) {
        throw new Error("Username is reserved");
      }

      const existingUser = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username))
        .first();

      if (existingUser && existingUser._id !== user._id) {
        throw new Error("Username already exists");
      }

      updates.username = username;
    }
    if (args.bio !== undefined) updates.bio = args.bio;

    await ctx.db.patch(user._id, updates);
    return { success: true };
  },
});

export const getUserProfile = query({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const currentUser = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!currentUser) return null;

    let targetUserId = args.userId;
    if (!targetUserId) {
      targetUserId = currentUser._id;
    }

    const user = await ctx.db.get(targetUserId);
    if (!user) return null;

    return {
      username: user.username,
      bio: user.bio || null,
      role: user.role,
      presenceStatus: user.presenceStatus,
    };
  },
});

export const createReport = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!user) throw new Error("Unauthorized");

    const reportId = await ctx.db.insert("reports", {
      userId: user._id,
      message: args.message,
      createdAt: Date.now(),
      status: "pending",
    });

    return { success: true, reportId };
  },
});

export const getReports = internalQuery({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) return [];

    if (user.role !== "admin") {
      return [];
    }

    const reports = await ctx.db
      .query("reports")
      .order("desc")
      .collect();

    const reportsWithUsers = await Promise.all(
      reports.map(async (report) => {
        const reportUser = await ctx.db.get(report.userId);
        return {
          ...report,
          username: reportUser?.username || "Unknown",
        };
      })
    );

    return reportsWithUsers;
  },
});

export const resolveReport = internalMutation({
  args: {
    sessionToken: v.string(),
    reportId: v.id("reports"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    if (user.role !== "admin") {
      throw new Error("Only admins can resolve reports");
    }

    await ctx.db.patch(args.reportId, { status: args.status });
    return { success: true };
  },
});

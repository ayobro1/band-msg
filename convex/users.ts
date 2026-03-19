import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

export const updateProfile = mutation({
  args: {
    sessionToken: v.string(),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    const updates: Record<string, any> = {};
    if (args.username !== undefined) updates.username = args.username;
    if (args.bio !== undefined) updates.bio = args.bio;
    if (args.location !== undefined) updates.location = args.location;

    await ctx.db.patch(user._id, updates);
    return { success: true };
  },
});

export const getUserProfile = query({
  args: {
    sessionToken: v.string(),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const currentUser = await getUserByToken(ctx, args.sessionToken);
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
      location: user.location || null,
      role: user.role,
      presenceStatus: user.presenceStatus,
    };
  },
});

export const createReport = mutation({
  args: {
    sessionToken: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
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

export const getReports = query({
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

export const resolveReport = mutation({
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

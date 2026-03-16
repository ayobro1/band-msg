import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";

export async function getUserByToken(ctx: QueryCtx, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (!session || session.expiresAt < Date.now()) {
    return null;
  }

  return await ctx.db.get(session.userId);
}

export const getUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) return null;

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      needsUsernameSetup: user.needsUsernameSetup || false,
    };
  },
});

// Admin: Get all users
export const getAllUsers = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const users = await ctx.db.query("users").collect();
    return users.map(u => ({
      id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      needsUsernameSetup: u.needsUsernameSetup || false,
    }));
  },
});

// Admin: Get pending users
export const getPendingUsers = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return users.map(u => ({
      id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    }));
  },
});

// Admin: Approve user
export const approveUser = mutation({
  args: { 
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.userId, { status: "approved" });
    return { success: true };
  },
});

// Admin: Reject user
export const rejectUser = mutation({
  args: { 
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.userId, { status: "rejected" });
    return { success: true };
  },
});

// Admin: Promote user to admin
export const promoteUser = mutation({
  args: { 
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.userId, { role: "admin" });
    return { success: true };
  },
});

// Admin: Demote user to member
export const demoteUser = mutation({
  args: { 
    sessionToken: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.userId, { role: "member" });
    return { success: true };
  },
});

// Register new user
export const register = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    
    // Check if username already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    
    if (existing) {
      throw new Error("Username already exists");
    }

    // Create signup request first
    const requestId = await ctx.db.insert("signupRequests", {
      username,
      status: "approved", // Auto-approve
      createdAt: Date.now(),
      approvedAt: Date.now(),
    });

    // Check if this is the first user (bootstrap admin)
    const allUsers = await ctx.db.query("users").collect();
    const approvedAdmins = allUsers.filter(u => u.role === "admin" && u.status === "approved");
    const isFirstUser = approvedAdmins.length === 0;

    const userId = await ctx.db.insert("users", {
      username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: isFirstUser ? "admin" : "member",
      status: "approved", // Auto-approve all users
      createdAt: Date.now(),
      presenceStatus: "offline",
      lastSeen: Date.now(),
    });

    return {
      id: userId,
      username,
      role: isFirstUser ? "admin" : "member",
      status: "approved",
      requestId,
    };
  },
});

// Login user
export const login = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!user || user.passwordHash !== args.passwordHash) {
      throw new Error("Invalid username or password");
    }

    if (user.status !== "approved") {
      throw new Error("Account pending approval");
    }

    // Create session
    await ctx.db.insert("sessions", {
      token: args.sessionToken,
      userId: user._id,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    return {
      id: user._id,
      username: user.username,
      role: user.role,
      status: user.status,
      needsUsernameSetup: user.needsUsernameSetup || false,
    };
  },
});

// Get login salt
export const getLoginSalt = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    return user?.passwordSalt || null;
  },
});

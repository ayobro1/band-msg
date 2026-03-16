import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";

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

// Register new user - only creates signup request, not the user
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

    // Check if signup request already exists
    const existingRequest = await ctx.db
      .query("signupRequests")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();
    
    if (existingRequest) {
      throw new Error("Signup request already exists");
    }

    // Check if this is the first user (bootstrap admin)
    const allUsers = await ctx.db.query("users").collect();
    const approvedAdmins = allUsers.filter(u => u.role === "admin" && u.status === "approved");
    const isFirstUser = approvedAdmins.length === 0;

    if (isFirstUser) {
      // First user - create immediately as admin
      const userId = await ctx.db.insert("users", {
        username,
        passwordHash: args.passwordHash,
        passwordSalt: args.passwordSalt,
        role: "admin",
        status: "approved",
        createdAt: Date.now(),
        presenceStatus: "offline",
        lastSeen: Date.now(),
      });

      // Create approved signup request for tracking
      const requestId = await ctx.db.insert("signupRequests", {
        username,
        passwordHash: args.passwordHash,
        passwordSalt: args.passwordSalt,
        status: "approved",
        createdAt: Date.now(),
        approvedAt: Date.now(),
      });

      return {
        id: userId,
        username,
        role: "admin",
        status: "approved",
        requestId,
      };
    } else {
      // Create user with pending status so they can login and see their approval state
      const userId = await ctx.db.insert("users", {
        username,
        passwordHash: args.passwordHash,
        passwordSalt: args.passwordSalt,
        role: "member",
        status: "pending",
        createdAt: Date.now(),
        presenceStatus: "offline",
        lastSeen: Date.now(),
      });

      // Also create signup request for tracking
      const requestId = await ctx.db.insert("signupRequests", {
        username,
        passwordHash: args.passwordHash,
        passwordSalt: args.passwordSalt,
        status: "pending",
        createdAt: Date.now(),
      });

      return {
        id: userId,
        username,
        role: "member",
        status: "pending",
        requestId,
      };
    }
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

    // Create session (allow both approved and pending users to get sessions)
    await ctx.db.insert("sessions", {
      token: args.sessionToken,
      userId: user._id,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    // Set user to online
    await ctx.db.patch(user._id, {
      presenceStatus: "online",
      lastSeen: Date.now(),
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

// Update user presence status
export const updatePresence = mutation({
  args: {
    sessionToken: v.string(),
    status: v.string(), // "online" | "idle" | "dnd" | "offline"
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) throw new Error("Unauthorized");

    await ctx.db.patch(user._id, {
      presenceStatus: args.status,
      lastSeen: Date.now(),
    });

    return { success: true };
  },
});

// Heartbeat to keep user online
export const heartbeat = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken);
    if (!user) return { success: false };

    await ctx.db.patch(user._id, {
      presenceStatus: "online",
      lastSeen: Date.now(),
    });

    return { success: true };
  },
});

// Admin: Manually approve user by username
export const approveUserByUsername = mutation({
  args: {
    sessionToken: v.string(),
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username.trim().toLowerCase()))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    await ctx.db.patch(user._id, {
      status: "approved",
    });

    return { success: true, userId: user._id };
  },
});

// Sync external user and session (e.g. from Google Auth)
export const syncExternalUser = mutation({
  args: {
    username: v.string(),
    externalId: v.string(),
    role: v.string(),
    status: v.string(),
    needsUsernameSetup: v.boolean(),
    sessionToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();

    // Check if user exists by username
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (user) {
      // Update existing user
      await ctx.db.patch(user._id, {
        googleId: args.externalId,
        role: args.role as any,
        status: args.status as any,
        needsUsernameSetup: args.needsUsernameSetup,
      });
    } else {
      // Create new user
      const userId = await ctx.db.insert("users", {
        username,
        googleId: args.externalId,
        role: args.role as any,
        status: args.status as any,
        needsUsernameSetup: args.needsUsernameSetup,
        presenceStatus: "offline",
        lastSeen: Date.now(),
        createdAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    }

    if (!user) throw new Error("Failed to sync user");

    // Check for existing session
    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (!existingSession) {
      // Create session
      await ctx.db.insert("sessions", {
        token: args.sessionToken,
        userId: user._id,
        expiresAt: args.expiresAt,
        createdAt: Date.now(),
      });
    }

    return {
      userId: user._id,
      username: user.username,
      role: user.role,
      status: user.status,
    };
  },
});

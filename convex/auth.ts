import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from "./_generated/server";

const SESSION_INVALID_BEFORE_MS = 1774415633930;
const AUTH_BRIDGE_SECRET = process.env.AUTH_BRIDGE_SECRET;
const DUMMY_PASSWORD_SALT = "00000000000000000000000000000000";
const LOGIN_ACCOUNT_MAX_ATTEMPTS = 10;
const LOGIN_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

function isPasswordResetEnabled() {
  return (process.env.AUTH_PASSWORD_RESET_ENABLED ?? "false").toLowerCase() === "true";
}

function requireBridgeSecret(serverSecret: string) {
  if (!AUTH_BRIDGE_SECRET) {
    throw new Error("AUTH_BRIDGE_SECRET is not configured");
  }

  if (serverSecret !== AUTH_BRIDGE_SECRET) {
    throw new Error("Unauthorized");
  }
}

async function consumeAuthRateLimit(
  ctx: MutationCtx,
  key: string,
  maxAttempts: number,
  windowMs: number
) {
  const now = Date.now();
  const current = await ctx.db
    .query("authRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (!current || current.resetAt < now) {
    if (current) {
      await ctx.db.patch(current._id, {
        count: 1,
        resetAt: now + windowMs,
      });
    } else {
      await ctx.db.insert("authRateLimits", {
        key,
        count: 1,
        resetAt: now + windowMs,
      });
    }

    return { allowed: true as const };
  }

  if (current.count >= maxAttempts) {
    return {
      allowed: false as const,
      retryAfterMs: Math.max(0, current.resetAt - now),
    };
  }

  await ctx.db.patch(current._id, {
    count: current.count + 1,
  });

  return { allowed: true as const };
}

async function clearAuthRateLimit(ctx: MutationCtx, key: string) {
  const current = await ctx.db
    .query("authRateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (current) {
    await ctx.db.delete(current._id);
  }
}

async function getValidPasswordResetToken(ctx: QueryCtx, tokenHash: string) {
  if (!isPasswordResetEnabled()) {
    return null;
  }

  const resetToken = await ctx.db
    .query("passwordResetTokens")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < Date.now()) {
    return null;
  }

  return resetToken;
}

// Debug function to check session and user
export const debugSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    console.log('[debugSession] Checking session token:', args.sessionToken.substring(0, 10) + '...');
    
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();
    
    console.log('[debugSession] Session found:', !!session);
    if (session) {
      const blockedByCutoff = (session.createdAt ?? 0) < SESSION_INVALID_BEFORE_MS;
      console.log('[debugSession] Session details:', {
        userId: session.userId,
        expiresAt: session.expiresAt,
        expired: session.expiresAt < Date.now(),
        createdAt: session.createdAt,
        blockedByCutoff,
      });

      if (session.expiresAt < Date.now() || blockedByCutoff) {
        return {
          sessionValid: false,
          sessionExpired: session.expiresAt < Date.now(),
          user: null,
        };
      }
      
      const user = await ctx.db.get(session.userId);
      console.log('[debugSession] User found:', !!user);
      if (user) {
        console.log('[debugSession] User details:', {
          id: user._id,
          username: user.username,
          role: user.role,
          status: user.status
        });
        
        return {
          sessionValid: true,
          sessionExpired: session.expiresAt < Date.now(),
          user: {
            id: user._id,
            username: user.username,
            role: user.role,
            status: user.status
          }
        };
      }
    }
    
    return {
      sessionValid: false,
      sessionExpired: false,
      user: null
    };
  },
});

export async function getUserByToken(ctx: QueryCtx, token: string, userAgentHash?: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (
    !session ||
    session.expiresAt < Date.now() ||
    (session.createdAt ?? 0) < SESSION_INVALID_BEFORE_MS ||
    (userAgentHash !== undefined && session.userAgentHash !== userAgentHash)
  ) {
    return null;
  }

  return await ctx.db.get(session.userId);
}

export const getUser = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!user) return null;

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status || "pending", // CRITICAL: Must return status for approval flow
      needsUsernameSetup: user.needsUsernameSetup || false,
    };
  },
});

// Get all approved users (for member list)
export const getApprovedUsers = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!user) {
      throw new Error("Unauthorized");
    }

    const users = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("status"), "approved"))
      .collect();

    return users.map(u => ({
      id: u._id,
      username: u.username,
      role: u.role,
      presenceStatus: u.presenceStatus || "offline",
    }));
  },
});

// Admin: Get all users
export const getAllUsers = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const users = await ctx.db.query("users").collect();
    return users.map(u => ({
      id: u._id,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status || "pending",
      presenceStatus: u.presenceStatus || "offline",
      createdAt: u.createdAt,
      needsUsernameSetup: u.needsUsernameSetup || false,
    }));
  },
});

// Admin: Get pending users
export const getPendingUsers = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
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
    userAgentHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    // Get the user to find their username
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Update user status
    await ctx.db.patch(args.userId, { status: "approved" });

    // Also update any corresponding signup request
    const signupRequest = await ctx.db
      .query("signupRequests")
      .withIndex("by_username", (q) => q.eq("username", user.username))
      .first();

    if (signupRequest && signupRequest.status === "pending") {
      await ctx.db.patch(signupRequest._id, {
        status: "approved",
        approvedAt: Date.now(),
        approvedBy: admin._id,
      });
    }

    return { success: true };
  },
});

// Admin: Reject user
export const rejectUser = mutation({
  args: { 
    sessionToken: v.string(),
    userAgentHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
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
    userAgentHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
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
    userAgentHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.userId, { role: "member" });
    return { success: true };
  },
});

// Admin: Remove user completely
export const removeUser = mutation({
  args: { 
    sessionToken: v.string(),
    userAgentHash: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    // Don't allow removing yourself
    if (admin._id === args.userId) {
      throw new Error("Cannot remove yourself");
    }

    // Delete user's sessions
    const sessions = await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
    
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Delete the user
    await ctx.db.delete(args.userId);
    
    return { success: true };
  },
});

// Register new user - only creates signup request, not the user
export const register = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);
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
    userAgentHash: v.string(),
    expiresAt: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);
    const username = args.username.trim().toLowerCase();
    const loginKey = `login-user:${username}`;
    const rateLimit = await consumeAuthRateLimit(
      ctx,
      loginKey,
      LOGIN_ACCOUNT_MAX_ATTEMPTS,
      LOGIN_ACCOUNT_WINDOW_MS
    );

    if (!rateLimit.allowed) {
      throw new Error("Too many login attempts, try again later");
    }
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!user || !user.passwordHash || user.passwordHash !== args.passwordHash) {
      throw new Error("Invalid username or password");
    }

    // Create session (allow both approved and pending users to get sessions)
    await ctx.db.insert("sessions", {
      token: args.sessionToken,
      userAgentHash: args.userAgentHash,
      userId: user._id,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    // Set user to online
    await ctx.db.patch(user._id, {
      presenceStatus: "online",
      lastSeen: Date.now(),
    });

    await clearAuthRateLimit(ctx, loginKey);

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
  args: { username: v.string(), serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);
    const username = args.username.trim().toLowerCase();
    
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    return typeof user?.passwordSalt === "string" ? user.passwordSalt : DUMMY_PASSWORD_SALT;
  },
});

export const refreshSession = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (
      !session ||
      session.expiresAt < Date.now() ||
      (session.createdAt ?? 0) < SESSION_INVALID_BEFORE_MS ||
      session.userAgentHash !== args.userAgentHash
    ) {
      return { ok: false };
    }

    await ctx.db.patch(session._id, {
      expiresAt: args.expiresAt,
    });

    return { ok: true };
  },
});

export const removeSession = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (session && session.userAgentHash === args.userAgentHash) {
      await ctx.db.delete(session._id);
    }

    return { ok: true };
  },
});

export const createPasswordResetToken = mutation({
  args: {
    username: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isPasswordResetEnabled()) {
      return { userFound: false };
    }

    requireBridgeSecret(args.serverSecret);
    const username = args.username.trim().toLowerCase();

    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!user) {
      return { userFound: false };
    }

    const existingTokens = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const token of existingTokens) {
      const isExpired = token.expiresAt < Date.now();
      const isUsed = !!token.usedAt;
      if (isExpired || isUsed) {
        await ctx.db.delete(token._id);
      } else {
        await ctx.db.patch(token._id, {
          usedAt: Date.now(),
        });
      }
    }

    await ctx.db.insert("passwordResetTokens", {
      userId: user._id,
      tokenHash: args.tokenHash,
      expiresAt: args.expiresAt,
      createdAt: Date.now(),
    });

    return {
      userFound: true,
      username: user.username,
    };
  },
});

export const resetPasswordWithToken = mutation({
  args: {
    tokenHash: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    if (!isPasswordResetEnabled()) {
      throw new Error("This reset link is invalid or has expired");
    }

    requireBridgeSecret(args.serverSecret);
    const resetToken = await getValidPasswordResetToken(ctx, args.tokenHash);

    if (!resetToken) {
      throw new Error("This reset link is invalid or has expired");
    }

    const user = await ctx.db.get(resetToken.userId);
    if (!user) {
      throw new Error("This reset link is invalid or has expired");
    }

    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
    });

    await ctx.db.patch(resetToken._id, {
      usedAt: Date.now(),
    });

    const sessions = await ctx.db
      .query("sessions")
      .collect();

    for (const session of sessions) {
      if (session.userId === user._id) {
        await ctx.db.delete(session._id);
      }
    }

    return { success: true };
  },
});

export const validatePasswordResetToken = query({
  args: {
    tokenHash: v.string(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);

    const resetToken = await getValidPasswordResetToken(ctx, args.tokenHash);

    return {
      valid: !!resetToken,
    };
  },
});

// Update user presence status
export const updatePresence = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    status: v.string(), // "online" | "idle" | "dnd" | "offline"
  },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
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
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!user) return { success: false };

    await ctx.db.patch(user._id, {
      presenceStatus: "online",
      lastSeen: Date.now(),
    });

    return { success: true };
  },
});

// Admin: Manually approve user by username
export const approveUserByUsername = internalMutation({
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
    userAgentHash: v.string(),
    expiresAt: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);
    const username = args.username.trim().toLowerCase();

    // Resolve by username first, then by bound external identity.
    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!user && args.externalId) {
      user = await ctx.db
        .query("users")
        .withIndex("by_google_id", (q) => q.eq("googleId", args.externalId))
        .first();
    }

    if (user) {
      if (user.googleId && args.externalId && user.googleId !== args.externalId) {
        throw new Error("External identity mismatch");
      }

      // Never trust caller-supplied role/status for public sync operations.
      await ctx.db.patch(user._id, {
        googleId: user.googleId || args.externalId,
        needsUsernameSetup: user.needsUsernameSetup || args.needsUsernameSetup,
      });
    } else {
      // New externally-synced accounts always start as pending members.
      const userId = await ctx.db.insert("users", {
        username,
        googleId: args.externalId,
        role: "member",
        status: "pending",
        needsUsernameSetup: true,
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
        userAgentHash: args.userAgentHash,
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

export const syncExternalSession = mutation({
  args: {
    username: v.string(),
    externalId: v.string(),
    sessionToken: v.string(),
    userAgentHash: v.string(),
    expiresAt: v.number(),
    serverSecret: v.string(),
  },
  handler: async (ctx, args) => {
    requireBridgeSecret(args.serverSecret);
    const username = args.username.trim().toLowerCase();

    let user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!user && args.externalId) {
      user = await ctx.db
        .query("users")
        .withIndex("by_google_id", (q) => q.eq("googleId", args.externalId))
        .first();
    }

    if (!user) {
      throw new Error("User not found");
    }

    if (user.googleId && args.externalId && user.googleId !== args.externalId) {
      throw new Error("External identity mismatch");
    }

    if (args.externalId && !user.googleId) {
      await ctx.db.patch(user._id, {
        googleId: args.externalId,
      });
    }

    const existingSession = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .first();

    if (!existingSession) {
      await ctx.db.insert("sessions", {
        token: args.sessionToken,
        userAgentHash: args.userAgentHash,
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
      needsUsernameSetup: user.needsUsernameSetup || false,
    };
  },
});

// Fix all admin users to have approved status (run once)
export const fixAdminStatus = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    const admins = allUsers.filter(u => u.role === "admin");

    console.log('[fixAdminStatus] Found admins:', admins.length);

    for (const admin of admins) {
      console.log('[fixAdminStatus] Updating admin:', admin.username, 'current status:', admin.status);
      await ctx.db.patch(admin._id, {
        status: "approved",
      });
    }

    return { 
      success: true, 
      updated: admins.length,
      admins: admins.map(a => ({ username: a.username, oldStatus: a.status }))
    };
  },
});

// Make all users admin (emergency fix)
export const makeAllUsersAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    
    console.log('[makeAllUsersAdmin] Found users:', allUsers.length);

    for (const user of allUsers) {
      console.log('[makeAllUsersAdmin] Making admin:', user.username, 'current role:', user.role);
      await ctx.db.patch(user._id, {
        role: "admin",
        status: "approved",
      });
    }

    return { 
      success: true, 
      updated: allUsers.length,
      users: allUsers.map(u => ({ username: u.username, oldRole: u.role, oldStatus: u.status }))
    };
  },
});

// Make only NolanC admin, everyone else member
export const makeOnlyNolanCAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allUsers = await ctx.db.query("users").collect();
    
    console.log('[makeOnlyNolanCAdmin] Found users:', allUsers.length);

    for (const user of allUsers) {
      const shouldBeAdmin = user.username.toLowerCase() === 'nolanc';
      const newRole = shouldBeAdmin ? 'admin' : 'member';
      
      console.log('[makeOnlyNolanCAdmin] User:', user.username, 'should be admin:', shouldBeAdmin, 'setting role:', newRole);
      
      await ctx.db.patch(user._id, {
        role: newRole,
        status: "approved",
      });
    }

    return { 
      success: true, 
      updated: allUsers.length,
      users: allUsers.map(u => ({ 
        username: u.username, 
        oldRole: u.role, 
        newRole: u.username.toLowerCase() === 'nolanc' ? 'admin' : 'member'
      }))
    };
  },
});

export const purgeUsersByUsernameFragmentBatch = internalMutation({
  args: {
    sessionToken: v.string(),
    fragment: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const fragment = args.fragment.trim().toLowerCase();
    if (fragment.length < 2) {
      throw new Error("Fragment must be at least 2 characters");
    }

    const limit = Math.max(1, Math.min(args.limit ?? 200, 250));
    const allUsers = await ctx.db.query("users").collect();
    const matchingUsers = allUsers
      .filter((user) => user.username.toLowerCase().includes(fragment))
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

    const targets = matchingUsers.slice(0, limit);
    const remainingUsers = Math.max(matchingUsers.length - targets.length, 0);

    if (targets.length === 0) {
      return {
        deletedUsers: 0,
        remainingUsers: 0,
        deleted: {
          signupRequests: 0,
          sessions: 0,
          passwordResetTokens: 0,
          pushSubscriptions: 0,
          reports: 0,
          events: 0,
          typing: 0,
          channelMembers: 0,
          reactions: 0,
          messages: 0,
          channels: 0,
          users: 0,
        },
      };
    }

    const targetUserIds = new Set(targets.map((user) => user._id));
    const targetUsernames = new Set(targets.map((user) => user.username.toLowerCase()));

    const channels = await ctx.db.query("channels").collect();
    const targetChannels = channels.filter((channel) => targetUserIds.has(channel.createdBy));
    const targetChannelIds = new Set(targetChannels.map((channel) => channel._id));

    const messages = await ctx.db.query("messages").collect();
    const targetMessages = messages.filter(
      (message) => targetUserIds.has(message.userId) || targetChannelIds.has(message.channelId)
    );
    const targetMessageIds = new Set(targetMessages.map((message) => message._id));

    const reactions = await ctx.db.query("reactions").collect();
    const targetReactions = reactions.filter(
      (reaction) => targetUserIds.has(reaction.userId) || targetMessageIds.has(reaction.messageId)
    );

    const channelMembers = await ctx.db.query("channelMembers").collect();
    const targetChannelMembers = channelMembers.filter(
      (member) => targetUserIds.has(member.userId) || targetChannelIds.has(member.channelId)
    );

    const typingRows = await ctx.db.query("typing").collect();
    const targetTypingRows = typingRows.filter(
      (typing) => targetUserIds.has(typing.userId) || targetChannelIds.has(typing.channelId)
    );

    const pushSubscriptions = await ctx.db.query("pushSubscriptions").collect();
    const targetPushSubscriptions = pushSubscriptions.filter((subscription) =>
      targetUserIds.has(subscription.userId)
    );

    const passwordResetTokens = await ctx.db.query("passwordResetTokens").collect();
    const targetPasswordResetTokens = passwordResetTokens.filter((token) =>
      targetUserIds.has(token.userId)
    );

    const sessions = await ctx.db.query("sessions").collect();
    const targetSessions = sessions.filter((session) => targetUserIds.has(session.userId));

    const reports = await ctx.db.query("reports").collect();
    const targetReports = reports.filter((report) => targetUserIds.has(report.userId));

    const events = await ctx.db.query("events").collect();
    const targetEvents = events.filter((event) => targetUserIds.has(event.createdBy));

    const signupRequests = await ctx.db.query("signupRequests").collect();
    const targetSignupRequests = signupRequests.filter((request) =>
      targetUsernames.has(request.username.toLowerCase())
    );

    for (const reaction of targetReactions) {
      await ctx.db.delete(reaction._id);
    }
    for (const typing of targetTypingRows) {
      await ctx.db.delete(typing._id);
    }
    for (const member of targetChannelMembers) {
      await ctx.db.delete(member._id);
    }
    for (const subscription of targetPushSubscriptions) {
      await ctx.db.delete(subscription._id);
    }
    for (const token of targetPasswordResetTokens) {
      await ctx.db.delete(token._id);
    }
    for (const session of targetSessions) {
      await ctx.db.delete(session._id);
    }
    for (const report of targetReports) {
      await ctx.db.delete(report._id);
    }
    for (const event of targetEvents) {
      await ctx.db.delete(event._id);
    }
    for (const message of targetMessages) {
      await ctx.db.delete(message._id);
    }
    for (const channel of targetChannels) {
      await ctx.db.delete(channel._id);
    }
    for (const user of targets) {
      await ctx.db.delete(user._id);
    }
    for (const request of targetSignupRequests) {
      await ctx.db.delete(request._id);
    }

    return {
      deletedUsers: targets.length,
      remainingUsers,
      usernames: targets.slice(0, 10).map((user) => user.username),
      deleted: {
        signupRequests: targetSignupRequests.length,
        sessions: targetSessions.length,
        passwordResetTokens: targetPasswordResetTokens.length,
        pushSubscriptions: targetPushSubscriptions.length,
        reports: targetReports.length,
        events: targetEvents.length,
        typing: targetTypingRows.length,
        channelMembers: targetChannelMembers.length,
        reactions: targetReactions.length,
        messages: targetMessages.length,
        channels: targetChannels.length,
        users: targets.length,
      },
    };
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserByToken } from "./auth";

// Create a signup request
export const create = mutation({
  args: {
    username: v.string(),
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();

    // Check if request already exists
    const existing = await ctx.db
      .query("signupRequests")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (existing) {
      return { requestId: existing._id, status: existing.status };
    }

    // Create new signup request
    const requestId = await ctx.db.insert("signupRequests", {
      username,
      status: "pending",
      createdAt: Date.now(),
    });

    return { requestId, status: "pending" };
  },
});

// Get all pending signup requests (admin only)
export const getPending = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const requests = await ctx.db
      .query("signupRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("desc")
      .collect();

    return requests.map(r => ({
      id: r._id,
      username: r.username,
      status: r.status,
      createdAt: r.createdAt,
    }));
  },
});

// Get all signup requests (admin only)
export const getAll = query({
  args: { sessionToken: v.string(), userAgentHash: v.string() },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const requests = await ctx.db
      .query("signupRequests")
      .order("desc")
      .take(100);

    return requests.map(r => ({
      id: r._id,
      username: r.username,
      status: r.status,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      approvedBy: r.approvedBy,
    }));
  },
});

// Approve a signup request (admin only) - creates the user account
export const approve = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    requestId: v.id("signupRequests"),
  },
  handler: async (ctx, args) => {
    console.log('[signupRequests.approve] ========== START ==========');
    console.log('[signupRequests.approve] Request ID:', args.requestId);
    
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    console.log('[signupRequests.approve] Admin:', admin?._id, 'Role:', admin?.role);
    
    if (!admin || admin.role !== "admin") {
      console.error('[signupRequests.approve] Unauthorized - not admin');
      throw new Error("Unauthorized");
    }

    const request = await ctx.db.get(args.requestId);
    console.log('[signupRequests.approve] Request:', request);
    
    if (!request) {
      console.error('[signupRequests.approve] Request not found');
      throw new Error("Request not found");
    }

    if (request.status === "approved") {
      console.log('[signupRequests.approve] Request already approved');
      throw new Error("Request already approved");
    }

    if (!request.passwordHash || !request.passwordSalt) {
      console.error('[signupRequests.approve] Missing password data');
      throw new Error("Cannot approve: signup request missing password data");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", request.username))
      .first();

    console.log('[signupRequests.approve] Existing user:', existingUser?._id);

    if (existingUser) {
      console.log('[signupRequests.approve] Updating existing user status to approved');
      await ctx.db.patch(existingUser._id, {
        status: "approved",
      });
      console.log('[signupRequests.approve] ✓ User status updated');
    } else {
      console.log('[signupRequests.approve] Creating new user account');
      const newUserId = await ctx.db.insert("users", {
        username: request.username,
        passwordHash: request.passwordHash,
        passwordSalt: request.passwordSalt,
        role: "member",
        status: "approved",
        createdAt: Date.now(),
        presenceStatus: "offline",
        lastSeen: Date.now(),
      });
      console.log('[signupRequests.approve] ✓ New user created:', newUserId);
    }

    // Update the signup request
    console.log('[signupRequests.approve] Updating signup request status');
    await ctx.db.patch(args.requestId, {
      status: "approved",
      approvedAt: Date.now(),
      approvedBy: admin._id,
    });
    console.log('[signupRequests.approve] ✓ Signup request updated');

    console.log('[signupRequests.approve] ========== SUCCESS ==========');
    return { success: true };
  },
});

// Reject a signup request (admin only)
export const reject = mutation({
  args: {
    sessionToken: v.string(),
    userAgentHash: v.string(),
    requestId: v.id("signupRequests"),
  },
  handler: async (ctx, args) => {
    const admin = await getUserByToken(ctx, args.sessionToken, args.userAgentHash);
    if (!admin || admin.role !== "admin") {
      throw new Error("Unauthorized");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Request not found");
    }

    await ctx.db.patch(args.requestId, {
      status: "rejected",
      approvedAt: Date.now(),
      approvedBy: admin._id,
    });

    return { success: true };
  },
});

// Check if a signup request is approved
export const checkStatus = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();

    const request = await ctx.db
      .query("signupRequests")
      .withIndex("by_username", (q) => q.eq("username", username))
      .first();

    if (!request) {
      return { status: "not_found" };
    }

    return { status: request.status };
  },
});

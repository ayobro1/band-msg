// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const register = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string()
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,20}$/.test(username)) {
      return { ok: false, code: 400, error: "Invalid username format" };
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();
    if (existing) {
      return { ok: false, code: 409, error: "Username already exists" };
    }

    const users = await ctx.db.query("users").collect();
    const hasApprovedAdmin = users.some((user: any) => user.role === "admin" && user.status === "approved");
    const bootstrapAdmin = !hasApprovedAdmin;

    const userId = await ctx.db.insert("users", {
      username,
      passwordHash: args.passwordHash,
      passwordSalt: args.passwordSalt,
      role: bootstrapAdmin ? "admin" : "member",
      status: bootstrapAdmin ? "approved" : "pending",
      createdAt: Date.now()
    });

    const user = await ctx.db.get(userId);
    return {
      ok: true,
      user: {
        id: user!._id,
        username: user!.username,
        role: user!.role,
        status: user!.status
      }
    };
  }
});

export const login = mutation({
  args: {
    username: v.string(),
    passwordHash: v.string(),
    sessionToken: v.string(),
    expiresAt: v.number()
  },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user || user.passwordHash !== args.passwordHash) {
      return { ok: false, code: 401, error: "Invalid username or password" };
    }

    if (user.status !== "approved") {
      return { ok: false, code: 403, error: "Account pending approval" };
    }

    await ctx.db.insert("sessions", {
      token: args.sessionToken,
      userId: user._id,
      expiresAt: args.expiresAt,
      createdAt: Date.now()
    });

    return {
      ok: true,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        status: user.status
      }
    };
  }
});

export const getLoginSalt = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user) {
      return null;
    }

    return { salt: user.passwordSalt };
  }
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (session) {
      await ctx.db.delete(session._id);
    }
    return { ok: true };
  }
});

export const me = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();

    if (!session || session.expiresAt <= Date.now()) {
      return null;
    }

    const user = await ctx.db.get(session.userId);
    if (!user || user.status !== "approved") {
      return null;
    }

    return {
      id: user._id,
      username: user.username,
      role: user.role,
      status: user.status
    };
  }
});

export const consumeRateLimit = mutation({
  args: {
    key: v.string(),
    maxAttempts: v.number(),
    windowMs: v.number()
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (!row || row.resetAt < now) {
      if (row) {
        await ctx.db.patch(row._id, { count: 1, resetAt: now + args.windowMs });
      } else {
        await ctx.db.insert("rateLimits", {
          key: args.key,
          count: 1,
          resetAt: now + args.windowMs
        });
      }
      return { allowed: true };
    }

    if (row.count >= args.maxAttempts) {
      return { allowed: false, retryAfterMs: Math.max(0, row.resetAt - now) };
    }

    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { allowed: true };
  }
});

export const clearRateLimit = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (row) {
      await ctx.db.delete(row._id);
    }
    return { ok: true };
  }
});

async function getApprovedAdminBySession(ctx: any, sessionToken: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q: any) => q.eq("token", sessionToken))
    .unique();
  if (!session || session.expiresAt <= Date.now()) return null;

  const user = await ctx.db.get(session.userId);
  if (!user || user.status !== "approved" || user.role !== "admin") return null;
  return user;
}

export const listPendingUsers = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const admin = await getApprovedAdminBySession(ctx, args.sessionToken);
    if (!admin) return { ok: false, code: 403, error: "Admin access required" };

    const rows = await ctx.db.query("users").collect();
    const users = rows
      .filter((u: any) => u.status === "pending")
      .map((u: any) => ({
        id: u._id,
        username: u.username,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt
      }));

    return { ok: true, users };
  }
});

export const approveUser = mutation({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const admin = await getApprovedAdminBySession(ctx, args.sessionToken);
    if (!admin) return { ok: false, code: 403, error: "Admin access required" };

    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user) return { ok: false, code: 404, error: "User not found" };
    await ctx.db.patch(user._id, { status: "approved" });

    return { ok: true };
  }
});

export const promoteUser = mutation({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const admin = await getApprovedAdminBySession(ctx, args.sessionToken);
    if (!admin) return { ok: false, code: 403, error: "Admin access required" };

    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user) return { ok: false, code: 404, error: "User not found" };
    await ctx.db.patch(user._id, { role: "admin", status: "approved" });
    return { ok: true };
  }
});

export const demoteUser = mutation({
  args: { sessionToken: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    const admin = await getApprovedAdminBySession(ctx, args.sessionToken);
    if (!admin) return { ok: false, code: 403, error: "Admin access required" };

    const username = args.username.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", username))
      .unique();

    if (!user) return { ok: false, code: 404, error: "User not found" };
    if (user._id === admin._id) {
      return { ok: false, code: 400, error: "Cannot demote yourself" };
    }

    const approvedAdmins = (await ctx.db.query("users").collect()).filter(
      (u: any) => u.role === "admin" && u.status === "approved"
    );
    if (user.role === "admin" && approvedAdmins.length <= 1) {
      return { ok: false, code: 400, error: "Cannot demote last admin" };
    }

    await ctx.db.patch(user._id, { role: "member" });
    return { ok: true };
  }
});

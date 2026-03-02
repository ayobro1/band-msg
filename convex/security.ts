// @ts-nocheck
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const enforceSecurityInvariants = query({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    const now = Date.now();
    const valid = sessions.filter((s) => s.expiresAt > now).length;
    return {
      sessionCount: sessions.length,
      validSessionCount: valid,
      expiredSessionCount: sessions.length - valid
    };
  }
});

export const purgeExpiredSessions = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const sessions = await ctx.db.query("sessions").collect();
    let deleted = 0;

    for (const session of sessions) {
      if (session.expiresAt <= now) {
        await ctx.db.delete(session._id);
        deleted += 1;
      }
    }

    return { deleted };
  }
});

export const rotateSession = mutation({
  args: {
    oldToken: v.string(),
    newToken: v.string(),
    expiresAt: v.number()
  },
  handler: async (ctx, args) => {
    const oldSession = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.oldToken))
      .unique();

    if (!oldSession) {
      return { ok: false };
    }

    await ctx.db.insert("sessions", {
      token: args.newToken,
      userId: oldSession.userId,
      expiresAt: args.expiresAt,
      createdAt: Date.now()
    });
    await ctx.db.delete(oldSession._id);

    return { ok: true };
  }
});

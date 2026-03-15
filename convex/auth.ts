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

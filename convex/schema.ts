import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    passwordHash: v.string(),
    passwordSalt: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    status: v.union(v.literal("approved"), v.literal("pending")),
    createdAt: v.number()
  }).index("by_username", ["username"]),
  sessions: defineTable({
    token: v.string(),
    userId: v.id("users"),
    expiresAt: v.number(),
    createdAt: v.number()
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),
  rateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number()
  }).index("by_key", ["key"]),
  channels: defineTable({
    name: v.string(),
    description: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number()
  }).index("by_name", ["name"]),
  messages: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    content: v.string(),
    createdAt: v.number()
  })
    .index("by_channel", ["channelId"])
    .index("by_channel_created", ["channelId", "createdAt"])
});

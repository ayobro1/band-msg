import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    username: v.string(),
    email: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    googleId: v.optional(v.string()),
    role: v.string(), // "admin" | "member"
    status: v.optional(v.string()), // "approved" | "pending" | "rejected" - optional for backwards compatibility
    presenceStatus: v.string(), // "online" | "idle" | "dnd" | "offline"
    lastSeen: v.number(),
    createdAt: v.optional(v.number()),
    needsUsernameSetup: v.optional(v.boolean()),
    bio: v.optional(v.string()),
    location: v.optional(v.string()),
  })
    .index("by_username", ["username"])
    .index("by_email", ["email"])
    .index("by_google_id", ["googleId"])
    .index("by_status", ["status"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    userAgentHash: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  passwordResetTokens: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),

  authRateLimits: defineTable({
    key: v.string(),
    count: v.number(),
    resetAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_reset_at", ["resetAt"]),

  channels: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isPrivate: v.boolean(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  }),

  channelMembers: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    canRead: v.boolean(),
    canWrite: v.boolean(),
    isMuted: v.boolean(),
  })
    .index("by_channel", ["channelId"])
    .index("by_user", ["userId"])
    .index("by_channel_user", ["channelId", "userId"]),

  messages: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    content: v.string(),
    replyToId: v.optional(v.id("messages")),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_channel", ["channelId", "createdAt"])
    .index("by_reply_to", ["replyToId"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user", ["messageId", "userId"]),

  typing: defineTable({
    channelId: v.id("channels"),
    userId: v.id("users"),
    expiresAt: v.number(),
  })
    .index("by_channel", ["channelId"])
    .index("by_expires", ["expiresAt"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dhKey: v.string(),
    authKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  signupRequests: defineTable({
    username: v.string(),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    status: v.string(), // "pending" | "approved" | "rejected"
    createdAt: v.number(),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.id("users")),
  })
    .index("by_username", ["username"])
    .index("by_status", ["status", "createdAt"]),

  events: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startsAt: v.number(),
    endsAt: v.number(),
    createdBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_created_by", ["createdBy"])
    .index("by_starts_at", ["startsAt"]),

  reports: defineTable({
    userId: v.id("users"),
    message: v.string(),
    createdAt: v.number(),
    status: v.optional(v.string()), // "pending" | "reviewed" | "resolved"
  })
    .index("by_status", ["status"])
    .index("by_created_at", ["createdAt"]),
});

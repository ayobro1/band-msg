import { ConvexClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import postgres from "postgres";
import { config } from "dotenv";

// Load environment variables
config({ path: ".env.local" });

const CONVEX_URL = process.env.PUBLIC_CONVEX_URL || "https://oceanic-barracuda-40.convex.cloud";
const DATABASE_URL = process.env.DATABASE_URL!;

console.log("Connecting to Convex:", CONVEX_URL);
console.log("Connecting to Neon:", DATABASE_URL ? "✓" : "✗");

const convex = new ConvexClient(CONVEX_URL);
const sql = postgres(DATABASE_URL, { ssl: 'require' });

async function migrate() {
  console.log("Starting migration from Neon to Convex...");

  // 1. Migrate users
  console.log("\n1. Migrating users...");
  const users = await sql`SELECT * FROM users`;
  const userIdMap = new Map<string, string>();

  for (const user of users) {
    try {
      const convexUserId = await convex.mutation(api.migrations.createUser, {
        username: user.username,
        email: user.email || undefined,
        passwordHash: user.password_hash || undefined,
        passwordSalt: user.password_salt || undefined,
        googleId: user.google_id || undefined,
        role: user.role,
        presenceStatus: user.presence_status || "offline",
        lastSeen: user.last_seen ? Number(user.last_seen) : Date.now(),
        needsUsernameSetup: user.needs_username_setup || false,
      });
      userIdMap.set(user.id, convexUserId);
      console.log(`  ✓ Migrated user: ${user.username}`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate user ${user.username}:`, error);
    }
  }

  // 2. Migrate sessions
  console.log("\n2. Migrating sessions...");
  const sessions = await sql`SELECT * FROM sessions WHERE expires_at > EXTRACT(EPOCH FROM NOW()) * 1000`;
  
  for (const session of sessions) {
    const convexUserId = userIdMap.get(session.user_id);
    if (!convexUserId) continue;

    try {
      await convex.mutation(api.migrations.createSession, {
        userId: convexUserId,
        token: session.token,
        expiresAt: Number(session.expires_at),
      });
      console.log(`  ✓ Migrated session for user ${session.user_id}`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate session:`, error);
    }
  }

  // 3. Migrate channels
  console.log("\n3. Migrating channels...");
  const channels = await sql`SELECT * FROM channels`;
  const channelIdMap = new Map<string, string>();

  for (const channel of channels) {
    const convexCreatorId = userIdMap.get(channel.created_by);
    if (!convexCreatorId) continue;

    try {
      const convexChannelId = await convex.mutation(api.migrations.createChannel, {
        name: channel.name,
        description: channel.description,
        isPrivate: channel.is_private,
        createdBy: convexCreatorId,
        createdAt: Number(channel.created_at),
      });
      channelIdMap.set(channel.id, convexChannelId);
      console.log(`  ✓ Migrated channel: ${channel.name}`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate channel ${channel.name}:`, error);
    }
  }

  // 4. Migrate channel members
  console.log("\n4. Migrating channel members...");
  const members = await sql`SELECT * FROM channel_members`;
  
  for (const member of members) {
    const convexUserId = userIdMap.get(member.user_id);
    const convexChannelId = channelIdMap.get(member.channel_id);
    if (!convexUserId || !convexChannelId) continue;

    try {
      await convex.mutation(api.migrations.createChannelMember, {
        channelId: convexChannelId,
        userId: convexUserId,
        canRead: member.can_read,
        canWrite: member.can_write,
        isMuted: member.is_muted,
      });
      console.log(`  ✓ Migrated member for channel ${member.channel_id}`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate member:`, error);
    }
  }

  // 5. Migrate messages
  console.log("\n5. Migrating messages...");
  const messages = await sql`SELECT * FROM messages ORDER BY created_at ASC`;
  const messageIdMap = new Map<string, string>();

  for (const message of messages) {
    const convexUserId = userIdMap.get(message.user_id);
    const convexChannelId = channelIdMap.get(message.channel_id);
    if (!convexUserId || !convexChannelId) continue;

    try {
      const convexMessageId = await convex.mutation(api.migrations.createMessage, {
        channelId: convexChannelId,
        userId: convexUserId,
        content: message.content,
        replyToId: message.reply_to_id ? messageIdMap.get(message.reply_to_id) : undefined,
        createdAt: Number(message.created_at),
      });
      messageIdMap.set(message.id, convexMessageId);
      console.log(`  ✓ Migrated message ${message.id}`);
    } catch (error) {
      console.error(`  ✗ Failed to migrate message ${message.id}:`, error);
    }
  }

  // 6. Migrate reactions
  console.log("\n6. Migrating reactions...");
  try {
    const reactions = await sql`SELECT * FROM reactions`;
    
    for (const reaction of reactions) {
      const convexUserId = userIdMap.get(reaction.user_id);
      const convexMessageId = messageIdMap.get(reaction.message_id);
      if (!convexUserId || !convexMessageId) continue;

      try {
        await convex.mutation(api.migrations.createReaction, {
          messageId: convexMessageId,
          userId: convexUserId,
          emoji: reaction.emoji,
        });
        console.log(`  ✓ Migrated reaction`);
      } catch (error) {
        console.error(`  ✗ Failed to migrate reaction:`, error);
      }
    }
  } catch (error: any) {
    if (error.code === '42P01') {
      console.log("  ⚠ Reactions table doesn't exist in Neon, skipping...");
    } else {
      throw error;
    }
  }

  console.log("\n✅ Migration complete!");
  await sql.end();
  convex.close();
}

migrate().catch(console.error);

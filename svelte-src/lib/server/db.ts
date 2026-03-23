import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { ensureServerEnv } from "./env";

type AppUser = {
  id: string;
  username: string;
  role: "admin" | "member";
  status: "approved" | "pending";
  avatarUrl?: string;
  presenceStatus?: "online" | "idle" | "dnd" | "offline";
  customStatus?: string;
};

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: number; error: string };

let sqlClient: ReturnType<typeof neon> | null = null;

function getSqlClient() {
  if (!sqlClient) {
    ensureServerEnv();

    // Try multiple sources for DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL || 
                       process.env.POSTGRES_URL ||
                       process.env.POSTGRES_PRISMA_URL;
    
    if (!databaseUrl) {
      console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES')));
      throw new Error("Missing DATABASE_URL environment variable");
    }
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

export { getSqlClient };
const sql = (strings: TemplateStringsArray, ...params: any[]): Promise<Record<string, any>[]> =>
  getSqlClient()(strings, ...params) as Promise<Record<string, any>[]>;
let initPromise: Promise<void> | null = null;

const USERNAME_PATTERN = /^[a-z0-9_-]{3,20}$/;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function toAppUser(row: any): AppUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status
  };
}

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as any).code === "23505";
}

async function ensureDb(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Core users table with Discord-like features
        await sql`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            password_salt TEXT,
            role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
            status TEXT NOT NULL CHECK (status IN ('approved', 'pending')),
            avatar_url TEXT,
            presence_status TEXT DEFAULT 'offline' CHECK (presence_status IN ('online', 'idle', 'dnd', 'offline')),
            custom_status TEXT,
            google_id TEXT UNIQUE,
            last_seen_at BIGINT,
            created_at BIGINT NOT NULL
          )
        `;
        
        // Add google_id column if it doesn't exist (migration)
        try {
          await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE`;
          await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`;
          await sql`ALTER TABLE users ALTER COLUMN password_salt DROP NOT NULL`;
          await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS needs_username_setup BOOLEAN DEFAULT FALSE`;
        } catch (e) {
          // Column might already exist, ignore error
          console.log('Migration note:', e);
        }

      // Sessions table
      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;

      // Rate limits table
      await sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at BIGINT NOT NULL
        )
      `;

      // Servers/Guilds table
      await sql`
        CREATE TABLE IF NOT EXISTS servers (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          icon_url TEXT,
          owner_id TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL
        )
      `;

      // Server members with roles
      await sql`
        CREATE TABLE IF NOT EXISTS server_members (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role_id TEXT,
          nickname TEXT,
          joined_at BIGINT NOT NULL,
          UNIQUE(server_id, user_id)
        )
      `;

      // Custom roles table
      await sql`
        CREATE TABLE IF NOT EXISTS roles (
          id TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#99AAB5',
          permissions BIGINT DEFAULT 0,
          position INTEGER DEFAULT 0,
          created_at BIGINT NOT NULL
        )
      `;

      // Enhanced channels table with server support and types
      await sql`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          channel_type TEXT DEFAULT 'text' CHECK (channel_type IN ('text', 'voice', 'private', 'announcement')),
          category TEXT,
          is_private BOOLEAN DEFAULT false,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL
        )
      `;

      // Channel members for private channels
      await sql`
        CREATE TABLE IF NOT EXISTS channel_members (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          can_read BOOLEAN DEFAULT true,
          can_write BOOLEAN DEFAULT true,
          added_at BIGINT NOT NULL,
          UNIQUE(channel_id, user_id)
        )
      `;

      // Messages table
      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          content TEXT NOT NULL,
          is_edited BOOLEAN DEFAULT false,
          edited_at BIGINT,
          reply_to_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
          created_at BIGINT NOT NULL
        )
      `;

      // Message attachments
      await sql`
        CREATE TABLE IF NOT EXISTS message_attachments (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          url TEXT NOT NULL,
          size_bytes BIGINT NOT NULL,
          mime_type TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;

      // Message reactions
      await sql`
        CREATE TABLE IF NOT EXISTS message_reactions (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          emoji TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          UNIQUE(message_id, user_id, emoji)
        )
      `;

      // Typing indicators
      await sql`
        CREATE TABLE IF NOT EXISTS typing_indicators (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          started_at BIGINT NOT NULL,
          UNIQUE(channel_id, user_id)
        )
      `;

      // Server invites
      await sql`
        CREATE TABLE IF NOT EXISTS invites (
          code TEXT PRIMARY KEY,
          server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
          channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
          created_by TEXT NOT NULL REFERENCES users(id),
          max_uses INTEGER DEFAULT 0,
          current_uses INTEGER DEFAULT 0,
          expires_at BIGINT,
          created_at BIGINT NOT NULL
        )
      `;

      // Calendar events
      await sql`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
          channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT,
          location TEXT,
          starts_at BIGINT NOT NULL,
          ends_at BIGINT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL
        )
      `;

      // Event attendees
      await sql`
        CREATE TABLE IF NOT EXISTS event_attendees (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT DEFAULT 'pending' CHECK (status IN ('attending', 'maybe', 'declined', 'pending')),
          created_at BIGINT NOT NULL,
          UNIQUE(event_id, user_id)
        )
      `;

      // Channel notification settings
      await sql`
        CREATE TABLE IF NOT EXISTS channel_notification_settings (
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          muted BOOLEAN DEFAULT false,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (channel_id, user_id)
        )
      `;

      // Push notifications subscriptions
      await sql`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint TEXT NOT NULL,
          p256dh_key TEXT NOT NULL,
          auth_key TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          UNIQUE(user_id, endpoint)
        )
      `;

      // Indexes for performance
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels (created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel_id, created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_users_status_role ON users (status, role)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_server_members_server ON server_members (server_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_server_members_user ON server_members (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions (message_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_typing_indicators_channel ON typing_indicators (channel_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_calendar_events_starts ON calendar_events (starts_at)`;
      
      // Helper function to check if column exists
      const columnExists = async (table: string, column: string): Promise<boolean> => {
        try {
          const result = await sql`
            SELECT EXISTS (
              SELECT 1 
              FROM information_schema.columns 
              WHERE table_name = ${table} 
              AND column_name = ${column}
            ) as exists
          `;
          return result[0]?.exists || false;
        } catch (e) {
          return false;
        }
      };
      
      // Migration: Add presence columns to users if they don't exist
      if (!(await columnExists('users', 'presence_status'))) {
        await sql`
          ALTER TABLE users 
          ADD COLUMN presence_status TEXT DEFAULT 'offline'
        `;
        try {
          await sql`
            ALTER TABLE users
            ADD CONSTRAINT users_presence_status_check 
            CHECK (presence_status IN ('online', 'idle', 'dnd', 'offline'))
          `;
        } catch(e) {
          // Constraint might already exist
        }
      }

      if (!(await columnExists('users', 'custom_status'))) {
        await sql`ALTER TABLE users ADD COLUMN custom_status TEXT`;
      }

      if (!(await columnExists('users', 'last_seen_at'))) {
        await sql`ALTER TABLE users ADD COLUMN last_seen_at BIGINT`;
      }
      
      // Migration: Add server_id column to channels if it doesn't exist
      if (!(await columnExists('channels', 'server_id'))) {
        await sql`
          ALTER TABLE channels 
          ADD COLUMN server_id TEXT
        `;
      }

      // Migration: Add channel_type column to channels if it doesn't exist
      if (!(await columnExists('channels', 'channel_type'))) {
        await sql`
          ALTER TABLE channels 
          ADD COLUMN channel_type TEXT DEFAULT 'text'
        `;
        
        try {
          await sql`
            ALTER TABLE channels
            ADD CONSTRAINT channels_channel_type_check 
            CHECK (channel_type IN ('text', 'voice', 'private', 'announcement'))
          `;
        } catch (e) {
            // Constraint might already exist
        }
      }

      // Migration: Add category column to channels if it doesn't exist
      if (!(await columnExists('channels', 'category'))) {
        await sql`ALTER TABLE channels ADD COLUMN category TEXT`;
      }

      // Migration: Add is_private column to channels if it doesn't exist
      if (!(await columnExists('channels', 'is_private'))) {
        await sql`ALTER TABLE channels ADD COLUMN is_private BOOLEAN DEFAULT false`;
      }

      // Migration: Add server_id column to invites if it doesn't exist
      if (!(await columnExists('invites', 'server_id'))) {
        await sql`ALTER TABLE invites ADD COLUMN server_id TEXT`;
      }

      // Migration: Add server_id column to calendar_events if it doesn't exist
      if (!(await columnExists('calendar_events', 'server_id'))) {
        await sql`ALTER TABLE calendar_events ADD COLUMN server_id TEXT`;
      }
      
      // Create default server for migration
      const serverRows = await sql`SELECT id FROM servers LIMIT 1`;
      if (serverRows.length === 0) {
        // Get first approved admin or create system server
        const adminRows = await sql`
          SELECT id FROM users 
          WHERE role = 'admin' AND status = 'approved' 
          LIMIT 1
        `;
        
        const defaultServerId = crypto.randomUUID();
        if (adminRows.length > 0) {
          await sql`
            INSERT INTO servers (id, name, description, owner_id, created_at)
            VALUES (${defaultServerId}, 'Band Chat', 'Default server', ${adminRows[0].id}, ${Date.now()})
          `;
        } else {
          // No admin yet, use first user or leave owner_id null temporarily
          const userRows = await sql`SELECT id FROM users LIMIT 1`;
          if (userRows.length > 0) {
            await sql`
              INSERT INTO servers (id, name, description, owner_id, created_at)
              VALUES (${defaultServerId}, 'Band Chat', 'Default server', ${userRows[0].id}, ${Date.now()})
            `;
          }
        }
        
        // Migrate existing channels to default server
        await sql`UPDATE channels SET server_id = ${defaultServerId} WHERE server_id IS NULL`;
        
        // Migrate existing invites to default server
        await sql`UPDATE invites SET server_id = ${defaultServerId} WHERE server_id IS NULL`;
        
        // Migrate existing calendar events to default server
        await sql`UPDATE calendar_events SET server_id = ${defaultServerId} WHERE server_id IS NULL`;
        
        // Add foreign key constraint if it doesn't exist
        try {
          await sql`
            ALTER TABLE channels
            ADD CONSTRAINT channels_server_id_fkey 
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
          `;
        } catch (e) {
          // Constraint might already exist, ignore error
        }
      } else {
        // Migrate any channels without server_id to first server
        const firstServer = serverRows[0];
        await sql`UPDATE channels SET server_id = ${firstServer.id} WHERE server_id IS NULL`;
        
        // Migrate any invites without server_id to first server
        await sql`UPDATE invites SET server_id = ${firstServer.id} WHERE server_id IS NULL`;
        
        // Migrate any calendar events without server_id to first server
        await sql`UPDATE calendar_events SET server_id = ${firstServer.id} WHERE server_id IS NULL`;
        
        // Try to add foreign key constraint
        try {
          await sql`
            ALTER TABLE channels
            ADD CONSTRAINT channels_server_id_fkey 
            FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
          `;
        } catch (e) {
          // Constraint might already exist, ignore error
        }
      }

      // Create indices on server_id columns now that migrations are complete
      try {
        await sql`CREATE INDEX IF NOT EXISTS idx_channels_server ON channels (server_id)`;
      } catch (e) {
        // Index might already exist or column might not exist yet
      }

      try {
        await sql`CREATE INDEX IF NOT EXISTS idx_invites_server ON invites (server_id)`;
      } catch (e) {
        // Index might already exist or column might not exist yet
      }

      try {
        await sql`CREATE INDEX IF NOT EXISTS idx_calendar_events_server ON calendar_events (server_id)`;
      } catch (e) {
        // Index might already exist or column might not exist yet
      }

      } catch (err) {
        initPromise = null; // Reset on failure so we can try again
        console.error("Database initialization failed:", err);
        throw err;
      }
    })();
  }

  await initPromise;
}

async function countApprovedAdmins(): Promise<number> {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE role = 'admin' AND status = 'approved'
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function consumeRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<{ allowed: boolean; retryAfterMs?: number }> {
  await ensureDb();

  const now = Date.now();
  const rows = await sql`SELECT count, reset_at FROM rate_limits WHERE key = ${key}`;
  const current = rows[0];

  if (!current || Number(current.reset_at) < now) {
    await sql`
      INSERT INTO rate_limits (key, count, reset_at)
      VALUES (${key}, 1, ${now + windowMs})
      ON CONFLICT (key)
      DO UPDATE SET count = 1, reset_at = ${now + windowMs}
    `;
    return { allowed: true };
  }

  const count = Number(current.count);
  const resetAt = Number(current.reset_at);

  if (count >= maxAttempts) {
    return { allowed: false, retryAfterMs: Math.max(0, resetAt - now) };
  }

  await sql`UPDATE rate_limits SET count = ${count + 1} WHERE key = ${key}`;
  return { allowed: true };
}

export async function clearRateLimit(key: string): Promise<void> {
  await ensureDb();
  await sql`DELETE FROM rate_limits WHERE key = ${key}`;
}

export async function registerUser(args: {
  username: string;
  passwordHash: string;
  passwordSalt: string;
}): Promise<Result<AppUser>> {
  await ensureDb();

  const username = normalizeUsername(args.username);
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, code: 400, error: "Invalid username format" };
  }

  const bootstrapAdmin = (await countApprovedAdmins()) === 0;

  try {
    const rows = await sql`
      INSERT INTO users (id, username, password_hash, password_salt, role, status, created_at)
      VALUES (
        ${crypto.randomUUID()},
        ${username},
        ${args.passwordHash},
        ${args.passwordSalt},
        ${bootstrapAdmin ? "admin" : "member"},
        ${bootstrapAdmin ? "approved" : "pending"},
        ${Date.now()}
      )
      RETURNING id, username, role, status
    `;

    return { ok: true, value: toAppUser(rows[0]) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 409, error: "Username already exists" };
    }
    throw error;
  }
}

export async function getLoginSalt(usernameRaw: string): Promise<string | null> {
  await ensureDb();
  const username = normalizeUsername(usernameRaw);
  const rows = await sql`SELECT password_salt FROM users WHERE username = ${username} LIMIT 1`;
  return rows[0]?.password_salt ?? null;
}

export async function loginUser(args: {
  username: string;
  passwordHash: string;
  sessionToken: string;
  expiresAt: number;
}): Promise<Result<AppUser>> {
  await ensureDb();

  const username = normalizeUsername(args.username);
  const rows = await sql`
    SELECT id, username, password_hash, role, status
    FROM users
    WHERE username = ${username}
    LIMIT 1
  `;
  const user = rows[0];

  if (!user || user.password_hash !== args.passwordHash) {
    return { ok: false, code: 401, error: "Invalid username or password" };
  }

  // Bootstrap: if no approved admins exist, first login becomes admin
  if (user.status !== "approved") {
    const bootstrapAdmin = (await countApprovedAdmins()) === 0;
    if (bootstrapAdmin) {
      await sql`UPDATE users SET role = 'admin', status = 'approved' WHERE id = ${user.id}`;
      user.role = "admin";
      user.status = "approved";
    }
  }

  // Create session for all authenticated users (approved or pending)
  await sql`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (${args.sessionToken}, ${user.id}, ${args.expiresAt}, ${Date.now()})
  `;

  return { ok: true, value: toAppUser(user) };
}

export async function logoutSession(sessionToken: string): Promise<void> {
  await ensureDb();
  await sql`DELETE FROM sessions WHERE token = ${sessionToken}`;
}

/** Returns any authenticated user (approved or pending). Used for /api/auth/me so pending users can check their status. */
export async function getSessionUser(sessionToken: string): Promise<AppUser | null> {
  await ensureDb();
  const now = Date.now();

  const rows = await sql`
    SELECT u.id, u.username, u.role, u.status, u.needs_username_setup
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${sessionToken}
      AND s.expires_at > ${now}
    LIMIT 1
  `;

  if (!rows[0]) return null;

  const user = toAppUser(rows[0]);
  if (rows[0].needs_username_setup) {
    (user as any).needsUsernameSetup = true;
  }
  return user;
}

/** Returns only approved authenticated users. Used by all non-auth endpoints to gate access. */
export async function getUserBySession(sessionToken: string): Promise<AppUser | null> {
  await ensureDb();
  const now = Date.now();

  const rows = await sql`
    SELECT u.id, u.username, u.role, u.status, u.needs_username_setup
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${sessionToken}
      AND s.expires_at > ${now}
      AND u.status = 'approved'
    LIMIT 1
  `;

  if (!rows[0]) return null;
  
  const user = toAppUser(rows[0]);
  if (rows[0].needs_username_setup) {
    (user as any).needsUsernameSetup = true;
  }
  return user;
}

async function requireAdmin(sessionToken: string): Promise<Result<AppUser>> {
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }
  if (user.role !== "admin") {
    return { ok: false, code: 403, error: "Admin access required" };
  }
  return { ok: true, value: user };
}

export async function listChannels(sessionToken: string): Promise<Result<Array<{ id: string; name: string; description: string }>>> {
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  // Get all public channels AND private channels the user is a member of (or all if admin)
  const rows = await sql`
    SELECT c.id, c.name, c.description, c.is_private
    FROM channels c
    LEFT JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ${user.id}
    WHERE c.is_private = false OR ${user.role} = 'admin' OR cm.user_id IS NOT NULL
    ORDER BY c.created_at ASC
  `;
  const channelRows = rows as any[];

  return {
    ok: true,
    value: channelRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      isPrivate: row.is_private
    }))
  };
}

export async function createChannel(args: {
  sessionToken: string;
  name: string;
  description: string;
  isPrivate?: boolean;
  memberIds?: string[];
}): Promise<Result<{ channelId: string }>> {
  console.log('[createChannel] Starting channel creation:', { name: args.name, isPrivate: args.isPrivate });
  
  // Allow all authenticated users to create channels
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    console.log('[createChannel] User not found for session token');
    return { ok: false, code: 401, error: "Unauthorized" };
  }
  
  console.log('[createChannel] User authenticated:', { userId: user.id, username: user.username, role: user.role });

  const name = args.name.trim().toLowerCase();
  if (!/^([a-z0-9-]{2,32})$/.test(name)) {
    console.log('[createChannel] Invalid channel name:', name);
    return { ok: false, code: 400, error: "Invalid channel name" };
  }

  try {
    const id = crypto.randomUUID();
    const now = Date.now();
    
    console.log('[createChannel] Inserting channel into database:', { id, name, createdBy: user.id });
    
    await sql`
      INSERT INTO channels (id, name, description, is_private, created_by, created_at)
      VALUES (${id}, ${name}, ${args.description.trim().slice(0, 300)}, ${args.isPrivate}, ${user.id}, ${now})
    `;

    if (args.isPrivate) {
      console.log('[createChannel] Adding creator as member for private channel');
      // Add creator as member automatically
      const memberId = crypto.randomUUID();
      await sql`
        INSERT INTO channel_members (id, channel_id, user_id, can_read, can_write, added_at)
        VALUES (${memberId}, ${id}, ${user.id}, true, true, ${now})
      `;
      
      // Add selected members if provided
      if (args.memberIds && args.memberIds.length > 0) {
        console.log('[createChannel] Adding selected members:', args.memberIds);
        for (const userId of args.memberIds) {
          const memberIdForUser = crypto.randomUUID();
          await sql`
            INSERT INTO channel_members (id, channel_id, user_id, can_read, can_write, added_at)
            VALUES (${memberIdForUser}, ${id}, ${userId}, true, true, ${now})
          `;
        }
      }
    }

    console.log('[createChannel] Channel created successfully:', id);
    return { ok: true, value: { channelId: id } };
  } catch (error) {
    console.error('[createChannel] Error creating channel:', error);
    if (isUniqueViolation(error)) {
      return { ok: false, code: 409, error: "Channel already exists" };
    }
    throw error;
  }
}

export async function deleteChannel(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<{ ok: true }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const rows = await sql`SELECT id FROM channels WHERE id = ${args.channelId} LIMIT 1`;
  if (!rows[0]) {
    return { ok: false, code: 404, error: "Channel not found" };
  }

  await sql`DELETE FROM channels WHERE id = ${args.channelId}`;
  return { ok: true, value: { ok: true } };
}

export async function listMessages(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<Array<{ id: string; content: string; channelId: string; createdAt: number; author: string }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const channelRows = await sql`
    SELECT c.id, c.is_private, cm.user_id as member_id, cm.can_read
    FROM channels c
    LEFT JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ${user.id}
    WHERE c.id = ${args.channelId} LIMIT 1
  `;
  const channel = channelRows[0];
  
  if (!channel) {
    return { ok: false, code: 404, error: "Channel not found" };
  }

  if (channel.is_private && user.role !== "admin" && (!channel.member_id || !channel.can_read)) {
    return { ok: false, code: 403, error: "You don't have permission to read this channel" };
  }

  const rows = await sql`
    SELECT m.id, m.content, m.channel_id, m.created_at, u.username AS author
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ${args.channelId}
    ORDER BY m.created_at ASC
    LIMIT 200
  `;
  const messageRows = rows as any[];

  return {
    ok: true,
    value: messageRows.map((row) => ({
      id: row.id,
      content: row.content,
      channelId: row.channel_id,
      createdAt: Number(row.created_at),
      author: row.author
    }))
  };
}

export async function sendMessage(args: {
  sessionToken: string;
  channelId: string;
  content: string;
}): Promise<Result<{ messageId: string }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const content = args.content.trim();
  if (content.length === 0 || content.length > 4000) {
    return { ok: false, code: 400, error: "Message must be 1-4000 chars" };
  }

  const channelRows = await sql`
    SELECT c.id, c.is_private, cm.user_id as member_id, cm.can_write
    FROM channels c
    LEFT JOIN channel_members cm ON c.id = cm.channel_id AND cm.user_id = ${user.id}
    WHERE c.id = ${args.channelId} LIMIT 1
  `;
  const channel = channelRows[0];
  
  if (!channel) {
    return { ok: false, code: 404, error: "Channel not found" };
  }

  if (channel.is_private && user.role !== "admin" && (!channel.member_id || !channel.can_write)) {
    return { ok: false, code: 403, error: "You don't have permission to write in this channel" };
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO messages (id, channel_id, user_id, content, created_at)
    VALUES (${id}, ${args.channelId}, ${user.id}, ${content}, ${Date.now()})
  `;

  return { ok: true, value: { messageId: id } };
}

export async function deleteMessage(args: {
  sessionToken: string;
  messageId: string;
}): Promise<Result<{ deleted: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`SELECT id, user_id FROM messages WHERE id = ${args.messageId} LIMIT 1`;
  if (!rows[0]) {
    return { ok: false, code: 404, error: "Message not found" };
  }

  const msg = rows[0] as any;
  if (msg.user_id !== user.id && user.role !== "admin") {
    return { ok: false, code: 403, error: "You can only unsend your own messages" };
  }

  await sql`DELETE FROM messages WHERE id = ${args.messageId}`;

  return { ok: true, value: { deleted: true } };
}

export async function listPendingUsers(sessionToken: string): Promise<Result<Array<{ id: string; username: string; role: string; status: string; createdAt: number }>>> {
  const adminResult = await requireAdmin(sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const rows = await sql`
    SELECT id, username, role, status, created_at
    FROM users
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `;
  const pendingRows = rows as any[];

  return {
    ok: true,
    value: pendingRows.map((row) => ({
      id: row.id,
      username: row.username,
      role: row.role,
      status: row.status,
      createdAt: Number(row.created_at)
    }))
  };
}

export async function approveUser(args: { sessionToken: string; username: string }): Promise<Result<{ ok: true }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const username = normalizeUsername(args.username);
  const rows = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
  if (!rows[0]) {
    return { ok: false, code: 404, error: "User not found" };
  }

  await sql`UPDATE users SET status = 'approved' WHERE id = ${rows[0].id}`;
  return { ok: true, value: { ok: true } };
}

export async function promoteUser(args: { sessionToken: string; username: string }): Promise<Result<{ ok: true }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const username = normalizeUsername(args.username);
  const rows = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
  if (!rows[0]) {
    return { ok: false, code: 404, error: "User not found" };
  }

  await sql`UPDATE users SET role = 'admin', status = 'approved' WHERE id = ${rows[0].id}`;
  return { ok: true, value: { ok: true } };
}

export async function demoteUser(args: { sessionToken: string; username: string }): Promise<Result<{ ok: true }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const username = normalizeUsername(args.username);
  const rows = await sql`SELECT id, role, status FROM users WHERE username = ${username} LIMIT 1`;
  const target = rows[0];

  if (!target) {
    return { ok: false, code: 404, error: "User not found" };
  }

  if (target.id === adminResult.value.id) {
    return { ok: false, code: 400, error: "Cannot demote yourself" };
  }

  if (target.role === "admin" && target.status === "approved") {
    const rows = await sql`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE role = 'admin' AND status = 'approved'
    `;
    if (Number(rows[0]?.count ?? 0) <= 1) {
      return { ok: false, code: 400, error: "Cannot demote last admin" };
    }
  }

  await sql`UPDATE users SET role = 'member' WHERE id = ${target.id}`;
  return { ok: true, value: { ok: true } };
}

export async function rejectUser(args: { sessionToken: string; username: string }): Promise<Result<{ ok: true }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const username = normalizeUsername(args.username);
  const rows = await sql`SELECT id, status FROM users WHERE username = ${username} LIMIT 1`;
  const target = rows[0];

  if (!target) {
    return { ok: false, code: 404, error: "User not found" };
  }

  if (target.status !== "pending") {
    return { ok: false, code: 400, error: "User is not pending" };
  }

  // Delete sessions for the rejected user
  await sql`DELETE FROM sessions WHERE user_id = ${target.id}`;
  // Delete the pending user
  await sql`DELETE FROM users WHERE id = ${target.id}`;
  return { ok: true, value: { ok: true } };
}

// ============ MESSAGE REACTIONS ============

export async function addReaction(args: {
  sessionToken: string;
  messageId: string;
  emoji: string;
}): Promise<Result<{ reactionId: string }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const messageRows = await sql`SELECT id FROM messages WHERE id = ${args.messageId} LIMIT 1`;
  if (!messageRows[0]) {
    return { ok: false, code: 404, error: "Message not found" };
  }

  const id = crypto.randomUUID();
  try {
    await sql`
      INSERT INTO message_reactions (id, message_id, user_id, emoji, created_at)
      VALUES (${id}, ${args.messageId}, ${user.id}, ${args.emoji}, ${Date.now()})
    `;
    return { ok: true, value: { reactionId: id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 409, error: "Reaction already exists" };
    }
    throw error;
  }
}

export async function removeReaction(args: {
  sessionToken: string;
  messageId: string;
  emoji: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`
    DELETE FROM message_reactions
    WHERE message_id = ${args.messageId} AND user_id = ${user.id} AND emoji = ${args.emoji}
  `;
  return { ok: true, value: { ok: true } };
}

export async function getMessageReactions(args: {
  sessionToken: string;
  messageId: string;
}): Promise<Result<Array<{ emoji: string; users: string[]; count: number }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`
    SELECT r.emoji, u.username
    FROM message_reactions r
    JOIN users u ON u.id = r.user_id
    WHERE r.message_id = ${args.messageId}
    ORDER BY r.created_at ASC
  `;

  const reactionMap = new Map<string, string[]>();
  for (const row of rows as any[]) {
    const users = reactionMap.get(row.emoji) || [];
    users.push(row.username);
    reactionMap.set(row.emoji, users);
  }

  const reactions = Array.from(reactionMap.entries()).map(([emoji, users]) => ({
    emoji,
    users,
    count: users.length
  }));

  return { ok: true, value: reactions };
}

// ============ PRESENCE & TYPING ============

export async function updatePresence(args: {
  sessionToken: string;
  status: "online" | "idle" | "dnd" | "offline";
  customStatus?: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`
    UPDATE users
    SET presence_status = ${args.status},
        custom_status = ${args.customStatus || null},
        last_seen_at = ${Date.now()}
    WHERE id = ${user.id}
  `;

  return { ok: true, value: { ok: true } };
}

export async function startTyping(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO typing_indicators (id, channel_id, user_id, started_at)
    VALUES (${id}, ${args.channelId}, ${user.id}, ${Date.now()})
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET started_at = ${Date.now()}
  `;

  return { ok: true, value: { ok: true } };
}

export async function stopTyping(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`
    DELETE FROM typing_indicators
    WHERE channel_id = ${args.channelId} AND user_id = ${user.id}
  `;

  return { ok: true, value: { ok: true } };
}

export async function getTypingUsers(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<Array<{ username: string }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const fiveSecondsAgo = Date.now() - 5000;
  const rows = await sql`
    SELECT u.username
    FROM typing_indicators t
    JOIN users u ON u.id = t.user_id
    WHERE t.channel_id = ${args.channelId} AND t.started_at > ${fiveSecondsAgo} AND u.id != ${user.id}
  `;

  return { ok: true, value: rows.map((r: any) => ({ username: r.username })) };
}

// Clean old typing indicators (call periodically)
export async function cleanOldTypingIndicators(): Promise<void> {
  await ensureDb();
  const tenSecondsAgo = Date.now() - 10000;
  await sql`DELETE FROM typing_indicators WHERE started_at < ${tenSecondsAgo}`;
}

// ============ SERVERS/GUILDS ============

export async function listServers(sessionToken: string): Promise<Result<Array<{ id: string; name: string; description: string; iconUrl?: string }>>> {
  const user = await getUserBySession(sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`
    SELECT s.id, s.name, s.description, s.icon_url
    FROM servers s
    JOIN server_members m ON m.server_id = s.id
    WHERE m.user_id = ${user.id}
    ORDER BY s.created_at ASC
  `;

  return {
    ok: true,
    value: rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || '',
      iconUrl: r.icon_url
    }))
  };
}

// ============ MEMBERS ============

export async function listServerMembers(args: {
  sessionToken: string;
  serverId: string;
}): Promise<Result<Array<{ id: string; username: string; role: string; presenceStatus: string }>>> {
  await ensureDb();
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`
    SELECT u.id, u.username, u.role, u.presence_status
    FROM users u
    JOIN server_members m ON m.user_id = u.id
    WHERE m.server_id = ${args.serverId}
    ORDER BY
      CASE u.presence_status
        WHEN 'online' THEN 0
        WHEN 'idle' THEN 1
        WHEN 'dnd' THEN 2
        ELSE 3
      END,
      u.username ASC
  `;

  return {
    ok: true,
    value: (rows as any[]).map((r: any) => ({
      id: r.id,
      username: r.username,
      role: r.role,
      presenceStatus: r.presence_status || 'offline'
    }))
  };
}

// ============ INVITES ============

export async function createInvite(args: {
  sessionToken: string;
  serverId: string;
  maxUses?: number;
  expiresInMs?: number;
}): Promise<Result<{ code: string }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const code = crypto.randomBytes(8).toString('hex');
  const expiresAt = args.expiresInMs ? Date.now() + args.expiresInMs : null;

  await sql`
    INSERT INTO invites (code, server_id, channel_id, created_by, max_uses, current_uses, expires_at, created_at)
    VALUES (${code}, ${args.serverId}, NULL, ${user.id}, ${args.maxUses || 0}, 0, ${expiresAt}, ${Date.now()})
  `;

  return { ok: true, value: { code } };
}

export async function useInvite(args: {
  sessionToken: string;
  code: string;
}): Promise<Result<{ serverId: string }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`SELECT * FROM invites WHERE code = ${args.code} LIMIT 1`;
  const invite = rows[0];

  if (!invite) {
    return { ok: false, code: 404, error: "Invalid invite code" };
  }

  if (invite.expires_at && Number(invite.expires_at) < Date.now()) {
    return { ok: false, code: 400, error: "Invite expired" };
  }

  if (invite.max_uses > 0 && Number(invite.current_uses) >= invite.max_uses) {
    return { ok: false, code: 400, error: "Invite uses exceeded" };
  }

  const memberId = crypto.randomUUID();
  try {
    await sql`
      INSERT INTO server_members (id, server_id, user_id, joined_at)
      VALUES (${memberId}, ${invite.server_id}, ${user.id}, ${Date.now()})
    `;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 409, error: "Already a member" };
    }
    throw error;
  }

  await sql`UPDATE invites SET current_uses = current_uses + 1 WHERE code = ${args.code}`;

  return { ok: true, value: { serverId: invite.server_id } };
}

// ============ CALENDAR EVENTS ============

export async function createEvent(args: {
  sessionToken: string;
  serverId?: string;
  channelId?: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: number;
  endsAt: number;
}): Promise<Result<{ eventId: string }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO calendar_events (id, server_id, channel_id, title, description, location, starts_at, ends_at, created_by, created_at)
    VALUES (${id}, ${args.serverId || null}, ${args.channelId || null}, ${args.title}, ${args.description || ''}, ${args.location || ''}, ${args.startsAt}, ${args.endsAt}, ${user.id}, ${Date.now()})
  `;

  return { ok: true, value: { eventId: id } };
}

export async function listEvents(args: {
  sessionToken: string;
  serverId?: string;
  startDate?: number;
  endDate?: number;
}): Promise<Result<Array<{ id: string; title: string; description: string; startsAt: number; endsAt: number; location: string }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  let rows;
  if (args.serverId) {
    rows = await sql`
      SELECT id, title, description, location, starts_at, ends_at
      FROM calendar_events
      WHERE server_id = ${args.serverId}
      ORDER BY starts_at ASC
    `;
  } else {
    rows = await sql`
      SELECT id, title, description, location, starts_at, ends_at
      FROM calendar_events
      ORDER BY starts_at ASC
      LIMIT 100
    `;
  }

  return {
    ok: true,
    value: rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      description: r.description || '',
      location: r.location || '',
      startsAt: Number(r.starts_at),
      endsAt: Number(r.ends_at)
    }))
  };
}

export async function respondToEvent(args: {
  sessionToken: string;
  eventId: string;
  status: "attending" | "maybe" | "declined";
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO event_attendees (id, event_id, user_id, status, created_at)
    VALUES (${id}, ${args.eventId}, ${user.id}, ${args.status}, ${Date.now()})
    ON CONFLICT (event_id, user_id)
    DO UPDATE SET status = ${args.status}
  `;

  return { ok: true, value: { ok: true } };
}

// ============ PUSH NOTIFICATIONS ============

export async function savePushSubscription(args: {
  sessionToken: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  await sql`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh_key, auth_key, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${args.endpoint}, ${args.p256dhKey}, ${args.authKey}, ${now}, ${now})
    ON CONFLICT (user_id, endpoint)
    DO UPDATE SET p256dh_key = ${args.p256dhKey}, auth_key = ${args.authKey}, updated_at = ${now}
  `;

  return { ok: true, value: { ok: true } };
}

export async function removePushSubscription(args: {
  sessionToken: string;
  endpoint: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`DELETE FROM push_subscriptions WHERE user_id = ${user.id} AND endpoint = ${args.endpoint}`;
  return { ok: true, value: { ok: true } };
}

export async function clearPushSubscriptions(args: {
  sessionToken: string;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`DELETE FROM push_subscriptions WHERE user_id = ${user.id}`;
  return { ok: true, value: { ok: true } };
}

export async function setChannelMuted(args: {
  sessionToken: string;
  channelId: string;
  muted: boolean;
}): Promise<Result<{ ok: true }>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  await sql`
    INSERT INTO channel_notification_settings (channel_id, user_id, muted, updated_at)
    VALUES (${args.channelId}, ${user.id}, ${args.muted}, ${Date.now()})
    ON CONFLICT (channel_id, user_id)
    DO UPDATE SET muted = ${args.muted}, updated_at = ${Date.now()}
  `;

  return { ok: true, value: { ok: true } };
}

export async function getMutedChannelIds(args: {
  sessionToken: string;
}): Promise<Result<string[]>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`
    SELECT channel_id FROM channel_notification_settings
    WHERE user_id = ${user.id} AND muted = true
  `;

  return { ok: true, value: rows.map(r => r.channel_id) };
}

export async function getPushSubscriptionsForMessage(args: {
  userId: string;
  channelId: string;
}): Promise<Array<{ endpoint: string; p256dhKey: string; authKey: string }>> {
  // Get all subscriptions except the sender's, and EXCEPT those who have muted this channel
  const rows = await sql`
    SELECT p.endpoint, p.p256dh_key, p.auth_key
    FROM push_subscriptions p
    LEFT JOIN channel_notification_settings cns ON p.user_id = cns.user_id AND cns.channel_id = ${args.channelId}
    WHERE p.user_id != ${args.userId}
      AND (cns.muted IS NULL OR cns.muted = false)
      AND p.endpoint LIKE 'http%'
      AND p.p256dh_key != 'fcm'
      AND p.auth_key != 'fcm'
  `;

  return rows.map((r: any) => ({
    endpoint: r.endpoint,
    p256dhKey: r.p256dh_key,
    authKey: r.auth_key
  }));
}

export async function getPushSubscriptionsForUser(args: {
  sessionToken: string;
}): Promise<Result<Array<{ endpoint: string; p256dhKey: string; authKey: string }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const rows = await sql`
    SELECT endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE user_id = ${user.id}
      AND endpoint LIKE 'http%'
      AND p256dh_key != 'fcm'
      AND auth_key != 'fcm'
  `;

  return {
    ok: true,
    value: rows.map((r: any) => ({
      endpoint: r.endpoint,
      p256dhKey: r.p256dh_key,
      authKey: r.auth_key
    }))
  };
}

export async function getAllPushSubscriptions(): Promise<Array<{ endpoint: string; p256dhKey: string; authKey: string }>> {
  const rows = await sql`
    SELECT endpoint, p256dh_key, auth_key
    FROM push_subscriptions
    WHERE endpoint LIKE 'http%'
      AND p256dh_key != 'fcm'
      AND auth_key != 'fcm'
  `;

  return rows.map((r: any) => ({
    endpoint: r.endpoint,
    p256dhKey: r.p256dh_key,
    authKey: r.auth_key
  }));
}

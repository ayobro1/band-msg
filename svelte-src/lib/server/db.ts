import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

type AppUser = {
  id: string;
  username: string;
  role: "admin" | "member";
  status: "approved" | "pending";
};

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: number; error: string };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL environment variable");
}

const sql = neon(databaseUrl);
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
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
          status TEXT NOT NULL CHECK (status IN ('approved', 'pending')),
          created_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL,
          reset_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS channels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id),
          created_at BIGINT NOT NULL
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          content TEXT NOT NULL,
          created_at BIGINT NOT NULL
        )
      `;

      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_channels_created_at ON channels (created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel_id, created_at)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_users_status_role ON users (status, role)`;
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

  if (user.status !== "approved") {
    const bootstrapAdmin = (await countApprovedAdmins()) === 0;
    if (bootstrapAdmin) {
      await sql`UPDATE users SET role = 'admin', status = 'approved' WHERE id = ${user.id}`;
      user.role = "admin";
      user.status = "approved";
    } else {
      return { ok: false, code: 403, error: "Account pending approval" };
    }
  }

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

export async function getUserBySession(sessionToken: string): Promise<AppUser | null> {
  await ensureDb();
  const now = Date.now();

  const rows = await sql`
    SELECT u.id, u.username, u.role, u.status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${sessionToken}
      AND s.expires_at > ${now}
      AND u.status = 'approved'
    LIMIT 1
  `;

  return rows[0] ? toAppUser(rows[0]) : null;
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

  const rows = await sql`
    SELECT id, name, description
    FROM channels
    ORDER BY created_at ASC
  `;

  return {
    ok: true,
    value: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description
    }))
  };
}

export async function createChannel(args: {
  sessionToken: string;
  name: string;
  description: string;
}): Promise<Result<{ channelId: string }>> {
  const adminResult = await requireAdmin(args.sessionToken);
  if (adminResult.ok === false) {
    return adminResult;
  }

  const name = args.name.trim().toLowerCase();
  if (!/^([a-z0-9-]{2,32})$/.test(name)) {
    return { ok: false, code: 400, error: "Invalid channel name" };
  }

  try {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO channels (id, name, description, created_by, created_at)
      VALUES (${id}, ${name}, ${args.description.trim().slice(0, 300)}, ${adminResult.value.id}, ${Date.now()})
    `;

    return { ok: true, value: { channelId: id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: 409, error: "Channel already exists" };
    }
    throw error;
  }
}

export async function listMessages(args: {
  sessionToken: string;
  channelId: string;
}): Promise<Result<Array<{ id: string; content: string; channelId: string; createdAt: number; author: string }>>> {
  const user = await getUserBySession(args.sessionToken);
  if (!user) {
    return { ok: false, code: 401, error: "Unauthorized" };
  }

  const channelRows = await sql`SELECT id FROM channels WHERE id = ${args.channelId} LIMIT 1`;
  if (!channelRows[0]) {
    return { ok: false, code: 404, error: "Channel not found" };
  }

  const rows = await sql`
    SELECT m.id, m.content, m.channel_id, m.created_at, u.username AS author
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.channel_id = ${args.channelId}
    ORDER BY m.created_at ASC
    LIMIT 200
  `;

  return {
    ok: true,
    value: rows.map((row) => ({
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

  const channelRows = await sql`SELECT id FROM channels WHERE id = ${args.channelId} LIMIT 1`;
  if (!channelRows[0]) {
    return { ok: false, code: 404, error: "Channel not found" };
  }

  const id = crypto.randomUUID();
  await sql`
    INSERT INTO messages (id, channel_id, user_id, content, created_at)
    VALUES (${id}, ${args.channelId}, ${user.id}, ${content}, ${Date.now()})
  `;

  return { ok: true, value: { messageId: id } };
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

  return {
    ok: true,
    value: rows.map((row) => ({
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

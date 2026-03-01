import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { signJwt } from "./jwt";
import {
  AuditLog,
  AuthUser,
  CalendarEvent,
  Channel,
  Message,
  NotificationPrefs,
  Reaction,
  StreamEvent,
  TypingEvent,
  UserAccount,
} from "./types";

const db = getDb();
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 15;
const _tableColumnCache = new Map<string, Set<string>>();

function hasColumn(table: string, column: string): boolean {
  const cached = _tableColumnCache.get(table);
  if (cached) return cached.has(column);

  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const cols = new Set(rows.map((r) => r.name));
  _tableColumnCache.set(table, cols);
  return cols.has(column);
}

function channelsSoftDeleteEnabled(): boolean {
  return hasColumn("channels", "deleted_at");
}

export function trackUser(profileId: string): void {
  db.prepare(
    `INSERT INTO active_users (profile_id, last_seen)
     VALUES (?, ?)
     ON CONFLICT(profile_id) DO UPDATE SET last_seen = excluded.last_seen`
  ).run(profileId, Date.now());
}

export function getActiveUsers(): string[] {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5 minutes
  db.prepare("DELETE FROM active_users WHERE last_seen <= ?").run(cutoff);
  return db
    .prepare("SELECT profile_id FROM active_users ORDER BY profile_id ASC")
    .all()
    .map((row) => (row as { profile_id: string }).profile_id);
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
}

function sha256Password(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function secureEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  } catch {
    return false;
  }
}

function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(username);
}

function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 100;
}

function consumeAuthAttempt(key: string): boolean {
  const now = Date.now();
  const existing = db
    .prepare("SELECT count, reset_at FROM auth_attempts WHERE key = ?")
    .get(key) as { count: number; reset_at: number } | undefined;

  if (!existing || existing.reset_at < now) {
    db.prepare(
      `INSERT INTO auth_attempts (key, count, reset_at)
       VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`
    ).run(key, now + AUTH_WINDOW_MS);
    return true;
  }
  if (existing.count >= AUTH_MAX_ATTEMPTS) {
    return false;
  }
  db.prepare("UPDATE auth_attempts SET count = count + 1 WHERE key = ?").run(key);
  return true;
}

function clearAuthAttempts(key: string): void {
  db.prepare("DELETE FROM auth_attempts WHERE key = ?").run(key);
}

function toAuthUser(account: UserAccount): AuthUser {
  return {
    username: account.username,
    role: account.role,
    status: account.status,
  };
}

export function registerUser(usernameInput: string, password: string):
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; code: number } {
  const username = usernameInput.trim().toLowerCase();

  if (!isValidUsername(username)) {
    return { ok: false, error: "Username must be 3-20 characters (letters, numbers, _, -)", code: 400 };
  }

  if (!isValidPassword(password)) {
    return { ok: false, error: "Password must be between 8 and 100 characters", code: 400 };
  }

  if (!consumeAuthAttempt(`register:${username}`)) {
    return { ok: false, error: "Too many registration attempts, try again later", code: 429 };
  }

  const existing = db
    .prepare("SELECT username FROM users WHERE username = ?")
    .get(username) as { username: string } | undefined;

  if (existing) {
    return { ok: false, error: "Username is already taken", code: 409 };
  }

  const salt = crypto.randomBytes(16).toString("hex");

  // First registered user becomes admin + auto-approved
  const userCount = db
    .prepare("SELECT COUNT(*) as cnt FROM users")
    .get() as { cnt: number };
  const isFirst = userCount.cnt === 0;

  const account: UserAccount = {
    username,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    passwordAlgorithm: "pbkdf2",
    role: isFirst ? "admin" : "member",
    status: isFirst ? "approved" : "pending",
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO users (username, password_hash, password_salt, password_algo, role, status, created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    account.username,
    account.passwordHash,
    account.passwordSalt,
    account.passwordAlgorithm,
    account.role,
    account.status,
    account.created
  );

  clearAuthAttempts(`register:${username}`);
  return { ok: true, user: toAuthUser(account) };
}

export function loginUser(usernameInput: string, password: string):
  | { ok: true; token: string; user: AuthUser }
  | { ok: false; error: string; code: number } {
  const username = usernameInput.trim().toLowerCase();
  const key = `login:${username}`;

  if (!consumeAuthAttempt(key)) {
    return { ok: false, error: "Too many login attempts, try again later", code: 429 };
  }

  const account = db.prepare(
    `SELECT username, password_hash, password_salt, password_algo, role, status, created
     FROM users WHERE username = ?`
  ).get(username) as
    | {
        username: string;
        password_hash: string;
        password_salt: string;
        password_algo: "pbkdf2" | "sha256";
        role: "admin" | "member";
        status: "pending" | "approved";
        created: string;
      }
    | undefined;

  if (!account) {
    return { ok: false, error: "Invalid username or password", code: 401 };
  }

  const attemptedHash =
    account.password_algo === "sha256"
      ? sha256Password(password)
      : hashPassword(password, account.password_salt);

  if (!secureEqualHex(attemptedHash, account.password_hash)) {
    return { ok: false, error: "Invalid username or password", code: 401 };
  }

  if (account.status !== "approved") {
    return { ok: false, error: "Account pending admin approval", code: 403 };
  }

  const token = signJwt(account.username, account.role, account.status);

  clearAuthAttempts(key);

  return {
    ok: true,
    token,
    user: {
      username: account.username,
      role: account.role,
      status: account.status,
    },
  };
}

export function getPendingUsers(): AuthUser[] {
  return db
    .prepare(
      `SELECT username, role, status
       FROM users
       WHERE status = 'pending'
       ORDER BY username ASC`
    )
    .all()
    .map((row) => {
      const user = row as {
        username: string;
        role: "admin" | "member";
        status: "pending" | "approved";
      };
      return {
        username: user.username,
        role: user.role,
        status: user.status,
      };
    });
}

export function approveUser(usernameInput: string):
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; code: number } {
  const username = usernameInput.trim().toLowerCase();

  const account = db
    .prepare("SELECT username, role, status FROM users WHERE username = ?")
    .get(username) as
    | { username: string; role: "admin" | "member"; status: "pending" | "approved" }
    | undefined;

  if (!account) {
    return { ok: false, error: "User not found", code: 404 };
  }

  db.prepare("UPDATE users SET status = 'approved' WHERE username = ?").run(username);
  return {
    ok: true,
    user: {
      username: account.username,
      role: account.role,
      status: "approved",
    },
  };
}

export function promoteUserToAdmin(usernameInput: string):
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; code: number } {
  const username = usernameInput.trim().toLowerCase();

  const account = db
    .prepare("SELECT username, role, status FROM users WHERE username = ?")
    .get(username) as
    | { username: string; role: "admin" | "member"; status: "pending" | "approved" }
    | undefined;

  if (!account) {
    return { ok: false, error: "User not found", code: 404 };
  }

  if (account.status !== "approved") {
    return { ok: false, error: "User must be approved first", code: 400 };
  }

  if (account.role === "admin") {
    return { ok: false, error: "User is already an admin", code: 409 };
  }

  db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(username);

  return {
    ok: true,
    user: {
      username: account.username,
      role: "admin",
      status: account.status,
    },
  };
}

export function demoteAdminToMember(usernameInput: string):
  | { ok: true; user: AuthUser }
  | { ok: false; error: string; code: number } {
  const username = usernameInput.trim().toLowerCase();

  const account = db
    .prepare("SELECT username, role, status FROM users WHERE username = ?")
    .get(username) as
    | { username: string; role: "admin" | "member"; status: "pending" | "approved" }
    | undefined;

  if (!account) {
    return { ok: false, error: "User not found", code: 404 };
  }

  if (account.role !== "admin") {
    return { ok: false, error: "User is not an admin", code: 409 };
  }

  const adminCount = db
    .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND status = 'approved'")
    .get() as { cnt: number };

  if (adminCount.cnt <= 1) {
    return { ok: false, error: "Cannot demote the last admin", code: 400 };
  }

  db.prepare("UPDATE users SET role = 'member' WHERE username = ?").run(username);

  return {
    ok: true,
    user: {
      username: account.username,
      role: "member",
      status: account.status,
    },
  };
}

export function getChannels(): Channel[] {
  if (!channelsSoftDeleteEnabled()) {
    return db
      .prepare(
        `SELECT id, name, description, visibility, created, thread_parent_id
         FROM channels
         ORDER BY created ASC, name ASC`
      )
      .all() as Channel[];
  }

  return db
    .prepare(
      `SELECT id, name, description, visibility, created, thread_parent_id
       FROM channels
       WHERE deleted_at IS NULL
       ORDER BY created ASC, name ASC`
    )
    .all() as Channel[];
}

export function getChannelsForUser(username: string, role: string): Channel[] {
  if (role === "admin") return getChannels();

  if (!channelsSoftDeleteEnabled()) {
    return db
      .prepare(
        `SELECT c.id, c.name, c.description, c.visibility, c.created, c.thread_parent_id
         FROM channels c
         WHERE c.visibility = 'public'
            OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.username = ?)
         ORDER BY c.created ASC, c.name ASC`
      )
      .all(username) as Channel[];
  }

  return db
    .prepare(
      `SELECT c.id, c.name, c.description, c.visibility, c.created, c.thread_parent_id
       FROM channels c
       WHERE c.deleted_at IS NULL
         AND (c.visibility = 'public'
          OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.username = ?)
         )
       ORDER BY c.created ASC, c.name ASC`
    )
    .all(username) as Channel[];
}

export function canAccessChannel(channelId: string, username: string, role: string): boolean {
  if (role === "admin") return true;
  const ch = (channelsSoftDeleteEnabled()
    ? db.prepare("SELECT visibility FROM channels WHERE id = ? AND deleted_at IS NULL")
    : db.prepare("SELECT visibility FROM channels WHERE id = ?")
  ).get(channelId) as { visibility: string } | undefined;
  if (!ch) return false;
  if (ch.visibility === "public") return true;
  const member = db
    .prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND username = ?")
    .get(channelId, username);
  return Boolean(member);
}

export function channelExists(channelId: string): boolean {
  const row = (channelsSoftDeleteEnabled()
    ? db.prepare("SELECT 1 FROM channels WHERE id = ? AND deleted_at IS NULL")
    : db.prepare("SELECT 1 FROM channels WHERE id = ?")
  ).get(channelId) as { 1: number } | undefined;
  return Boolean(row);
}

export function getChannelName(channelId: string): string | null {
  const row = (channelsSoftDeleteEnabled()
    ? db.prepare("SELECT name FROM channels WHERE id = ? AND deleted_at IS NULL")
    : db.prepare("SELECT name FROM channels WHERE id = ?")
  ).get(channelId) as { name: string } | undefined;
  return row?.name ?? null;
}

export function getDeletedChannels(): Channel[] {
  if (!channelsSoftDeleteEnabled()) {
    return [];
  }

  return db
    .prepare(
      `SELECT id, name, description, visibility, created, thread_parent_id, deleted_at
       FROM channels
       WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC`
    )
    .all() as Channel[];
}

export function addChannel(
  name: string,
  description = "",
  visibility: "public" | "private" = "public",
  allowedUsers: string[] = [],
  threadParentId?: string
): Channel | null {
  const normalized = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  if (!normalized) return null;

  const existing = db
    .prepare("SELECT id FROM channels WHERE name = ?")
    .get(normalized) as { id: string } | undefined;
  if (existing) return null;

  const channel: Channel = {
    id: `ch_${crypto.randomUUID()}`,
    name: normalized,
    description,
    visibility,
    created: new Date().toISOString(),
    thread_parent_id: threadParentId ?? null,
  };

  db.prepare(
    `INSERT INTO channels (id, name, description, visibility, created, thread_parent_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(channel.id, channel.name, channel.description, channel.visibility, channel.created, channel.thread_parent_id);

  if (visibility === "private" && allowedUsers.length > 0) {
    setChannelMembers(channel.id, allowedUsers);
  }

  return channel;
}

export function createThreadChannel(messageId: string, parentChannelId: string): Channel | null {
  // Check if a thread channel for this message already exists
  const existing = db
    .prepare("SELECT id, name, description, visibility, created, thread_parent_id FROM channels WHERE thread_parent_id = ?")
    .get(messageId) as Channel | undefined;
  if (existing) return existing;

  const name = `thread-${messageId.replace("msg_", "").slice(0, 8)}`;
  return addChannel(name, `Thread from #${parentChannelId}`, "public", [], messageId);
}

export function setChannelMembers(channelId: string, usernames: string[]): void {
  db.prepare("DELETE FROM channel_members WHERE channel_id = ?").run(channelId);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO channel_members (channel_id, username) VALUES (?, ?)"
  );
  for (const u of usernames) {
    insert.run(channelId, u.trim().toLowerCase());
  }
}

export function getChannelMembers(channelId: string): string[] {
  return db
    .prepare("SELECT username FROM channel_members WHERE channel_id = ? ORDER BY username ASC")
    .all(channelId)
    .map((r) => (r as { username: string }).username);
}

export function deleteChannel(channelId: string): boolean {
  const exists = (channelsSoftDeleteEnabled()
    ? db.prepare("SELECT 1 FROM channels WHERE id = ? AND deleted_at IS NULL")
    : db.prepare("SELECT 1 FROM channels WHERE id = ?")
  ).get(channelId);
  if (!exists) return false;

  if (channelsSoftDeleteEnabled()) {
    db.prepare("UPDATE channels SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), channelId);
    return true;
  }

  const attachments = db
    .prepare(
      `SELECT a.id, a.path
       FROM attachments a
       INNER JOIN messages m ON m.id = a.message_id
       WHERE m.channel_id = ?`
    )
    .all(channelId) as { id: string; path: string }[];

  const removeChannel = db.transaction(() => {
    db.prepare("DELETE FROM reactions WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").run(channelId);
    db.prepare("DELETE FROM attachments WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)").run(channelId);
    db.prepare("DELETE FROM messages WHERE channel_id = ?").run(channelId);
    db.prepare("DELETE FROM channel_members WHERE channel_id = ?").run(channelId);
    db.prepare("DELETE FROM channels WHERE id = ?").run(channelId);
  });

  removeChannel();

  for (const att of attachments) {
    try {
      const fullPath = path.isAbsolute(att.path) ? att.path : path.join(uploadsDir, att.path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // ignore missing files
    }
  }

  return true;
}

export function restoreChannel(channelId: string): boolean {
  if (!channelsSoftDeleteEnabled()) return false;

  const exists = db.prepare("SELECT 1 FROM channels WHERE id = ? AND deleted_at IS NOT NULL").get(channelId);
  if (!exists) return false;
  db.prepare("UPDATE channels SET deleted_at = NULL WHERE id = ?").run(channelId);
  return true;
}

export function getMessagesByChannel(
  channelId: string,
  options?: {
    query?: string;
    profileId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }
): Message[] {
  const hasReplyColumn = hasColumn("messages", "reply_to_id");
  const where: string[] = ["m.channel_id = ?"];
  const params: Array<string | number> = [channelId];

  if (options?.query) {
    where.push("LOWER(m.content) LIKE LOWER(?)");
    params.push(`%${options.query}%`);
  }

  if (options?.profileId) {
    where.push("m.profile_id = ?");
    params.push(options.profileId.toLowerCase());
  }

  if (options?.from) {
    where.push("m.created >= ?");
    params.push(options.from);
  }

  if (options?.to) {
    where.push("m.created <= ?");
    params.push(options.to);
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 500, 2000));

  return db
    .prepare(
      `SELECT m.id, m.content, m.profile_id, m.channel_id, m.created${hasReplyColumn ? ", m.reply_to_id" : ""},
              a.id AS att_id, a.mime_type AS att_mime, a.expires_at AS att_expires,
              ${hasReplyColumn ? "rm.content AS reply_content, rm.profile_id AS reply_user" : "NULL AS reply_content, NULL AS reply_user"}
       FROM messages m
       LEFT JOIN attachments a ON a.message_id = m.id
       ${hasReplyColumn ? "LEFT JOIN messages rm ON rm.id = m.reply_to_id" : ""}
       WHERE ${where.join(" AND ")}
       ORDER BY m.created ASC
       LIMIT ?`
    )
    .all(...params, limit)
    .map((row) => {
      const r = row as Record<string, unknown>;
      const msg: Message = {
        id: r.id as string,
        content: r.content as string,
        profile_id: r.profile_id as string,
        channel_id: r.channel_id as string,
        created: r.created as string,
      };
      if (r.att_id) {
        msg.attachment_url = `/api/upload/${r.att_id as string}`;
        msg.attachment_mime = r.att_mime as string;
        msg.attachment_expires = r.att_expires as string;
      }
      if (r.reply_to_id) {
        msg.reply_to_id = r.reply_to_id as string;
        msg.reply_to_content = (r.reply_content as string) ?? "";
        msg.reply_to_user = (r.reply_user as string) ?? "";
      }
      return msg;
    });
}

export function addMessage(
  content: string,
  channelId: string,
  profileId: string,
  attachmentId?: string,
  replyToId?: string
): Message {
  const hasReplyColumn = hasColumn("messages", "reply_to_id");

  const msg: Message = {
    id: `msg_${crypto.randomUUID()}`,
    content,
    channel_id: channelId,
    profile_id: profileId,
    created: new Date().toISOString(),
  };

  if (hasReplyColumn) {
    db.prepare(
      `INSERT INTO messages (id, content, profile_id, channel_id, attachment_id, reply_to_id, created)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(msg.id, msg.content, msg.profile_id, msg.channel_id, attachmentId ?? null, replyToId ?? null, msg.created);
  } else {
    db.prepare(
      `INSERT INTO messages (id, content, profile_id, channel_id, attachment_id, created)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(msg.id, msg.content, msg.profile_id, msg.channel_id, attachmentId ?? null, msg.created);
  }

  // Enrich with reply data
  if (replyToId && hasReplyColumn) {
    const replyMsg = db.prepare("SELECT content, profile_id FROM messages WHERE id = ?").get(replyToId) as { content: string; profile_id: string } | undefined;
    if (replyMsg) {
      msg.reply_to_id = replyToId;
      msg.reply_to_content = replyMsg.content;
      msg.reply_to_user = replyMsg.profile_id;
    }
  }

  // Attach URL if there's an attachment
  if (attachmentId) {
    const att = db
      .prepare("SELECT id, mime_type, expires_at FROM attachments WHERE id = ?")
      .get(attachmentId) as { id: string; mime_type: string; expires_at: string } | undefined;
    if (att) {
      msg.attachment_url = `/api/upload/${att.id}`;
      msg.attachment_mime = att.mime_type;
      msg.attachment_expires = att.expires_at;
    }
  }

  trackUser(profileId);
  notifySubscribers({ type: "message", payload: msg });
  return msg;
}

export function broadcastTyping(channelId: string, profileId: string): void {
  const event: TypingEvent = { channel_id: channelId, profile_id: profileId };
  notifySubscribers({ type: "typing", payload: event });
}

// SSE broadcast pub/sub
type SseController = ReadableStreamDefaultController<Uint8Array>;

const sseClients = new Set<SseController>();
const _encoder = new TextEncoder();

export function addSseClient(controller: SseController): void {
  sseClients.add(controller);
}

export function removeSseClient(controller: SseController): void {
  sseClients.delete(controller);
}

// Send a keepalive comment every 25 seconds to keep connections alive through proxies
setInterval(() => {
  const ping = _encoder.encode(": ping\n\n");
  for (const controller of sseClients) {
    try {
      controller.enqueue(ping);
    } catch {
      sseClients.delete(controller);
    }
  }
}, 25_000);

function notifySubscribers(event: StreamEvent) {
  const chunk = _encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  for (const controller of sseClients) {
    try {
      controller.enqueue(chunk);
    } catch {
      sseClients.delete(controller);
    }
  }
}

// ───── Attachments ─────

const uploadsDir = process.env.UPLOADS_PATH ?? path.join(process.cwd(), "data", "uploads");

export function addAttachment(
  messageId: string,
  filename: string,
  mimeType: string,
  size: number,
  filePath: string,
  expiresInDays = 30
): string {
  const id = `att_${crypto.randomUUID()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO attachments (id, message_id, filename, mime_type, size, path, created, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, messageId, filename, mimeType, size, filePath, now.toISOString(), expires.toISOString());
  return id;
}

export function getAttachment(id: string): {
  id: string;
  message_id: string;
  filename: string;
  mime_type: string;
  size: number;
  path: string;
  created: string;
  expires_at: string;
} | null {
  return (
    (db
      .prepare("SELECT * FROM attachments WHERE id = ?")
      .get(id) as {
      id: string;
      message_id: string;
      filename: string;
      mime_type: string;
      size: number;
      path: string;
      created: string;
      expires_at: string;
    } | undefined) ?? null
  );
}

export function cleanupExpiredAttachments(): number {
  const now = new Date().toISOString();
  const expired = db
    .prepare("SELECT id, path FROM attachments WHERE expires_at <= ?")
    .all(now) as { id: string; path: string }[];

  for (const att of expired) {
    try {
      const fullPath = path.isAbsolute(att.path) ? att.path : path.join(uploadsDir, att.path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // ignore file-not-found
    }
    db.prepare("DELETE FROM attachments WHERE id = ?").run(att.id);
  }
  return expired.length;
}

export function getUploadsDir(): string {
  return uploadsDir;
}

export function updateAttachmentMessageId(attachmentId: string, messageId: string): void {
  db.prepare("UPDATE attachments SET message_id = ? WHERE id = ?").run(messageId, attachmentId);
}

// ───── Reactions ─────

export function addReaction(
  messageId: string,
  username: string,
  gifUrl: string,
  gifId: string,
  emoji?: string
): Reaction {
  // For emoji-only reactions, prevent duplicates (same user + same emoji on same message)
  if (emoji && !gifUrl) {
    const existing = db.prepare(
      "SELECT id FROM reactions WHERE message_id = ? AND username = ? AND emoji = ?"
    ).get(messageId, username, emoji) as { id: string } | undefined;
    if (existing) {
      // Toggle off — remove the reaction
      db.prepare("DELETE FROM reactions WHERE id = ?").run(existing.id);
      const removed: Reaction = {
        id: existing.id,
        message_id: messageId,
        username,
        gif_url: "",
        gif_id: "",
        emoji,
        created: "",
      };
      notifySubscribers({ type: "reaction", payload: { ...removed, _removed: true } as unknown as Reaction });
      return removed;
    }
  }

  const reaction: Reaction = {
    id: `r_${crypto.randomUUID()}`,
    message_id: messageId,
    username,
    gif_url: gifUrl,
    gif_id: gifId,
    emoji: emoji ?? "",
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO reactions (id, message_id, username, gif_url, gif_id, emoji, created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(reaction.id, reaction.message_id, reaction.username, reaction.gif_url, reaction.gif_id, reaction.emoji, reaction.created);

  notifySubscribers({ type: "reaction", payload: reaction });
  return reaction;
}

export function getReactionsForMessages(messageIds: string[]): Map<string, Reaction[]> {
  const result = new Map<string, Reaction[]>();
  if (messageIds.length === 0) return result;

  const placeholders = messageIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT id, message_id, username, gif_url, gif_id, emoji, created
       FROM reactions WHERE message_id IN (${placeholders})
       ORDER BY created ASC`
    )
    .all(...messageIds) as Reaction[];

  for (const r of rows) {
    const list = result.get(r.message_id) ?? [];
    list.push(r);
    result.set(r.message_id, list);
  }
  return result;
}

// ───── Push Subscriptions ─────

export function savePushSubscription(
  endpoint: string,
  username: string,
  p256dh: string,
  auth: string
): void {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, username, p256dh, auth, created)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       username = excluded.username,
       p256dh = excluded.p256dh,
       auth = excluded.auth`
  ).run(endpoint, username, p256dh, auth, new Date().toISOString());
}

export function removePushSubscription(endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function getAllPushSubscriptions(): {
  endpoint: string;
  username: string;
  p256dh: string;
  auth: string;
}[] {
  return db
    .prepare("SELECT endpoint, username, p256dh, auth FROM push_subscriptions")
    .all() as { endpoint: string; username: string; p256dh: string; auth: string }[];
}

// ───── Approved users list (for channel member picker) ─────

export function getApprovedUsers(): { username: string; role: string }[] {
  return db
    .prepare("SELECT username, role FROM users WHERE status = 'approved' ORDER BY username ASC")
    .all() as { username: string; role: string }[];
}

// ───── Notification Preferences ─────

export function getNotificationPrefs(username: string): NotificationPrefs {
  const row = db
    .prepare("SELECT enabled, muted_channels, mentions_only, quiet_start_hour, quiet_end_hour FROM notification_prefs WHERE username = ?")
    .get(username) as {
    enabled: number;
    muted_channels: string;
    mentions_only: number;
    quiet_start_hour: number | null;
    quiet_end_hour: number | null;
  } | undefined;

  if (!row) {
    return {
      enabled: true,
      muted_channels: [],
      mentions_only: false,
      quiet_start_hour: null,
      quiet_end_hour: null,
    };
  }

  return {
    enabled: Boolean(row.enabled),
    muted_channels: row.muted_channels ? row.muted_channels.split(",").filter(Boolean) : [],
    mentions_only: Boolean(row.mentions_only),
    quiet_start_hour: row.quiet_start_hour,
    quiet_end_hour: row.quiet_end_hour,
  };
}

export function setNotificationPrefs(
  username: string,
  enabled: boolean,
  mutedChannels: string[],
  mentionsOnly = false,
  quietStartHour: number | null = null,
  quietEndHour: number | null = null
): void {
  db.prepare(
    `INSERT INTO notification_prefs (username, enabled, muted_channels, mentions_only, quiet_start_hour, quiet_end_hour)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       enabled = excluded.enabled,
       muted_channels = excluded.muted_channels,
       mentions_only = excluded.mentions_only,
       quiet_start_hour = excluded.quiet_start_hour,
       quiet_end_hour = excluded.quiet_end_hour`
  ).run(
    username,
    enabled ? 1 : 0,
    mutedChannels.join(","),
    mentionsOnly ? 1 : 0,
    quietStartHour,
    quietEndHour
  );
}

function isWithinQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function shouldNotifyUser(
  username: string,
  channelId: string,
  messageContent = ""
): boolean {
  const prefs = getNotificationPrefs(username);
  if (!prefs.enabled) return false;
  if (prefs.muted_channels.includes(channelId)) return false;

  if (
    Number.isInteger(prefs.quiet_start_hour) &&
    Number.isInteger(prefs.quiet_end_hour) &&
    prefs.quiet_start_hour !== null &&
    prefs.quiet_end_hour !== null
  ) {
    const hour = new Date().getHours();
    if (isWithinQuietHours(hour, prefs.quiet_start_hour, prefs.quiet_end_hour)) {
      return false;
    }
  }

  if (prefs.mentions_only) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentionRegex = new RegExp(`(^|\\s)@${escaped}(\\b|\\s|$)`, "i");
    return mentionRegex.test(messageContent);
  }

  return true;
}

export function addAuditLog(
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  details = ""
): AuditLog {
  const log: AuditLog = {
    id: `audit_${crypto.randomUUID()}`,
    actor,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO audit_logs (id, actor, action, target_type, target_id, details, created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(log.id, log.actor, log.action, log.target_type, log.target_id, log.details, log.created);

  return log;
}

export function getAuditLogs(limit = 50): AuditLog[] {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  return db
    .prepare(
      `SELECT id, actor, action, target_type, target_id, details, created
       FROM audit_logs
       ORDER BY created DESC
       LIMIT ?`
    )
    .all(safeLimit) as AuditLog[];
}

// ───── Practice Days ─────

import type { PracticeDay } from "./types";

export function getPracticeDays(from?: string, to?: string): PracticeDay[] {
  if (from && to) {
    return db
      .prepare("SELECT * FROM practice_days WHERE date >= ? AND date <= ? ORDER BY date ASC")
      .all(from, to) as PracticeDay[];
  }
  return db
    .prepare("SELECT * FROM practice_days ORDER BY date ASC")
    .all() as PracticeDay[];
}

export function addPracticeDay(date: string, notes: string, createdBy: string): PracticeDay {
  const id = `pd_${crypto.randomUUID()}`;
  const created = new Date().toISOString();
  db.prepare(
    `INSERT INTO practice_days (id, date, notes, created_by, created)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET notes = excluded.notes`
  ).run(id, date, notes, createdBy, created);
  return { id, date, notes, created_by: createdBy, created };
}

export function removePracticeDay(id: string): boolean {
  const info = db.prepare("DELETE FROM practice_days WHERE id = ?").run(id);
  return info.changes > 0;
}

export function getCalendarEvents(from?: string, to?: string): CalendarEvent[] {
  if (from && to) {
    return db
      .prepare(
        `SELECT id, title, date, notes, created_by, created
         FROM calendar_events
         WHERE date >= ? AND date <= ?
         ORDER BY date ASC, created ASC`
      )
      .all(from, to) as CalendarEvent[];
  }

  return db
    .prepare(
      `SELECT id, title, date, notes, created_by, created
       FROM calendar_events
       ORDER BY date ASC, created ASC`
    )
    .all() as CalendarEvent[];
}

export function addCalendarEvent(date: string, title: string, notes: string, createdBy: string): CalendarEvent {
  const event: CalendarEvent = {
    id: `ev_${crypto.randomUUID()}`,
    title: title.trim(),
    date,
    notes,
    created_by: createdBy,
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO calendar_events (id, title, date, notes, created_by, created)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(event.id, event.title, event.date, event.notes, event.created_by, event.created);

  return event;
}

export function removeCalendarEvent(id: string): boolean {
  const info = db.prepare("DELETE FROM calendar_events WHERE id = ?").run(id);
  return info.changes > 0;
}

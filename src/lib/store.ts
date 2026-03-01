import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { signJwt } from "./jwt";
import {
  AuthUser,
  Channel,
  Message,
  Reaction,
  StreamEvent,
  TypingEvent,
  UserAccount,
} from "./types";

const db = getDb();
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 15;

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

export function getChannels(): Channel[] {
  return db
    .prepare(
      `SELECT id, name, description, visibility, created
       FROM channels
       ORDER BY created ASC, name ASC`
    )
    .all() as Channel[];
}

export function getChannelsForUser(username: string, role: string): Channel[] {
  if (role === "admin") return getChannels();

  return db
    .prepare(
      `SELECT c.id, c.name, c.description, c.visibility, c.created
       FROM channels c
       WHERE c.visibility = 'public'
          OR EXISTS (SELECT 1 FROM channel_members cm WHERE cm.channel_id = c.id AND cm.username = ?)
       ORDER BY c.created ASC, c.name ASC`
    )
    .all(username) as Channel[];
}

export function canAccessChannel(channelId: string, username: string, role: string): boolean {
  if (role === "admin") return true;
  const ch = db
    .prepare("SELECT visibility FROM channels WHERE id = ?")
    .get(channelId) as { visibility: string } | undefined;
  if (!ch) return false;
  if (ch.visibility === "public") return true;
  const member = db
    .prepare("SELECT 1 FROM channel_members WHERE channel_id = ? AND username = ?")
    .get(channelId, username);
  return Boolean(member);
}

export function channelExists(channelId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM channels WHERE id = ?")
    .get(channelId) as { 1: number } | undefined;
  return Boolean(row);
}

export function getChannelName(channelId: string): string | null {
  const row = db
    .prepare("SELECT name FROM channels WHERE id = ?")
    .get(channelId) as { name: string } | undefined;
  return row?.name ?? null;
}

export function addChannel(
  name: string,
  description = "",
  visibility: "public" | "private" = "public",
  allowedUsers: string[] = []
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
  };

  db.prepare(
    `INSERT INTO channels (id, name, description, visibility, created)
     VALUES (?, ?, ?, ?, ?)`
  ).run(channel.id, channel.name, channel.description, channel.visibility, channel.created);

  if (visibility === "private" && allowedUsers.length > 0) {
    setChannelMembers(channel.id, allowedUsers);
  }

  return channel;
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

export function getMessagesByChannel(channelId: string): Message[] {
  return db
    .prepare(
      `SELECT m.id, m.content, m.profile_id, m.channel_id, m.created, m.reply_to_id,
              a.id AS att_id, a.mime_type AS att_mime, a.expires_at AS att_expires,
              rm.content AS reply_content, rm.profile_id AS reply_user
       FROM messages m
       LEFT JOIN attachments a ON a.message_id = m.id
       LEFT JOIN messages rm ON rm.id = m.reply_to_id
       WHERE m.channel_id = ?
       ORDER BY m.created ASC`
    )
    .all(channelId)
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
  const msg: Message = {
    id: `msg_${crypto.randomUUID()}`,
    content,
    channel_id: channelId,
    profile_id: profileId,
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO messages (id, content, profile_id, channel_id, attachment_id, reply_to_id, created)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(msg.id, msg.content, msg.profile_id, msg.channel_id, attachmentId ?? null, replyToId ?? null, msg.created);

  // Enrich with reply data
  if (replyToId) {
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

// WebSocket broadcast pub/sub
export interface WsClient {
  send(data: string): void;
  readyState: number;
}

const wsClients = new Set<WsClient>();

export function addWsClient(ws: WsClient): void {
  wsClients.add(ws);
}

export function removeWsClient(ws: WsClient): void {
  wsClients.delete(ws);
}

function notifySubscribers(event: StreamEvent) {
  const data = JSON.stringify(event);
  for (const ws of wsClients) {
    try {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    } catch {
      wsClients.delete(ws);
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

export function getNotificationPrefs(username: string): { enabled: boolean; muted_channels: string[] } {
  const row = db
    .prepare("SELECT enabled, muted_channels FROM notification_prefs WHERE username = ?")
    .get(username) as { enabled: number; muted_channels: string } | undefined;

  if (!row) return { enabled: true, muted_channels: [] };

  return {
    enabled: Boolean(row.enabled),
    muted_channels: row.muted_channels ? row.muted_channels.split(",").filter(Boolean) : [],
  };
}

export function setNotificationPrefs(
  username: string,
  enabled: boolean,
  mutedChannels: string[]
): void {
  db.prepare(
    `INSERT INTO notification_prefs (username, enabled, muted_channels)
     VALUES (?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       enabled = excluded.enabled,
       muted_channels = excluded.muted_channels`
  ).run(username, enabled ? 1 : 0, mutedChannels.join(","));
}

export function shouldNotifyUser(username: string, channelId: string): boolean {
  const prefs = getNotificationPrefs(username);
  if (!prefs.enabled) return false;
  if (prefs.muted_channels.includes(channelId)) return false;
  return true;
}

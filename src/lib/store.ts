import crypto from "node:crypto";
import { getDb } from "./db";
import {
  AuthUser,
  Channel,
  Message,
  StreamEvent,
  TypingEvent,
  UserAccount,
} from "./types";

const db = getDb();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
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
  const account: UserAccount = {
    username,
    passwordSalt: salt,
    passwordHash: hashPassword(password, salt),
    passwordAlgorithm: "pbkdf2",
    role: "member",
    status: "pending",
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

  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessions (token, username, expires_at)
     VALUES (?, ?, ?)`
  ).run(token, account.username, Date.now() + SESSION_TTL_MS);

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

export function getUserBySession(token: string | undefined): AuthUser | null {
  if (!token) return null;

  const session = db
    .prepare("SELECT username, expires_at FROM sessions WHERE token = ?")
    .get(token) as { username: string; expires_at: number } | undefined;

  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(
    Date.now() + SESSION_TTL_MS,
    token
  );

  const user = db
    .prepare("SELECT username, role, status FROM users WHERE username = ?")
    .get(session.username) as
    | { username: string; role: "admin" | "member"; status: "pending" | "approved" }
    | undefined;

  if (!user || user.status !== "approved") {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return {
    username: user.username,
    role: user.role,
    status: user.status,
  };
}

export function logoutSession(token: string | undefined): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
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
      `SELECT id, name, description, created
       FROM channels
       ORDER BY created ASC, name ASC`
    )
    .all() as Channel[];
}

export function channelExists(channelId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM channels WHERE id = ?")
    .get(channelId) as { 1: number } | undefined;
  return Boolean(row);
}

export function addChannel(name: string, description = ""): Channel | null {
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
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO channels (id, name, description, created)
     VALUES (?, ?, ?, ?)`
  ).run(channel.id, channel.name, channel.description, channel.created);

  return channel;
}

export function getMessagesByChannel(channelId: string): Message[] {
  return db
    .prepare(
      `SELECT id, content, profile_id, channel_id, created
       FROM messages
       WHERE channel_id = ?
       ORDER BY created ASC`
    )
    .all(channelId) as Message[];
}

export function addMessage(
  content: string,
  channelId: string,
  profileId: string
): Message {
  const msg: Message = {
    id: `msg_${crypto.randomUUID()}`,
    content,
    channel_id: channelId,
    profile_id: profileId,
    created: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO messages (id, content, profile_id, channel_id, created)
     VALUES (?, ?, ?, ?, ?)`
  ).run(msg.id, msg.content, msg.profile_id, msg.channel_id, msg.created);

  trackUser(profileId);
  notifySubscribers({ type: "message", payload: msg });
  return msg;
}

export function broadcastTyping(channelId: string, profileId: string): void {
  const event: TypingEvent = { channel_id: channelId, profile_id: profileId };
  notifySubscribers({ type: "typing", payload: event });
}

// Simple pub/sub for SSE
type Subscriber = (event: StreamEvent) => void;
const subscribers = new Set<Subscriber>();

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function notifySubscribers(event: StreamEvent) {
  for (const fn of subscribers) {
    fn(event);
  }
}

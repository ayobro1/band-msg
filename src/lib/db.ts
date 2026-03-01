import fs from "node:fs";
import path from "node:path";
import type BetterSqlite3 from "better-sqlite3";

// Prefer bun:sqlite in Bun runtime (built-in, no native addon); fall back to
// better-sqlite3 in Node.js environments such as Next.js build workers.
const Database: new (path: string) => BetterSqlite3.Database = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return (require("bun:sqlite") as any).Database;
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    return require("better-sqlite3") as any;
  }
})();

const DEFAULT_CHANNELS = [
  { id: "ch_1", name: "general", description: "General band discussion" },
  { id: "ch_2", name: "setlists", description: "Plan your setlists here" },
  { id: "ch_3", name: "practice", description: "Schedule and discuss practice sessions" },
];

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "band-chat.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Ensure uploads directory exists
const uploadsPath = process.env.UPLOADS_PATH ?? path.join(process.cwd(), "data", "uploads");
fs.mkdirSync(uploadsPath, { recursive: true });

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id TEXT NOT NULL,
  username TEXT NOT NULL,
  PRIMARY KEY (channel_id, username)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  attachment_id TEXT,
  created TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created
ON messages(channel_id, created);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_expires
ON attachments(expires_at);

CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  username TEXT NOT NULL,
  gif_url TEXT NOT NULL,
  gif_id TEXT NOT NULL,
  created TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reactions_message
ON reactions(message_id);

CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_algo TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires
ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_users (
  profile_id TEXT PRIMARY KEY,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created TEXT NOT NULL
);
`);

// Migrate: add visibility column to existing channels table if missing
try {
  db.exec("ALTER TABLE channels ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'");
} catch {
  // Column already exists
}

// Migrate: add emoji column to reactions table
try {
  db.exec("ALTER TABLE reactions ADD COLUMN emoji TEXT DEFAULT ''");
} catch {
  // Column already exists
}

// Migrate: add reply_to_id column to messages table
try {
  db.exec("ALTER TABLE messages ADD COLUMN reply_to_id TEXT DEFAULT NULL");
} catch {
  // Column already exists
}

// Notification preferences table
db.exec(`
CREATE TABLE IF NOT EXISTS notification_prefs (
  username TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  muted_channels TEXT NOT NULL DEFAULT ''
);
`);

const insertChannel = db.prepare(
  "INSERT OR IGNORE INTO channels (id, name, description, visibility, created) VALUES (?, ?, ?, 'public', ?)"
);
const nowIso = new Date().toISOString();
for (const channel of DEFAULT_CHANNELS) {
  insertChannel.run(channel.id, channel.name, channel.description, nowIso);
}

export function getDb() {
  return db;
}

// ───── Expired attachment cleanup (runs on app startup + every 6 hours) ─────
function cleanupExpiredMedia() {
  const now = new Date().toISOString();
  const rows = db
    .prepare("SELECT id, path FROM attachments WHERE expires_at <= ?")
    .all(now) as { id: string; path: string }[];

  if (rows.length === 0) return;

  for (const att of rows) {
    try {
      const fullPath = path.isAbsolute(att.path) ? att.path : path.join(uploadsPath, att.path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      // file already gone
    }
    db.prepare("DELETE FROM attachments WHERE id = ?").run(att.id);
  }
  console.log(`[cleanup] Removed ${rows.length} expired attachment(s)`);
}

// Run once on startup
cleanupExpiredMedia();

// Re-run every 6 hours while the process is alive
setInterval(cleanupExpiredMedia, 6 * 60 * 60 * 1000).unref();

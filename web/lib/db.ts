import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { dataDir } from "./paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  data TEXT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS events_type_subject ON events(type, subject);
CREATE TABLE IF NOT EXISTS flags (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  set_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS fired_triggers (
  trigger_id TEXT NOT NULL,
  fired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS revealed (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  revealed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  origin TEXT NOT NULL DEFAULT 'runtime'
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS chat_meta (
  chat_id TEXT PRIMARY KEY,
  last_read_incoming_id INTEGER NOT NULL DEFAULT 0,
  seeded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS llm_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  character_id TEXT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  cache_hit_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 1,
  error TEXT
);
CREATE TABLE IF NOT EXISTS browser_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mail_state (
  thread_id TEXT PRIMARY KEY,
  read INTEGER NOT NULL DEFAULT 0,
  starred INTEGER,
  labels TEXT,
  trashed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mail_runtime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id TEXT NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS terminal_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS fs_overlay (
  path TEXT PRIMARY KEY,
  dir INTEGER NOT NULL DEFAULT 0,
  body TEXT,
  seed TEXT,
  disk TEXT,
  kind TEXT,
  created TEXT NOT NULL,
  modified TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  origin TEXT,
  size INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pending_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  due_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'message',
  meta TEXT,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pending_due ON pending_replies(done, due_at);
CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'complete',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

type G = typeof globalThis & { __foundDb?: DatabaseSync; __foundDbPath?: string };

export function dbPath(): string {
  return process.env.DB_PATH || path.join(dataDir(), "state.sqlite");
}

/** Singleton connection (survives Next.js dev HMR via globalThis). */
export function db(): DatabaseSync {
  const g = globalThis as G;
  const p = dbPath();
  if (g.__foundDb && g.__foundDbPath === p) return g.__foundDb;
  const conn = new DatabaseSync(p);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  conn.exec(SCHEMA);
  // Migrations for databases created by an earlier build.
  for (const alter of ["ALTER TABLE fs_overlay ADD COLUMN disk TEXT"]) { try { conn.exec(alter); } catch { /* already applied */ } }
  g.__foundDb = conn;
  g.__foundDbPath = p;
  return conn;
}

/** Wipe all runtime state (used by tests and the debug reset endpoint). */
export function resetDb(): void {
  const conn = db();
  conn.exec("DELETE FROM events; DELETE FROM flags; DELETE FROM fired_triggers; DELETE FROM revealed; DELETE FROM messages; DELETE FROM chat_meta; DELETE FROM browser_history; DELETE FROM kv; DELETE FROM mail_state; DELETE FROM mail_runtime; DELETE FROM terminal_history; DELETE FROM fs_overlay; DELETE FROM settings; DELETE FROM pending_replies; DELETE FROM downloads;");
}

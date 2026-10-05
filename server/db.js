'use strict';
// قاعدة البيانات: SQLite المدمجة في Node.js (node:sqlite) — بلا اعتماديات خارجية.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { defaultContent } = require('./seed');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const DB_PATH = path.join(DATA_DIR, 'athar.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let db;

function open() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate();
  return db;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','admin','editor')),
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content (
      key TEXT PRIMARY KEY CHECK (key IN ('draft','published')),
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT
    );
    CREATE TABLE IF NOT EXISTS content_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      json TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT
    );
    CREATE TABLE IF NOT EXISTS dedications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_type TEXT NOT NULL CHECK (recipient_type IN ('single','group')),
      gender TEXT CHECK (gender IN ('male','female') OR gender IS NULL),
      teacher_name TEXT NOT NULL,
      school TEXT,
      country TEXT,
      sender_name TEXT,
      anonymous INTEGER NOT NULL DEFAULT 0,
      sender_role TEXT,
      body TEXT NOT NULL,
      card_style TEXT,
      status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','hidden')),
      ip_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ded_public ON dedications(status, deleted_at, id);
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const has = db.prepare("SELECT COUNT(*) c FROM content").get().c;
  if (!has) {
    const json = JSON.stringify(defaultContent());
    db.prepare("INSERT INTO content(key,json,updated_by) VALUES ('draft',?, 'seed'), ('published',?, 'seed')").run(json, json);
    db.prepare("INSERT INTO content_history(json,note,created_by) VALUES (?, 'المحتوى الابتدائي', 'seed')").run(json);
  }
}

function get() {
  return db;
}

function close() {
  if (db) db.close();
  db = null;
}

function audit(userEmail, action, detail) {
  db.prepare('INSERT INTO audit_log(user_email, action, detail) VALUES (?,?,?)').run(
    userEmail || null,
    action,
    detail ? String(detail).slice(0, 1000) : null
  );
}

module.exports = { open, get, close, audit, DATA_DIR, DB_PATH, UPLOADS_DIR };

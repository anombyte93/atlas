-- Atlas Visibility Database Schema
-- Based on architect sprint with triggers and indexes
-- Supports: id, stderr, proper constraints, auto-cleanup

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    command TEXT,
    exit_code INTEGER,
    duration_seconds INTEGER,
    status TEXT NOT NULL CHECK(status IN ('logged','running','completed','failed')),
    stdout TEXT,
    stderr TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_task_id ON entries(task_id);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO metadata(key, value) VALUES ('schema_version', '1.0');
INSERT OR IGNORE INTO metadata(key, value) VALUES ('retention_days', '90');

CREATE TRIGGER IF NOT EXISTS entries_updated_at_tr
AFTER UPDATE ON entries
BEGIN
  UPDATE entries SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS cleanup_old_entries
AFTER INSERT ON entries
BEGIN
  DELETE FROM entries
    WHERE created_at < datetime(
      'now',
      '-' || COALESCE((SELECT value FROM metadata WHERE key = 'retention_days'), '90') || ' days'
    );
END;

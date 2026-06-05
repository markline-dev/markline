-- Markline reader-feedback store (D1 / SQLite).
--   wrangler d1 execute markline-feedback --file schema.sql
CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answer     TEXT,   -- 'yes' | 'no' | null
  scope      TEXT,   -- 'page' | 'section'
  target     TEXT,   -- resource/section id (e.g. a tag slug); null for pages
  path       TEXT,   -- the page the feedback was left on
  reason     TEXT,   -- chosen reason (page widget only)
  comment    TEXT,   -- free-text (may contain PII — handle accordingly)
  origin     TEXT,   -- request Origin
  ip_hash    TEXT    -- hashed IP for dedup/abuse spotting (no raw IPs stored)
);

CREATE INDEX IF NOT EXISTS idx_feedback_path    ON feedback (path);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversation (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  title TEXT NOT NULL,
  workspace TEXT,
  git_branch TEXT,
  models TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (source_id, source_path)
);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  parts TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);

CREATE TABLE IF NOT EXISTS resource (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  mime_type TEXT,
  local_path TEXT,
  byte_length INTEGER
);

CREATE TABLE IF NOT EXISTS scan_state (
  source_id TEXT NOT NULL,
  path TEXT NOT NULL,
  mtime_ms REAL NOT NULL,
  size INTEGER NOT NULL,
  conversation_id TEXT,
  scanned_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, path)
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  conversation_id UNINDEXED,
  message_id UNINDEXED,
  text,
  tokenize = 'trigram'
);

CREATE INDEX IF NOT EXISTS idx_conversation_updated ON conversation(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_source ON conversation(source_id);
CREATE INDEX IF NOT EXISTS idx_message_conversation_seq ON message(conversation_id, seq);
`

export const PRAGMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
`

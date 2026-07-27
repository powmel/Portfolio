PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_captures (
  date TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice')),
  publication_state TEXT NOT NULL DEFAULT 'private_draft',
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  captured_at TEXT NOT NULL,
  captured_date TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mobile'
);

CREATE INDEX IF NOT EXISTS media_items_captured_date_idx ON media_items(captured_date);

CREATE TABLE IF NOT EXISTS upload_receipts (
  upload_id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items(id),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_suggestions (
  date TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media_items(id),
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL,
  PRIMARY KEY (date, media_id)
);

CREATE TABLE IF NOT EXISTS publication_decisions (
  date TEXT PRIMARY KEY,
  action TEXT NOT NULL DEFAULT 'pending' CHECK (action IN ('publish', 'none', 'pending')),
  media_id TEXT REFERENCES media_items(id),
  caption TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS decision_audit (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS decision_audit_date_idx ON decision_audit(date, created_at DESC);

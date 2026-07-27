CREATE TABLE media_items_v2 (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 99614720),
  captured_at TEXT NOT NULL,
  captured_date TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'mobile'
);

CREATE TABLE upload_receipts_v2 (
  upload_id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_items_v2(id),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE media_suggestions_v2 (
  date TEXT NOT NULL,
  media_id TEXT NOT NULL REFERENCES media_items_v2(id),
  score INTEGER NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  generated_at TEXT NOT NULL,
  PRIMARY KEY (date, media_id)
);

CREATE TABLE publication_decisions_v2 (
  date TEXT PRIMARY KEY,
  action TEXT NOT NULL DEFAULT 'pending' CHECK (action IN ('publish', 'none', 'pending')),
  media_id TEXT REFERENCES media_items_v2(id),
  caption TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1
);

INSERT INTO media_items_v2 SELECT * FROM media_items;
INSERT INTO upload_receipts_v2 SELECT * FROM upload_receipts;
INSERT INTO media_suggestions_v2 SELECT * FROM media_suggestions;
INSERT INTO publication_decisions_v2 SELECT * FROM publication_decisions;

DROP TABLE upload_receipts;
DROP TABLE media_suggestions;
DROP TABLE publication_decisions;
DROP TABLE media_items;

ALTER TABLE media_items_v2 RENAME TO media_items;
ALTER TABLE upload_receipts_v2 RENAME TO upload_receipts;
ALTER TABLE media_suggestions_v2 RENAME TO media_suggestions;
ALTER TABLE publication_decisions_v2 RENAME TO publication_decisions;

CREATE INDEX media_items_captured_date_idx ON media_items(captured_date);
PRAGMA foreign_key_check;

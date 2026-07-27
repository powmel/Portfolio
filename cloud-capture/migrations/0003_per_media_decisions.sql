CREATE TABLE IF NOT EXISTS media_decisions (
  media_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('publish', 'reject', 'later', 'pending')),
  caption TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_decisions_date_action
  ON media_decisions(date, action);


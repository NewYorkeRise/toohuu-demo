CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY CHECK (length(id) = 64),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  bytes BLOB NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0 AND size <= 768000),
  created_at TEXT NOT NULL,
  actor TEXT NOT NULL
);

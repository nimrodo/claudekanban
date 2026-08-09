CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT,
  owner TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  cwd TEXT NOT NULL,
  model TEXT,
  recap TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);

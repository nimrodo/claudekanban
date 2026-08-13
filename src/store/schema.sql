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
  recap TEXT,
  last_activity_at TEXT,
  fail_reason TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);

-- Schema ships in v1 (see docs/superpowers/specs/2026-08-07-operations-console-design.md,
-- Domain model); the endpoints/poller that act on this table are v2, deferred.
CREATE TABLE IF NOT EXISTS intervention (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  origin TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

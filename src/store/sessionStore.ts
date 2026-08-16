import type Database from "better-sqlite3";
import type { SessionShape, SessionStatus } from "../domain/types.js";
import type { StaleCandidate } from "../domain/staleSweep.js";

export type { SessionStatus };

export type Session = SessionShape;

interface SessionRow {
  id: string;
  parent_session_id: string | null;
  owner: string;
  title: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
  fail_reason: string | null;
  last_activity_summary: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    parentSessionId: row.parent_session_id,
    owner: row.owner,
    title: row.title,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    cwd: row.cwd,
    model: row.model,
    recap: row.recap,
    failReason: row.fail_reason,
    lastActivitySummary: row.last_activity_summary,
  };
}

export function upsertSession(db: Database.Database, session: Session): void {
  db.prepare(
    `INSERT INTO session (id, parent_session_id, owner, title, status, started_at, ended_at, cwd, model, recap, fail_reason, last_activity_summary)
     VALUES (@id, @parentSessionId, @owner, @title, @status, @startedAt, @endedAt, @cwd, @model, @recap, @failReason, @lastActivitySummary)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       title = excluded.title,
       ended_at = excluded.ended_at,
       recap = excluded.recap,
       fail_reason = excluded.fail_reason,
       last_activity_summary = excluded.last_activity_summary`
  ).run(session);
}

export function getSession(db: Database.Database, id: string): Session | undefined {
  const row = db.prepare(`SELECT * FROM session WHERE id = ?`).get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function listSessions(db: Database.Database): Session[] {
  const rows = db.prepare(`SELECT * FROM session ORDER BY started_at ASC`).all() as SessionRow[];
  return rows.map(rowToSession);
}

export function touchSessionActivity(db: Database.Database, id: string, ts: string): void {
  db.prepare(`UPDATE session SET last_activity_at = ? WHERE id = ?`).run(ts, id);
}

export function listRunningSessionActivity(db: Database.Database): StaleCandidate[] {
  const rows = db
    .prepare(`SELECT id, status, last_activity_at FROM session WHERE status = 'running'`)
    .all() as Array<{ id: string; status: SessionStatus; last_activity_at: string | null }>;
  return rows.map((row) => ({ id: row.id, status: row.status, lastActivityAt: row.last_activity_at }));
}

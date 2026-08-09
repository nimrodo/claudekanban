import type Database from "better-sqlite3";
import type { SessionShape, SessionStatus } from "../domain/types.js";

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
  };
}

export function upsertSession(db: Database.Database, session: Session): void {
  db.prepare(
    `INSERT INTO session (id, parent_session_id, owner, title, status, started_at, ended_at, cwd, model, recap)
     VALUES (@id, @parentSessionId, @owner, @title, @status, @startedAt, @endedAt, @cwd, @model, @recap)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       title = excluded.title,
       ended_at = excluded.ended_at,
       recap = excluded.recap`
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

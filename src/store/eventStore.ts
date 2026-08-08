import type Database from "better-sqlite3";

export interface EventRecord {
  id: number;
  sessionId: string;
  ts: string;
  type: string;
  payload: string;
}

interface EventRow {
  id: number;
  session_id: string;
  ts: string;
  type: string;
  payload: string;
}

export function insertEvent(
  db: Database.Database,
  sessionId: string,
  ts: string,
  type: string,
  payload: unknown
): EventRecord {
  const serialized = JSON.stringify(payload);
  const result = db
    .prepare(`INSERT INTO event (session_id, ts, type, payload) VALUES (?, ?, ?, ?)`)
    .run(sessionId, ts, type, serialized);
  return { id: Number(result.lastInsertRowid), sessionId, ts, type, payload: serialized };
}

export function listEventsForSession(db: Database.Database, sessionId: string): EventRecord[] {
  const rows = db
    .prepare(`SELECT * FROM event WHERE session_id = ? ORDER BY id ASC`)
    .all(sessionId) as EventRow[];
  return rows.map((row) => ({ id: row.id, sessionId: row.session_id, ts: row.ts, type: row.type, payload: row.payload }));
}

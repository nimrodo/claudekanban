import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrateSessionColumns } from "./db.js";

function oldShapeDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE session (
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
  `);
  return db;
}

describe("migrateSessionColumns", () => {
  it("retrofits last_activity_at, fail_reason, and last_activity_summary onto a session table missing all three", () => {
    const db = oldShapeDb();
    migrateSessionColumns(db);
    const columns = (db.prepare("PRAGMA table_info(session)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain("last_activity_at");
    expect(columns).toContain("fail_reason");
    expect(columns).toContain("last_activity_summary");
  });

  it("is a no-op when both columns already exist", () => {
    const db = oldShapeDb();
    migrateSessionColumns(db);
    expect(() => migrateSessionColumns(db)).not.toThrow();
  });
});

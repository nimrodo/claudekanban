import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSession, listSessions, upsertSession, type Session } from "./sessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8"));
  return db;
}

const baseSession: Session = {
  id: "sess-1",
  parentSessionId: null,
  owner: "main",
  title: null,
  status: "running",
  startedAt: "2026-08-08T10:00:00.000Z",
  endedAt: null,
  cwd: "/tmp/project",
  model: "claude-sonnet-5",
  recap: null,
  failReason: null,
};

describe("sessionStore", () => {
  it("inserts a new session and reads it back", () => {
    const db = testDb();
    upsertSession(db, baseSession);
    expect(getSession(db, "sess-1")).toEqual(baseSession);
  });

  it("updates status/ended_at/recap on conflict, leaves other fields alone", () => {
    const db = testDb();
    upsertSession(db, baseSession);
    upsertSession(db, { ...baseSession, status: "done", endedAt: "2026-08-08T10:05:00.000Z", recap: "All done." });
    expect(getSession(db, "sess-1")).toEqual({
      ...baseSession,
      status: "done",
      endedAt: "2026-08-08T10:05:00.000Z",
      recap: "All done.",
    });
  });

  it("round-trips failReason through insert and update", () => {
    const db = testDb();
    upsertSession(db, baseSession);
    upsertSession(db, { ...baseSession, status: "failed", failReason: "No activity for 30 minutes" });
    expect(getSession(db, "sess-1")?.failReason).toBe("No activity for 30 minutes");
  });

  it("updates title on conflict when a later upsert sets a new value", () => {
    const db = testDb();
    upsertSession(db, { ...baseSession, title: null });
    upsertSession(db, { ...baseSession, title: "Find TODO occurrences" });
    expect(getSession(db, "sess-1")?.title).toBe("Find TODO occurrences");
  });

  it("persists title through getSession", () => {
    const db = testDb();
    upsertSession(db, { ...baseSession, title: "Find TODO occurrences" });
    expect(getSession(db, "sess-1")?.title).toBe("Find TODO occurrences");
  });

  it("lists sessions ordered by startedAt ascending", () => {
    const db = testDb();
    upsertSession(db, { ...baseSession, id: "sess-2", startedAt: "2026-08-08T10:01:00.000Z" });
    upsertSession(db, baseSession);
    expect(listSessions(db).map((s) => s.id)).toEqual(["sess-1", "sess-2"]);
  });

  it("returns undefined for a missing session", () => {
    const db = testDb();
    expect(getSession(db, "missing")).toBeUndefined();
  });
});

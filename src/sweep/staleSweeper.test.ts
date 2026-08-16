import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSession, touchSessionActivity, upsertSession, type Session } from "../store/sessionStore.js";
import { runStaleSweep } from "./staleSweeper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "../store/schema.sql"), "utf-8"));
  return db;
}

const baseSession: Session = {
  id: "sess-1",
  parentSessionId: null,
  owner: "main",
  title: null,
  status: "running",
  startedAt: "2026-08-12T09:00:00.000Z",
  endedAt: null,
  cwd: "/tmp/project",
  model: "claude-sonnet-5",
  recap: null,
  failReason: null,
  lastActivitySummary: null,
};

describe("runStaleSweep", () => {
  it("transitions a stale running session to failed and sets endedAt", () => {
    const db = testDb();
    upsertSession(db, baseSession);
    touchSessionActivity(db, "sess-1", "2026-08-12T09:00:00.000Z");

    runStaleSweep(db, "2026-08-12T09:15:00.000Z", 10);

    const session = getSession(db, "sess-1");
    expect(session?.status).toBe("failed");
    expect(session?.endedAt).toBe("2026-08-12T09:15:00.000Z");
    expect(session?.failReason).toBe("No activity for 10 minutes");
  });

  it("leaves a recently active running session alone", () => {
    const db = testDb();
    upsertSession(db, baseSession);
    touchSessionActivity(db, "sess-1", "2026-08-12T09:10:00.000Z");

    runStaleSweep(db, "2026-08-12T09:15:00.000Z", 10);

    const session = getSession(db, "sess-1");
    expect(session?.status).toBe("running");
    expect(session?.endedAt).toBeNull();
  });

  it("leaves a done session alone even with no recorded activity", () => {
    const db = testDb();
    upsertSession(db, { ...baseSession, status: "done", endedAt: "2026-08-12T09:05:00.000Z" });

    runStaleSweep(db, "2026-08-12T09:15:00.000Z", 10);

    expect(getSession(db, "sess-1")?.status).toBe("done");
  });
});

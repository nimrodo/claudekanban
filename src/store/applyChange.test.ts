import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Session } from "./sessionStore.js";

vi.mock("../domain/changeEmitter.js", () => ({ changeEmitter: new EventEmitter() }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8"));
  return db;
}

const session: Session = {
  id: "sess-1",
  parentSessionId: null,
  owner: "main",
  title: null,
  status: "running",
  startedAt: "2026-08-12T10:00:00.000Z",
  endedAt: null,
  cwd: "/tmp/project",
  model: null,
  recap: null,
  failReason: null,
};

describe("applySessionChange", () => {
  it("upserts the session, touches its activity timestamp, and emits session-changed", async () => {
    const { applySessionChange } = await import("./applyChange.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { getSession, listRunningSessionActivity } = await import("./sessionStore.js");

    const db = testDb();
    const seen: Array<{ session: Session; eventId?: number }> = [];
    changeEmitter.on("session-changed", (s: Session, eventId?: number) => seen.push({ session: s, eventId }));

    applySessionChange(db, session, "2026-08-12T10:05:00.000Z", 42);

    expect(getSession(db, "sess-1")).toEqual(session);
    expect(listRunningSessionActivity(db)).toEqual([
      { id: "sess-1", status: "running", lastActivityAt: "2026-08-12T10:05:00.000Z" },
    ]);
    expect(seen).toEqual([{ session, eventId: 42 }]);
  });

  it("emits with eventId undefined when none is provided", async () => {
    const { applySessionChange } = await import("./applyChange.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");

    const db = testDb();
    const seen: Array<{ session: Session; eventId?: number }> = [];
    changeEmitter.on("session-changed", (s: Session, eventId?: number) => seen.push({ session: s, eventId }));

    applySessionChange(db, session, "2026-08-12T10:05:00.000Z");

    expect(seen).toEqual([{ session, eventId: undefined }]);
  });
});

import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertEvent, listEventsForSession } from "./eventStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8"));
  return db;
}

describe("eventStore", () => {
  it("inserts an event and assigns an incrementing id", () => {
    const db = testDb();
    const e1 = insertEvent(db, "sess-1", "2026-08-08T10:00:00.000Z", "SessionStart", { cwd: "/tmp" });
    const e2 = insertEvent(db, "sess-1", "2026-08-08T10:00:01.000Z", "Stop", { last_assistant_message: "done" });
    expect(e1.id).toBeLessThan(e2.id);
    expect(e1.payload).toBe(JSON.stringify({ cwd: "/tmp" }));
  });

  it("lists events for a session in insertion order", () => {
    const db = testDb();
    insertEvent(db, "sess-1", "2026-08-08T10:00:00.000Z", "SessionStart", {});
    insertEvent(db, "sess-2", "2026-08-08T10:00:00.500Z", "SessionStart", {});
    insertEvent(db, "sess-1", "2026-08-08T10:00:01.000Z", "Stop", {});
    const events = listEventsForSession(db, "sess-1");
    expect(events.map((e) => e.type)).toEqual(["SessionStart", "Stop"]);
  });
});

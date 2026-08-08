import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "http";
import { createApiRouter } from "./routes.js";
import { upsertSession } from "../store/sessionStore.js";
import { insertEvent } from "../store/eventStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "../store/schema.sql"), "utf-8"));
  return db;
}

async function startTestServer(db: Database.Database): Promise<{ baseUrl: string; close: () => void }> {
  const app = express();
  app.use("/api", createApiRouter(db));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port assigned");
  return { baseUrl: `http://127.0.0.1:${address.port}`, close: () => server.close() };
}

function getJson(url: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    request.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) }));
    }).on("error", reject);
  });
}

describe("api routes", () => {
  it("GET /api/state returns all sessions", async () => {
    const db = testDb();
    upsertSession(db, {
      id: "sess-1",
      parentSessionId: null,
      owner: "main",
      status: "running",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp",
      model: null,
      recap: null,
    });
    const { baseUrl, close } = await startTestServer(db);
    const { status, body } = await getJson(`${baseUrl}/api/state`);
    close();
    expect(status).toBe(200);
    expect((body as { sessions: unknown[] }).sessions).toHaveLength(1);
  });

  it("GET /api/sessions/:id returns session + events", async () => {
    const db = testDb();
    upsertSession(db, {
      id: "sess-1",
      parentSessionId: null,
      owner: "main",
      status: "done",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: "2026-08-08T10:01:00.000Z",
      cwd: "/tmp",
      model: null,
      recap: "done",
    });
    insertEvent(db, "sess-1", "2026-08-08T10:00:00.000Z", "SessionStart", {});
    const { baseUrl, close } = await startTestServer(db);
    const { status, body } = await getJson(`${baseUrl}/api/sessions/sess-1`);
    close();
    expect(status).toBe(200);
    const parsed = body as { session: { id: string }; events: unknown[] };
    expect(parsed.session.id).toBe("sess-1");
    expect(parsed.events).toHaveLength(1);
  });

  it("GET /api/sessions/:id returns 404 for a missing session", async () => {
    const db = testDb();
    const { baseUrl, close } = await startTestServer(db);
    const { status } = await getJson(`${baseUrl}/api/sessions/missing`);
    close();
    expect(status).toBe(404);
  });
});

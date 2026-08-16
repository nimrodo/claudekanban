import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Request, Response } from "express";
import { createIngestHandler } from "./ingest.js";
import { getSession } from "../store/sessionStore.js";
import { listEventsForSession } from "../store/eventStore.js";
import { changeEmitter } from "../domain/changeEmitter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function testDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(fs.readFileSync(path.join(__dirname, "../store/schema.sql"), "utf-8"));
  return db;
}

function fakeRes() {
  const res = { statusCode: 0, body: undefined as unknown };
  return {
    res,
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.body = body;
      return this;
    },
  } as unknown as Response & { res: typeof res };
}

describe("createIngestHandler", () => {
  it("rejects a payload missing hook_event_name or session_id", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    const res = fakeRes();
    handler({ body: { session_id: "sess-1" } } as Request, res);
    expect(res.res.statusCode).toBe(400);
  });

  it("writes an event row and creates a running session on SessionStart", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    const res = fakeRes();
    handler(
      { body: { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/tmp", model: "claude-sonnet-5" } } as Request,
      res
    );
    expect(res.res.statusCode).toBe(200);
    const session = getSession(db, "sess-1");
    expect(session?.status).toBe("running");
    expect(session?.cwd).toBe("/tmp");
    expect(listEventsForSession(db, "sess-1")).toHaveLength(1);
  });

  it("sets recap and endedAt on Stop", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      { body: { hook_event_name: "Stop", session_id: "sess-1", last_assistant_message: "All done." } } as Request,
      fakeRes()
    );
    const session = getSession(db, "sess-1");
    expect(session?.status).toBe("done");
    expect(session?.recap).toBe("All done.");
    expect(session?.endedAt).not.toBeNull();
  });

  it("sets lastActivitySummary from the summarized event on every write", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/tmp" } } as Request, fakeRes());
    expect(getSession(db, "sess-1")?.lastActivitySummary).toBe("Session started");

    handler(
      { body: { hook_event_name: "PostToolUse", session_id: "sess-1", cwd: "/tmp", tool_name: "Bash" } } as Request,
      fakeRes()
    );
    expect(getSession(db, "sess-1")?.lastActivitySummary).toBe("Called Bash");
  });

  it("synthesizes a child session from a PostToolUse Agent spawn", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());

    const seen: string[] = [];
    const listener = (session: { id: string }) => seen.push(session.id);
    changeEmitter.on("session-changed", listener);
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_input: { subagent_type: "Explore" },
          tool_response: { agentId: "agent-123" },
        },
      } as Request,
      fakeRes()
    );
    changeEmitter.off("session-changed", listener);

    const child = getSession(db, "agent-123");
    expect(child?.status).toBe("done");
    expect(child?.parentSessionId).toBe("parent-1");
    expect(child?.owner).toBe("Explore");
    expect(seen).toEqual(["parent-1", "agent-123"]);
  });

  it("skips subagent synthesis when tool_input is missing on PostToolUse", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    const res = fakeRes();
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_response: { agentId: "agent-123" },
        },
      } as Request,
      res
    );
    expect(res.res.statusCode).toBe(200);
    expect(getSession(db, "agent-123")).toBeUndefined();
  });

  it("creates a running child session on SubagentStart", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-123");
    expect(child?.status).toBe("running");
    expect(child?.owner).toBe("Explore");
    expect(child?.parentSessionId).toBe("parent-1");
    expect(child?.title).toBeNull();
  });

  it("ignores SubagentStart with an empty agent_type", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: { hook_event_name: "SubagentStart", session_id: "parent-1", cwd: "/tmp", agent_id: "agent-123", agent_type: "" },
      } as Request,
      fakeRes()
    );
    expect(getSession(db, "agent-123")).toBeUndefined();
  });

  it("transitions a subagent from running to done via SubagentStart then SubagentStop", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    expect(getSession(db, "agent-123")?.status).toBe("running");

    handler(
      {
        body: { hook_event_name: "SubagentStop", session_id: "parent-1", agent_id: "agent-123", agent_type: "Explore" },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-123");
    expect(child?.status).toBe("done");
    expect(child?.endedAt).not.toBeNull();
  });

  it("merges title into an existing running/done child from PostToolUse instead of re-creating it", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: { hook_event_name: "SubagentStop", session_id: "parent-1", agent_id: "agent-123", agent_type: "Explore" },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
          tool_response: { agentId: "agent-123" },
        },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-123");
    expect(child?.title).toBe("Find TODO occurrences");
    expect(child?.status).toBe("done");
    expect(child?.startedAt).toBeTruthy();
  });

  it("escalates an existing child to failed when PostToolUse reports a tool_response error", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: { hook_event_name: "SubagentStop", session_id: "parent-1", agent_id: "agent-123", agent_type: "Explore" },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_input: { subagent_type: "Explore" },
          tool_response: { agentId: "agent-123", error: "boom" },
        },
      } as Request,
      fakeRes()
    );
    expect(getSession(db, "agent-123")?.status).toBe("failed");
  });

  it("does not clobber a finished child if SubagentStart arrives late (after SubagentStop)", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: { hook_event_name: "SubagentStop", session_id: "parent-1", agent_id: "agent-123", agent_type: "Explore" },
      } as Request,
      fakeRes()
    );
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
          tool_response: { agentId: "agent-123" },
        },
      } as Request,
      fakeRes()
    );
    expect(getSession(db, "agent-123")?.status).toBe("done");
    expect(getSession(db, "agent-123")?.title).toBe("Find TODO occurrences");

    // A duplicate/late SubagentStart for the same agent_id arrives after everything else resolved.
    handler(
      {
        body: {
          hook_event_name: "SubagentStart",
          session_id: "parent-1",
          cwd: "/tmp",
          agent_id: "agent-123",
          agent_type: "Explore",
        },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-123");
    expect(child?.status).toBe("done");
    expect(child?.title).toBe("Find TODO occurrences");
  });

  it("still falls back to full synthesis from PostToolUse when SubagentStart never arrived", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    handler({ body: { hook_event_name: "SessionStart", session_id: "parent-1", cwd: "/tmp" } } as Request, fakeRes());
    handler(
      {
        body: {
          hook_event_name: "PostToolUse",
          session_id: "parent-1",
          cwd: "/tmp",
          tool_name: "Agent",
          tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
          tool_response: { agentId: "agent-456" },
        },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-456");
    expect(child?.status).toBe("done");
    expect(child?.title).toBe("Find TODO occurrences");
  });

  it("emits session-changed on changeEmitter for every write", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    const seen: string[] = [];
    const listener = (session: { id: string }) => seen.push(session.id);
    changeEmitter.on("session-changed", listener);
    handler({ body: { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/tmp" } } as Request, fakeRes());
    changeEmitter.off("session-changed", listener);
    expect(seen).toEqual(["sess-1"]);
  });
});

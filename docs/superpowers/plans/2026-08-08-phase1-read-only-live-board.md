# Phase 1 — Read-Only Live Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest real Claude Code hook events (via HTTP) into SQLite, and render every session/subagent as a live-updating card on a kanban board in the browser, with no manual refresh.

**Architecture:** Single Node/TypeScript process (Express) exposes `POST /ingest` for hook scripts, `GET /api/state` + `GET /api/sessions/:id` for reads, and `GET /stream` (SSE) for live push. SQLite (`better-sqlite3`) is the sole source of truth, written only by the `store` layer. A React/Vite SPA talks to the backend exclusively through a `Transport` interface (never `fetch`/`EventSource` directly), per the spec's VSCode-compatibility requirement.

**Tech Stack:** TypeScript, Node.js, Express, `better-sqlite3`, React, Vite, Vitest (backend unit tests + React component tests, one framework for both).

## Global Constraints

- Single package, root `package.json` — no monorepo tooling (per spec's Repository structure).
- SQLite is the sole persistent store; no ORM, `schema.sql` applied with `CREATE TABLE IF NOT EXISTS` on startup (spec, Backend design).
- Server→client push is SSE only, no WebSocket (spec, Recommended architecture).
- Frontend never calls `fetch`/`EventSource` outside `src/frontend/lib/transport/` — all access goes through the `Transport` interface (spec, Frontend design — VSCode-extension compatibility).
- Phase 1 is read-only: no `intervention` table, no `/intervene` endpoint, no polling hook script. Deferred to the Phase 3 plan.
- Confirmed hook payload fields (Phase 0, `spike/findings.md`): `SessionStart` — `session_id`, `cwd`, `model`; `PostToolUse` — `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_response`; `Stop` — `session_id`, `last_assistant_message`; `PermissionRequest` — `session_id`, `cwd`, `tool_name`, `tool_input`; `Notification` — `session_id`, `cwd`, `notification_type` (value `idle_prompt` confirmed live; `permission_prompt` documented but not observed — do not rely on it).
- Subagent synthesis rule (resolved during plan review, see `docs/superpowers/specs/2026-08-07-operations-console-design.md` Domain model note and `spike/findings.md` "Subagent linkage"): a synchronous subagent's `Session` row is synthesized entirely from the parent's single `PostToolUse` event (`tool_name` is `"Agent"` or `"Task"`), keyed by `tool_response.agentId`, and is created already `done`/`failed` — it never passes through an observable `running` frame in Phase 1. This is a known, intentional UX gap (see Task 3), not an oversight.

---

## File Structure

```
claudekanban/
  package.json
  tsconfig.json
  vitest.config.ts
  vite.config.ts
  index.html
  claudekanban.db              # created at runtime, gitignored
  src/
    store/
      schema.sql                # session + event tables only (Phase 1)
      db.ts                     # createDb(dbPath) -> Database
      sessionStore.ts           # Session type, upsertSession, getSession, listSessions
      eventStore.ts             # EventRecord type, insertEvent, listEventsForSession
    domain/
      changeEmitter.ts          # shared EventEmitter singleton
      stateMachine.ts           # deriveStatus(currentStatus, hookPayload) -> SessionStatus
      subagentSynthesis.ts      # synthesizeSubagentSession(payload, receivedAt) -> Session | null
    ingest/
      ingest.ts                 # createIngestHandler(db) -> Express handler for POST /ingest
    api/
      routes.ts                 # createApiRouter(db) -> Express router for GET /api/state, GET /api/sessions/:id
    stream/
      broadcaster.ts            # handleSseConnection(res), subscribes to changeEmitter
    server.ts                   # wires everything into an Express app + app.listen
    frontend/
      main.tsx                  # React entry point
      lib/
        transport/
          Transport.ts          # Transport interface, StateResponse, StreamEvent, SessionDto types
          HttpSseTransport.ts   # fetch/EventSource-based Transport implementation
        useLiveState.ts         # React hook: initial fetch + SSE subscribe + refetch-on-change
      board/
        Board.tsx                # status columns, groups sessions by parent/child
        SessionCard.tsx          # single session/subagent card
  hooks/
    on-session-start.sh
    on-tool-use.sh
    on-stop.sh
    on-permission-request.sh
    on-notification.sh
```

---

### Task 1: Project scaffold + store (schema + query layer)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/store/schema.sql`
- Create: `src/store/db.ts`
- Create: `src/store/sessionStore.ts`
- Create: `src/store/eventStore.ts`
- Test: `src/store/sessionStore.test.ts`
- Test: `src/store/eventStore.test.ts`

**Interfaces:**
- Produces: `createDb(dbPath: string): Database.Database` (from `better-sqlite3`)
- Produces: `Session` type — `{ id: string; parentSessionId: string | null; owner: string; status: "queued" | "running" | "waiting" | "done" | "failed"; startedAt: string; endedAt: string | null; cwd: string; model: string | null; recap: string | null }`
- Produces: `upsertSession(db, session: Session): void`, `getSession(db, id: string): Session | undefined`, `listSessions(db): Session[]`
- Produces: `EventRecord` type — `{ id: number; sessionId: string; ts: string; type: string; payload: string }`
- Produces: `insertEvent(db, sessionId: string, ts: string, type: string, payload: unknown): EventRecord`, `listEventsForSession(db, sessionId: string): EventRecord[]`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claudekanban",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch src/server.ts",
    "dev:frontend": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "express": "^4.21.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.1",
    "@types/better-sqlite3": "^7.6.11",
    "@types/express": "^4.17.21",
    "@types/node": "^22.7.5",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.2",
    "jsdom": "^25.0.1",
    "tsx": "^4.19.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environmentMatchGlobs: [["src/frontend/**/*.test.tsx", "jsdom"]],
  },
});
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 5: Create `src/store/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  cwd TEXT NOT NULL,
  model TEXT,
  recap TEXT
);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);
```

- [ ] **Step 6: Create `src/store/db.ts`**

```ts
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  db.exec(schema);
  return db;
}
```

- [ ] **Step 7: Write the failing test for `sessionStore`**

Create `src/store/sessionStore.test.ts`:

```ts
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
  status: "running",
  startedAt: "2026-08-08T10:00:00.000Z",
  endedAt: null,
  cwd: "/tmp/project",
  model: "claude-sonnet-5",
  recap: null,
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
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npx vitest run src/store/sessionStore.test.ts`
Expected: FAIL — `Cannot find module './sessionStore.js'`

- [ ] **Step 9: Implement `src/store/sessionStore.ts`**

```ts
import type Database from "better-sqlite3";

export type SessionStatus = "queued" | "running" | "waiting" | "done" | "failed";

export interface Session {
  id: string;
  parentSessionId: string | null;
  owner: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
}

interface SessionRow {
  id: string;
  parent_session_id: string | null;
  owner: string;
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
    `INSERT INTO session (id, parent_session_id, owner, status, started_at, ended_at, cwd, model, recap)
     VALUES (@id, @parentSessionId, @owner, @status, @startedAt, @endedAt, @cwd, @model, @recap)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
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
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npx vitest run src/store/sessionStore.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 11: Write the failing test for `eventStore`**

Create `src/store/eventStore.test.ts`:

```ts
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
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npx vitest run src/store/eventStore.test.ts`
Expected: FAIL — `Cannot find module './eventStore.js'`

- [ ] **Step 13: Implement `src/store/eventStore.ts`**

```ts
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
```

- [ ] **Step 14: Run all store tests to verify they pass**

Run: `npx vitest run src/store`
Expected: PASS (6 tests)

- [ ] **Step 15: Add `.gitignore` and commit**

Create `.gitignore` (append if it already has entries from Phase 0 — keep the existing `.worktrees/`, `node_modules/`, `spike/captures/*.jsonl` lines):

```
dist/
*.db
*.db-journal
```

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore src/store package-lock.json
git commit -m "feat: scaffold project, add SQLite store layer for session and event"
```

---

### Task 2: Domain — state machine and subagent synthesis

**Files:**
- Create: `src/domain/stateMachine.ts`
- Create: `src/domain/subagentSynthesis.ts`
- Create: `src/domain/changeEmitter.ts`
- Test: `src/domain/stateMachine.test.ts`
- Test: `src/domain/subagentSynthesis.test.ts`

**Interfaces:**
- Consumes: `Session`, `SessionStatus` from `../store/sessionStore.js` (Task 1)
- Produces: `HookPayload` type (loose shape covering all Phase 1 hook events); `deriveStatus(currentStatus: SessionStatus | undefined, payload: HookPayload): SessionStatus`
- Produces: `synthesizeSubagentSession(payload: PostToolUsePayload, receivedAt: string): Session | null`
- Produces: `changeEmitter: EventEmitter` — singleton, emits `"session-changed"` with a `string` session id

- [ ] **Step 1: Write the failing test for `stateMachine`**

Create `src/domain/stateMachine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveStatus, type HookPayload } from "./stateMachine.js";

function payload(overrides: Partial<HookPayload>): HookPayload {
  return { hook_event_name: "SessionStart", session_id: "sess-1", ...overrides };
}

describe("deriveStatus", () => {
  it("SessionStart on a new session yields running", () => {
    expect(deriveStatus(undefined, payload({ hook_event_name: "SessionStart" }))).toBe("running");
  });

  it("PermissionRequest yields waiting", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "PermissionRequest" }))).toBe("waiting");
  });

  it("Notification with idle_prompt yields waiting", () => {
    expect(
      deriveStatus("running", payload({ hook_event_name: "Notification", notification_type: "idle_prompt" }))
    ).toBe("waiting");
  });

  it("Notification without idle_prompt leaves status unchanged", () => {
    expect(
      deriveStatus("running", payload({ hook_event_name: "Notification", notification_type: "auth_success" }))
    ).toBe("running");
  });

  it("PostToolUse after waiting returns to running", () => {
    expect(deriveStatus("waiting", payload({ hook_event_name: "PostToolUse" }))).toBe("running");
  });

  it("PostToolUse while running stays running", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "PostToolUse" }))).toBe("running");
  });

  it("Stop yields done", () => {
    expect(deriveStatus("running", payload({ hook_event_name: "Stop" }))).toBe("done");
  });

  it("unknown event preserves current status, defaulting to running if unset", () => {
    expect(deriveStatus(undefined, payload({ hook_event_name: "SomeFutureEvent" as HookPayload["hook_event_name"] }))).toBe(
      "running"
    );
    expect(deriveStatus("waiting", payload({ hook_event_name: "SomeFutureEvent" as HookPayload["hook_event_name"] }))).toBe(
      "waiting"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/stateMachine.test.ts`
Expected: FAIL — `Cannot find module './stateMachine.js'`

- [ ] **Step 3: Implement `src/domain/stateMachine.ts`**

```ts
import type { SessionStatus } from "../store/sessionStore.js";

export interface HookPayload {
  hook_event_name: string;
  session_id: string;
  cwd?: string;
  model?: string;
  tool_name?: string;
  tool_input?: { subagent_type?: string; [key: string]: unknown };
  tool_response?: { agentId?: string; error?: unknown; [key: string]: unknown };
  last_assistant_message?: string;
  notification_type?: string;
  [key: string]: unknown;
}

export function deriveStatus(currentStatus: SessionStatus | undefined, payload: HookPayload): SessionStatus {
  switch (payload.hook_event_name) {
    case "SessionStart":
      return "running";
    case "PermissionRequest":
      return "waiting";
    case "Notification":
      return payload.notification_type === "idle_prompt" ? "waiting" : currentStatus ?? "running";
    case "PostToolUse":
      return "running";
    case "Stop":
      return "done";
    default:
      return currentStatus ?? "running";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/stateMachine.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Write the failing test for `subagentSynthesis`**

Create `src/domain/subagentSynthesis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { synthesizeSubagentSession, type PostToolUsePayload } from "./subagentSynthesis.js";

function payload(overrides: Partial<PostToolUsePayload>): PostToolUsePayload {
  return {
    hook_event_name: "PostToolUse",
    session_id: "parent-1",
    cwd: "/tmp/project",
    tool_name: "Agent",
    tool_input: { subagent_type: "Explore" },
    tool_response: { agentId: "agent-123" },
    ...overrides,
  };
}

describe("synthesizeSubagentSession", () => {
  it("returns null for non-Agent/Task tool calls", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Bash" }), "2026-08-08T10:00:00.000Z")).toBeNull();
  });

  it("returns null when tool_response has no agentId (still running / not a subagent spawn)", () => {
    expect(synthesizeSubagentSession(payload({ tool_response: {} }), "2026-08-08T10:00:00.000Z")).toBeNull();
  });

  it("synthesizes a done child session from a successful Agent/Task call", () => {
    const child = synthesizeSubagentSession(payload({}), "2026-08-08T10:00:05.000Z");
    expect(child).toEqual({
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      status: "done",
      startedAt: "2026-08-08T10:00:05.000Z",
      endedAt: "2026-08-08T10:00:05.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
    });
  });

  it("synthesizes a failed child session when tool_response carries an error", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-456", error: "timed out" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.status).toBe("failed");
  });

  it("defaults owner to \"unknown\" when subagent_type is missing", () => {
    const child = synthesizeSubagentSession(payload({ tool_input: {} }), "2026-08-08T10:00:05.000Z");
    expect(child?.owner).toBe("unknown");
  });

  it("recognizes tool_name \"Task\" as well as \"Agent\"", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Task" }), "2026-08-08T10:00:05.000Z")).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/domain/subagentSynthesis.test.ts`
Expected: FAIL — `Cannot find module './subagentSynthesis.js'`

- [ ] **Step 7: Implement `src/domain/subagentSynthesis.ts`**

```ts
import type { Session } from "../store/sessionStore.js";

export interface PostToolUsePayload {
  hook_event_name: "PostToolUse";
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: { subagent_type?: string; [key: string]: unknown };
  tool_response?: { agentId?: string; error?: unknown; [key: string]: unknown };
}

export function synthesizeSubagentSession(payload: PostToolUsePayload, receivedAt: string): Session | null {
  if (payload.tool_name !== "Agent" && payload.tool_name !== "Task") return null;
  const agentId = payload.tool_response?.agentId;
  if (!agentId) return null;

  const failed = Boolean(payload.tool_response?.error);
  return {
    id: agentId,
    parentSessionId: payload.session_id,
    owner: payload.tool_input.subagent_type ?? "unknown",
    status: failed ? "failed" : "done",
    startedAt: receivedAt,
    endedAt: receivedAt,
    cwd: payload.cwd,
    model: null,
    recap: null,
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/domain/subagentSynthesis.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Create `src/domain/changeEmitter.ts`** (no test — a one-line singleton wiring, exercised indirectly by Task 3 and Task 6's tests)

```ts
import { EventEmitter } from "node:events";

export const changeEmitter = new EventEmitter();
```

- [ ] **Step 10: Run all domain tests to verify they pass**

Run: `npx vitest run src/domain`
Expected: PASS (14 tests)

- [ ] **Step 11: Commit**

```bash
git add src/domain
git commit -m "feat: add state machine and subagent-synthesis domain logic"
```

---

### Task 3: Ingest endpoint

**Files:**
- Create: `src/ingest/ingest.ts`
- Test: `src/ingest/ingest.test.ts`

**Interfaces:**
- Consumes: `insertEvent`, `upsertSession`, `getSession` from `../store/*.js` (Task 1); `deriveStatus` from `../domain/stateMachine.js` (Task 2); `synthesizeSubagentSession` from `../domain/subagentSynthesis.js` (Task 2); `changeEmitter` from `../domain/changeEmitter.js` (Task 2)
- Produces: `createIngestHandler(db: Database.Database): (req: Request, res: Response) => void` — an Express request handler for `POST /ingest`

- [ ] **Step 1: Write the failing test**

Create `src/ingest/ingest.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
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

  it("synthesizes a child session from a PostToolUse Agent spawn", () => {
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
          tool_input: { subagent_type: "Explore" },
          tool_response: { agentId: "agent-123" },
        },
      } as Request,
      fakeRes()
    );
    const child = getSession(db, "agent-123");
    expect(child?.status).toBe("done");
    expect(child?.parentSessionId).toBe("parent-1");
    expect(child?.owner).toBe("Explore");
  });

  it("emits session-changed on changeEmitter for every write", () => {
    const db = testDb();
    const handler = createIngestHandler(db);
    const seen: string[] = [];
    const listener = (id: string) => seen.push(id);
    changeEmitter.on("session-changed", listener);
    handler({ body: { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/tmp" } } as Request, fakeRes());
    changeEmitter.off("session-changed", listener);
    expect(seen).toEqual(["sess-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: FAIL — `Cannot find module './ingest.js'`

- [ ] **Step 3: Implement `src/ingest/ingest.ts`**

```ts
import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import { insertEvent } from "../store/eventStore.js";
import { upsertSession, getSession } from "../store/sessionStore.js";
import { deriveStatus, type HookPayload } from "../domain/stateMachine.js";
import { synthesizeSubagentSession, type PostToolUsePayload } from "../domain/subagentSynthesis.js";
import { changeEmitter } from "../domain/changeEmitter.js";

export function createIngestHandler(db: Database.Database) {
  return function handleIngest(req: Request, res: Response): void {
    const payload = req.body as HookPayload | undefined;
    if (!payload || typeof payload.hook_event_name !== "string" || typeof payload.session_id !== "string") {
      res.status(400).json({ ok: false, error: "missing hook_event_name or session_id" });
      return;
    }

    const receivedAt = new Date().toISOString();
    insertEvent(db, payload.session_id, receivedAt, payload.hook_event_name, payload);

    const existing = getSession(db, payload.session_id);
    const status = deriveStatus(existing?.status, payload);
    upsertSession(db, {
      id: payload.session_id,
      parentSessionId: existing?.parentSessionId ?? null,
      owner: existing?.owner ?? "main",
      status,
      startedAt: existing?.startedAt ?? receivedAt,
      endedAt: status === "done" || status === "failed" ? receivedAt : null,
      cwd: payload.cwd ?? existing?.cwd ?? "",
      model: payload.model ?? existing?.model ?? null,
      recap: payload.hook_event_name === "Stop" ? payload.last_assistant_message ?? null : existing?.recap ?? null,
    });
    changeEmitter.emit("session-changed", payload.session_id);

    if (payload.hook_event_name === "PostToolUse") {
      const child = synthesizeSubagentSession(payload as PostToolUsePayload, receivedAt);
      if (child) {
        upsertSession(db, child);
        changeEmitter.emit("session-changed", child.id);
      }
    }

    res.status(200).json({ ok: true });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ingest
git commit -m "feat: add POST /ingest handler wiring hooks into store and domain"
```

---

### Task 4: Real hook scripts

**Files:**
- Create: `hooks/on-session-start.sh`
- Create: `hooks/on-tool-use.sh`
- Create: `hooks/on-stop.sh`
- Create: `hooks/on-permission-request.sh`
- Create: `hooks/on-notification.sh`
- Test: `hooks/hooks.test.sh` (a plain shell smoke test, not Vitest — these are shell scripts, not TS)

**Interfaces:**
- Consumes: nothing from earlier tasks directly — POSTs raw hook JSON to `http://127.0.0.1:$CLAUDEKANBAN_PORT/ingest` (default port `4317`, matching Task 9's server default).
- Produces: nothing consumed by later tasks — these are the installable Claude Code hook commands referenced in the spec's `hooks/` directory and in this plan's Manual Test section.

All five scripts share the same body (forward stdin verbatim), matching the pattern validated in Phase 0 (`spike/hooks/*.sh`).

- [ ] **Step 1: Create `hooks/on-session-start.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${CLAUDEKANBAN_PORT:-4317}"
cat | curl -s -X POST "http://127.0.0.1:${PORT}/ingest" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 2: Create `hooks/on-tool-use.sh`, `hooks/on-stop.sh`, `hooks/on-permission-request.sh`, `hooks/on-notification.sh`**

Each file has identical content to Step 1 (only the filename differs — Claude Code selects the script by hook config, not by script content):

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${CLAUDEKANBAN_PORT:-4317}"
cat | curl -s -X POST "http://127.0.0.1:${PORT}/ingest" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 3: Make all five scripts executable**

Run: `chmod +x hooks/on-session-start.sh hooks/on-tool-use.sh hooks/on-stop.sh hooks/on-permission-request.sh hooks/on-notification.sh`

- [ ] **Step 4: Write a smoke test verifying each script forwards stdin to a listener**

Create `hooks/hooks.test.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

python3 -c "
import http.server, threading, sys
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers['Content-Length'])
        body = self.rfile.read(length)
        with open('$TMP_LOG', 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.end_headers()
    def log_message(self, *args):
        pass
server = http.server.HTTPServer(('127.0.0.1', 4317), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
import time
time.sleep(0.3)
" &
LISTENER_PID=$!
sleep 0.5

for script in hooks/on-session-start.sh hooks/on-tool-use.sh hooks/on-stop.sh hooks/on-permission-request.sh hooks/on-notification.sh; do
  echo '{"hook_event_name":"SessionStart","session_id":"smoke-test"}' | "$script"
  if ! grep -q "smoke-test" "$TMP_LOG"; then
    echo "FAIL: $script did not forward payload"
    kill "$LISTENER_PID" 2>/dev/null || true
    exit 1
  fi
  : > "$TMP_LOG"
done

kill "$LISTENER_PID" 2>/dev/null || true
echo "PASS: all hook scripts forward stdin correctly"
```

- [ ] **Step 5: Run test to verify it fails (before scripts exist — reorder check)**

This smoke test can only be meaningfully run after Step 1-3 (the scripts must exist to test them). Run it now, after creation, as the pass check:

Run: `chmod +x hooks/hooks.test.sh && ./hooks/hooks.test.sh`
Expected: `PASS: all hook scripts forward stdin correctly`

- [ ] **Step 6: Commit**

```bash
git add hooks
git commit -m "feat: add real Claude Code hook scripts forwarding to /ingest"
```

---

### Task 5: API read endpoints

**Files:**
- Create: `src/api/routes.ts`
- Test: `src/api/routes.test.ts`

**Interfaces:**
- Consumes: `listSessions`, `getSession` from `../store/sessionStore.js` (Task 1); `listEventsForSession` from `../store/eventStore.js` (Task 1)
- Produces: `createApiRouter(db: Database.Database): Router` (Express `Router`), mounted at `/api` by `server.ts` (Task 9) — exposes `GET /api/state` → `{ sessions: Session[] }` and `GET /api/sessions/:id` → `{ session: Session, events: EventRecord[] }` or 404 `{ ok: false, error: "not found" }`

- [ ] **Step 1: Write the failing test**

Create `src/api/routes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/routes.test.ts`
Expected: FAIL — `Cannot find module './routes.js'`

- [ ] **Step 3: Implement `src/api/routes.ts`**

```ts
import { Router } from "express";
import type Database from "better-sqlite3";
import { getSession, listSessions } from "../store/sessionStore.js";
import { listEventsForSession } from "../store/eventStore.js";

export function createApiRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/state", (_req, res) => {
    res.json({ sessions: listSessions(db) });
  });

  router.get("/sessions/:id", (req, res) => {
    const session = getSession(db, req.params.id);
    if (!session) {
      res.status(404).json({ ok: false, error: "not found" });
      return;
    }
    res.json({ session, events: listEventsForSession(db, session.id) });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/routes.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api
git commit -m "feat: add GET /api/state and GET /api/sessions/:id read endpoints"
```

---

### Task 6: SSE broadcaster

**Files:**
- Create: `src/stream/broadcaster.ts`
- Test: `src/stream/broadcaster.test.ts`

**Interfaces:**
- Consumes: `changeEmitter` from `../domain/changeEmitter.js` (Task 2)
- Produces: `handleSseConnection(res: Response): void` — writes SSE headers, registers `res` as a client, removes it on `"close"`; on any `changeEmitter` `"session-changed"` event, writes `data: {"type":"session-changed","entityId":"<id>"}\n\n` to every registered client.

- [ ] **Step 1: Write the failing test**

Create `src/stream/broadcaster.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Response } from "express";

vi.mock("../domain/changeEmitter.js", () => ({ changeEmitter: new EventEmitter() }));

function fakeResponse() {
  const written: string[] = [];
  const listeners: Record<string, () => void> = {};
  const res = {
    writeHead: vi.fn(),
    write: vi.fn((chunk: string) => {
      written.push(chunk);
    }),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    }),
  } as unknown as Response;
  return { res, written, triggerClose: () => listeners.close?.() };
}

describe("handleSseConnection", () => {
  it("writes SSE headers and registers the client", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { res } = fakeResponse();
    handleSseConnection(res);
    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ "Content-Type": "text/event-stream" })
    );
  });

  it("broadcasts a session-changed event to a registered client", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written } = fakeResponse();
    handleSseConnection(res);
    changeEmitter.emit("session-changed", "sess-1");
    expect(written).toEqual([`data: {"type":"session-changed","entityId":"sess-1"}\n\n`]);
  });

  it("stops writing to a client after it closes", async () => {
    const { handleSseConnection } = await import("./broadcaster.js");
    const { changeEmitter } = await import("../domain/changeEmitter.js");
    const { res, written, triggerClose } = fakeResponse();
    handleSseConnection(res);
    triggerClose();
    changeEmitter.emit("session-changed", "sess-1");
    expect(written).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stream/broadcaster.test.ts`
Expected: FAIL — `Cannot find module './broadcaster.js'`

- [ ] **Step 3: Implement `src/stream/broadcaster.ts`**

```ts
import type { Response } from "express";
import { changeEmitter } from "../domain/changeEmitter.js";

const clients = new Set<Response>();

export function handleSseConnection(res: Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  clients.add(res);
  res.on("close", () => {
    clients.delete(res);
  });
}

changeEmitter.on("session-changed", (sessionId: string) => {
  const payload = JSON.stringify({ type: "session-changed", entityId: sessionId });
  for (const res of clients) {
    res.write(`data: ${payload}\n\n`);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stream/broadcaster.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/stream
git commit -m "feat: add SSE broadcaster pushing session-changed deltas"
```

---

### Task 7: Frontend Transport interface + HttpSseTransport

**Files:**
- Create: `src/frontend/lib/transport/Transport.ts`
- Create: `src/frontend/lib/transport/HttpSseTransport.ts`
- Test: `src/frontend/lib/transport/HttpSseTransport.test.ts`

**Interfaces:**
- Produces: `SessionDto` type (same shape as `Session` from Task 1, camelCase field names, serialized over JSON — `{ id, parentSessionId, owner, status, startedAt, endedAt, cwd, model, recap }`)
- Produces: `StateResponse` — `{ sessions: SessionDto[] }`; `StreamEvent` — `{ type: string; entityId: string }`
- Produces: `Transport` interface — `{ getState(): Promise<StateResponse>; subscribe(onEvent: (event: StreamEvent) => void): () => void }`
- Produces: `HttpSseTransport` class implementing `Transport`, constructed as `new HttpSseTransport(baseUrl?: string)`

- [ ] **Step 1: Create `src/frontend/lib/transport/Transport.ts`** (types only — no test needed, exercised by Task 7 Step 2 and Task 8's tests)

```ts
export type SessionStatus = "queued" | "running" | "waiting" | "done" | "failed";

export interface SessionDto {
  id: string;
  parentSessionId: string | null;
  owner: string;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
}

export interface StateResponse {
  sessions: SessionDto[];
}

export interface StreamEvent {
  type: string;
  entityId: string;
}

export interface Transport {
  getState(): Promise<StateResponse>;
  subscribe(onEvent: (event: StreamEvent) => void): () => void;
}
```

- [ ] **Step 2: Write the failing test for `HttpSseTransport`**

Create `src/frontend/lib/transport/HttpSseTransport.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { HttpSseTransport } from "./HttpSseTransport.js";

describe("HttpSseTransport", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [{ id: "sess-1" }] }) }))
    );
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(function (this: { close: () => void; onmessage: ((e: { data: string }) => void) | null }) {
        this.close = vi.fn();
        this.onmessage = null;
      })
    );
  });

  it("getState fetches /api/state and returns parsed JSON", async () => {
    const transport = new HttpSseTransport();
    const state = await transport.getState();
    expect(fetch).toHaveBeenCalledWith("/api/state");
    expect(state.sessions).toEqual([{ id: "sess-1" }]);
  });

  it("getState throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const transport = new HttpSseTransport();
    await expect(transport.getState()).rejects.toThrow("GET /api/state failed: 500");
  });

  it("subscribe opens an EventSource on /stream and forwards parsed messages", () => {
    const transport = new HttpSseTransport();
    const received: unknown[] = [];
    transport.subscribe((event) => received.push(event));
    expect(EventSource).toHaveBeenCalledWith("/stream");
    const instance = (EventSource as unknown as { mock: { instances: Array<{ onmessage: (e: { data: string }) => void }> } })
      .mock.instances[0];
    instance.onmessage({ data: JSON.stringify({ type: "session-changed", entityId: "sess-1" }) });
    expect(received).toEqual([{ type: "session-changed", entityId: "sess-1" }]);
  });

  it("subscribe's returned unsubscribe function closes the EventSource", () => {
    const transport = new HttpSseTransport();
    const unsubscribe = transport.subscribe(() => {});
    const instance = (EventSource as unknown as { mock: { instances: Array<{ close: () => void }> } }).mock.instances[0];
    unsubscribe();
    expect(instance.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/frontend/lib/transport/HttpSseTransport.test.ts`
Expected: FAIL — `Cannot find module './HttpSseTransport.js'`

- [ ] **Step 4: Implement `src/frontend/lib/transport/HttpSseTransport.ts`**

```ts
import type { StateResponse, StreamEvent, Transport } from "./Transport.js";

export class HttpSseTransport implements Transport {
  constructor(private readonly baseUrl: string = "") {}

  async getState(): Promise<StateResponse> {
    const res = await fetch(`${this.baseUrl}/api/state`);
    if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
    return res.json() as Promise<StateResponse>;
  }

  subscribe(onEvent: (event: StreamEvent) => void): () => void {
    const source = new EventSource(`${this.baseUrl}/stream`);
    source.onmessage = (evt: MessageEvent<string>) => {
      onEvent(JSON.parse(evt.data) as StreamEvent);
    };
    return () => source.close();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/frontend/lib/transport/HttpSseTransport.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/frontend/lib/transport
git commit -m "feat: add Transport interface and HttpSseTransport implementation"
```

---

### Task 8: `useLiveState` hook

**Files:**
- Create: `src/frontend/lib/useLiveState.ts`
- Test: `src/frontend/lib/useLiveState.test.tsx`

**Interfaces:**
- Consumes: `Transport`, `SessionDto` from `./transport/Transport.js` (Task 7)
- Produces: `useLiveState(transport: Transport): { sessions: SessionDto[] }`

**Note on spec deviation:** the spec's Real-time update design describes clients "applying the patch to local state" from the SSE delta. Phase 1's SSE payload only carries `{type, entityId}` (Task 6) — no field-level patch data, since the domain layer doesn't compute diffs. `useLiveState` instead refetches the full `GET /api/state` on every change notification and replaces local state wholesale. For the session counts expected in this MVP (single developer, single digits to low tens of concurrent sessions per the spec's Hidden assumptions), this is cheap and simpler than implementing real patch application, while still being fully event-driven (no polling). Flagging this explicitly rather than silently diverging from the spec's wording; revisit if per-change payload size becomes a real cost.

- [ ] **Step 1: Write the failing test**

Create `src/frontend/lib/useLiveState.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLiveState } from "./useLiveState.js";
import type { SessionDto, StreamEvent, Transport } from "./transport/Transport.js";

function makeSession(id: string): SessionDto {
  return {
    id,
    parentSessionId: null,
    owner: "main",
    status: "running",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp",
    model: null,
    recap: null,
  };
}

function fakeTransport(initial: SessionDto[]): { transport: Transport; emit: (e: StreamEvent) => void; state: SessionDto[] } {
  let state = initial;
  let listener: ((event: StreamEvent) => void) | null = null;
  const transport: Transport = {
    getState: async () => ({ sessions: state }),
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit: (event: StreamEvent) => listener?.(event),
    get state() {
      return state;
    },
    set state(next: SessionDto[]) {
      state = next;
    },
  } as unknown as { transport: Transport; emit: (e: StreamEvent) => void; state: SessionDto[] };
}

describe("useLiveState", () => {
  it("loads initial state from transport.getState()", async () => {
    const { transport } = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0].id).toBe("sess-1");
  });

  it("refetches state when a stream event arrives", async () => {
    const helper = fakeTransport([makeSession("sess-1")]);
    const { result } = renderHook(() => useLiveState(helper.transport));
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    helper.state = [makeSession("sess-1"), makeSession("sess-2")];
    helper.emit({ type: "session-changed", entityId: "sess-2" });

    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/frontend/lib/useLiveState.test.tsx`
Expected: FAIL — `Cannot find module './useLiveState.js'`

- [ ] **Step 3: Implement `src/frontend/lib/useLiveState.ts`**

```ts
import { useEffect, useState } from "react";
import type { SessionDto, Transport } from "./transport/Transport.js";

export function useLiveState(transport: Transport): { sessions: SessionDto[] } {
  const [sessions, setSessions] = useState<SessionDto[]>([]);

  useEffect(() => {
    let cancelled = false;

    transport.getState().then((state) => {
      if (!cancelled) setSessions(state.sessions);
    });

    const unsubscribe = transport.subscribe(() => {
      transport.getState().then((state) => {
        if (!cancelled) setSessions(state.sessions);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [transport]);

  return { sessions };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/frontend/lib/useLiveState.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/lib/useLiveState.ts src/frontend/lib/useLiveState.test.tsx
git commit -m "feat: add useLiveState hook (initial fetch + SSE-triggered refetch)"
```

---

### Task 9: Board UI, server wiring, and dev entry points

**Files:**
- Create: `src/frontend/board/Board.tsx`
- Create: `src/frontend/board/SessionCard.tsx`
- Test: `src/frontend/board/Board.test.tsx`
- Create: `src/frontend/main.tsx`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `src/server.ts`

**Interfaces:**
- Consumes: `SessionDto` from `./lib/transport/Transport.js` (Task 7); `useLiveState` from `./lib/useLiveState.js` (Task 8); `createDb` (Task 1), `createIngestHandler` (Task 3), `createApiRouter` (Task 5), `handleSseConnection` (Task 6) for `server.ts`
- Produces: `Board({ sessions: SessionDto[] })` React component; `SessionCard({ session: SessionDto; children: SessionDto[] })` React component

- [ ] **Step 1: Write the failing test for `Board`**

Create `src/frontend/board/Board.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Board } from "./Board.js";
import type { SessionDto } from "../lib/transport/Transport.js";

function session(overrides: Partial<SessionDto>): SessionDto {
  return {
    id: "sess-1",
    parentSessionId: null,
    owner: "main",
    status: "running",
    startedAt: "2026-08-08T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp",
    model: null,
    recap: null,
    ...overrides,
  };
}

describe("Board", () => {
  it("renders a top-level session under its status column", () => {
    render(<Board sessions={[session({ id: "sess-1", status: "running" })]} />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("groups a subagent card under its parent, not as a top-level card", () => {
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "done" }),
        ]}
      />
    );
    expect(screen.getByText("Explore")).toBeInTheDocument();
    // Only one top-level card container should exist for the "running" column.
    expect(screen.getAllByText("main")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: FAIL — `Cannot find module './Board.js'`

- [ ] **Step 3: Implement `src/frontend/board/SessionCard.tsx`**

```tsx
import type { SessionDto } from "../lib/transport/Transport.js";

export function SessionCard({ session, children }: { session: SessionDto; children: SessionDto[] }) {
  return (
    <div className="card">
      <div className="card-owner">{session.owner}</div>
      <div className="card-id">{session.id.slice(0, 8)}</div>
      <div className="card-status">{session.status}</div>
      {children.length > 0 && (
        <div className="card-children">
          {children.map((child) => (
            <div key={child.id} className="child-card">
              <span className="card-owner">{child.owner}</span>
              <span className="card-status">{child.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Implement `src/frontend/board/Board.tsx`**

```tsx
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function Board({ sessions }: { sessions: SessionDto[] }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const topLevel = sessions.filter((s) => !s.parentSessionId || !byId.has(s.parentSessionId));

  return (
    <div className="board">
      {STATUS_COLUMNS.map((status) => (
        <div key={status} className="column">
          <h2>{status}</h2>
          {topLevel
            .filter((s) => s.status === status)
            .map((s) => (
              <SessionCard key={s.id} session={s} children={sessions.filter((c) => c.parentSessionId === s.id)} />
            ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the `frontend-design` skill for visual polish**

This step is a live design pass, not code written in this plan. Invoke the `frontend-design` skill against `src/frontend/board/Board.tsx` and `SessionCard.tsx` with the brief: "operations console kanban board for Claude Code sessions — status columns (queued/running/waiting/done/failed), session cards with owner badge and parent/child subagent grouping." Apply the resulting palette/type/layout as CSS (a `src/frontend/board/board.css` file imported from `Board.tsx`), without changing the component logic or breaking the Step 5 tests. Re-run `npx vitest run src/frontend/board/Board.test.tsx` after styling to confirm it still passes.

- [ ] **Step 7: Create `src/frontend/main.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import { Board } from "./board/Board.js";
import { useLiveState } from "./lib/useLiveState.js";
import { HttpSseTransport } from "./lib/transport/HttpSseTransport.js";

const transport = new HttpSseTransport();

function App() {
  const { sessions } = useLiveState(transport);
  return <Board sessions={sessions} />;
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");
createRoot(container).render(<App />);
```

- [ ] **Step 8: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>claudekanban</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/frontend/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Create `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4317",
      "/stream": { target: "http://localhost:4317", ws: false },
      "/ingest": "http://localhost:4317",
    },
  },
});
```

- [ ] **Step 10: Create `src/server.ts`**

```ts
import express from "express";
import { createDb } from "./store/db.js";
import { createIngestHandler } from "./ingest/ingest.js";
import { createApiRouter } from "./api/routes.js";
import { handleSseConnection } from "./stream/broadcaster.js";

const PORT = Number(process.env.CLAUDEKANBAN_PORT ?? 4317);
const DB_PATH = process.env.CLAUDEKANBAN_DB_PATH ?? "claudekanban.db";

const db = createDb(DB_PATH);
const app = express();
app.use(express.json({ limit: "5mb" }));

app.post("/ingest", createIngestHandler(db));
app.use("/api", createApiRouter(db));
app.get("/stream", (_req, res) => handleSseConnection(res));

app.listen(PORT, () => {
  console.log(`claudekanban backend listening on http://localhost:${PORT}`);
});
```

- [ ] **Step 11: Run the full test suite to verify nothing is broken**

Run: `npx vitest run`
Expected: PASS (all tests across every task)

- [ ] **Step 12: Manually smoke-test the dev servers**

Run: `npm run dev:server` (terminal 1), `npm run dev:frontend` (terminal 2), then open the printed Vite URL. Expected: an empty board (five empty status columns) with no console errors — confirms wiring end-to-end before real hook data is ever sent.

- [ ] **Step 13: Commit**

```bash
git add src/frontend/board src/frontend/main.tsx index.html vite.config.ts src/server.ts
git commit -m "feat: add board UI, dev entry points, and server wiring"
```

---

## Acceptance Criteria (Phase 1, from the spec)

- Starting a real Claude Code session with the Task 4 hooks installed produces a card that moves `running → done` live in the browser with no refresh (per the confirmed subagent-synthesis rule, `queued` is never actually observed — hook streams start at `SessionStart`, which maps directly to `running`).
- A spawned subagent appears as its own card, grouped under its parent, with an owner badge — but pops in already `done`/`failed` rather than animating through `running` (documented UX gap, Global Constraints).
- A `PermissionRequest` event (a real on-screen approval prompt) moves the session's card into the `waiting` column live.

## Manual Test

1. Build and start the backend: `npm run build && node dist/server.js` (or `npm run dev:server` for iteration), and the frontend: `npm run dev:frontend`.
2. Install the Task 4 hook scripts into `~/.claude/settings.json` under `SessionStart`, `PostToolUse`, `Stop`, `PermissionRequest`, and `Notification`, pointing at the absolute paths under this repo's `hooks/` directory (same pattern as Phase 0's spike hooks — see `spike/claude-settings-snippet.json` for the JSON shape to adapt).
3. Start a fresh Claude Code session in a scratch directory and ask it to spawn an Explore subagent (e.g., "use the Explore agent to find X") and then finish.
4. Confirm in the browser: a card appears in `running` when the session starts, a subagent card appears grouped under it once the `Task`/`Agent` tool call completes, and the parent card moves to `done` with its `recap` reflected in `GET /api/sessions/:id` (drawer UI is Phase 2 — verify via the endpoint directly for now) once `Stop` fires.
5. In a second run, trigger a real permission prompt (e.g., ask it to run a mutating `Bash` command in `default` permission mode) and confirm the card moves to `waiting` before you approve it, then back to `running` after.

# Session Current-Activity Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a short, live "what is this session doing right now" line on every running session and subagent card, sourced from hook events claudekanban already ingests — no new hook, no new table.

**Architecture:** Extract the Drawer's existing per-event summarization logic (`eventSummary.ts`'s `summarize()`/`iconKind()`) into a shared, directly-testable domain module. Add one new `TEXT` column to the `session` table, populated on every incoming hook event for both top-level sessions (in `ingest.ts`) and subagents (in `subagentSynthesis.ts`), using that shared summarizer. Render it as a small line on the card, visible only while `status === "running"`.

**Tech Stack:** TypeScript, Express, better-sqlite3, React, Vite, Vitest — matches the existing stack, no new dependencies.

**Spec:** `.scratch/session-current-activity/spec.md`

## Global Constraints

- Only test external behavior (input → output), not implementation details — this project's established testing style (`subagentSynthesis.test.ts`, `groupSessions.test.ts`).
- No new hook, no new database table — the spec's data source is the existing `PostToolUse`/`PermissionRequest`/`Notification`/`Stop`/`SessionStart` event stream already flowing through `ingest.ts`.
- The card-level activity line renders only when `session.status === "running" && session.lastActivitySummary` — purely additive, no layout change to cards without it.
- Follow this project's migration-guard pattern for schema changes (`src/store/db.ts`'s `migrateSessionColumns`) — `CREATE TABLE IF NOT EXISTS` doesn't retrofit columns onto an existing on-disk database.
- Every file that constructs a full `Session`/`SessionDto` object literal via SQL binding (`upsertSession`) must include the new field, or better-sqlite3 throws a missing-named-parameter error at runtime — verified in this repo: `src/store/sessionStore.test.ts`, `src/store/applyChange.test.ts`, `src/sweep/staleSweeper.test.ts`.

---

### Task 1: Extract event summarization into a shared domain module

**Files:**
- Create: `src/domain/activitySummary.ts`
- Create: `src/domain/activitySummary.test.ts`
- Modify: `src/frontend/detail/eventSummary.ts`

**Interfaces:**
- Produces: `summarizeEvent(type: string, payload: ActivityPayload): string`, `classifyIconKind(type: string, payload: ActivityPayload): TimelineIconKind`, `type ActivityPayload = { tool_name?: string; tool_input?: { subagent_type?: string; description?: string; [key: string]: unknown }; notification_type?: string }`, `type TimelineIconKind = "start" | "stop" | "tool" | "spawn" | "permission" | "notification" | "other"`. Later tasks (2) import `summarizeEvent` from `../domain/activitySummary.js`.
- Consumes: nothing — pure functions, no I/O.

- [ ] **Step 1: Write the failing test file**

```typescript
// src/domain/activitySummary.test.ts
import { describe, expect, it } from "vitest";
import { summarizeEvent, classifyIconKind } from "./activitySummary.js";

describe("summarizeEvent", () => {
  it("summarizes SessionStart", () => {
    expect(summarizeEvent("SessionStart", {})).toBe("Session started");
  });

  it("summarizes a plain PostToolUse call by tool name", () => {
    expect(summarizeEvent("PostToolUse", { tool_name: "Bash" })).toBe("Called Bash");
  });

  it("summarizes a subagent-spawning PostToolUse call", () => {
    expect(
      summarizeEvent("PostToolUse", { tool_name: "Agent", tool_input: { subagent_type: "Explore" } })
    ).toBe("Spawned Explore subagent");
  });

  it("summarizes PermissionRequest with the tool_input description when present", () => {
    expect(
      summarizeEvent("PermissionRequest", {
        tool_name: "Bash",
        tool_input: { command: "rm nimrod.txt", description: "Remove nimrod.txt" },
      })
    ).toBe("Requested permission: Remove nimrod.txt");
  });

  it("summarizes PermissionRequest without a description by tool name", () => {
    expect(summarizeEvent("PermissionRequest", { tool_name: "Bash" })).toBe("Requested permission to use Bash");
  });

  it("summarizes an idle_prompt Notification", () => {
    expect(summarizeEvent("Notification", { notification_type: "idle_prompt" })).toBe("Waiting for input");
  });

  it("summarizes a non-idle_prompt Notification by its type", () => {
    expect(summarizeEvent("Notification", { notification_type: "something_else" })).toBe(
      "Notification: something_else"
    );
  });

  it("summarizes Stop", () => {
    expect(summarizeEvent("Stop", {})).toBe("Session finished");
  });

  it("falls back to the raw type for an unrecognized event type", () => {
    expect(summarizeEvent("SubagentStart", {})).toBe("SubagentStart");
  });
});

describe("classifyIconKind", () => {
  it("classifies SessionStart as start, Stop as stop", () => {
    expect(classifyIconKind("SessionStart", {})).toBe("start");
    expect(classifyIconKind("Stop", {})).toBe("stop");
  });

  it("classifies a subagent-spawning PostToolUse call as spawn, a plain one as tool", () => {
    expect(classifyIconKind("PostToolUse", { tool_name: "Agent" })).toBe("spawn");
    expect(classifyIconKind("PostToolUse", { tool_name: "Bash" })).toBe("tool");
  });

  it("classifies PermissionRequest as permission, Notification as notification, unknown as other", () => {
    expect(classifyIconKind("PermissionRequest", {})).toBe("permission");
    expect(classifyIconKind("Notification", {})).toBe("notification");
    expect(classifyIconKind("SomethingNew", {})).toBe("other");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/domain/activitySummary.test.ts`
Expected: FAIL — `Cannot find module './activitySummary.js'` (the module doesn't exist yet).

- [ ] **Step 3: Write `src/domain/activitySummary.ts`**

```typescript
export type TimelineIconKind = "start" | "stop" | "tool" | "spawn" | "permission" | "notification" | "other";

export interface ActivityPayload {
  tool_name?: string;
  tool_input?: { subagent_type?: string; description?: string; [key: string]: unknown };
  notification_type?: string;
}

export function summarizeEvent(type: string, payload: ActivityPayload): string {
  switch (type) {
    case "SessionStart":
      return "Session started";
    case "PostToolUse": {
      const toolName = payload.tool_name ?? "a tool";
      if (toolName === "Agent" || toolName === "Task") {
        const subagentType = payload.tool_input?.subagent_type ?? "subagent";
        return `Spawned ${subagentType} subagent`;
      }
      return `Called ${toolName}`;
    }
    case "PermissionRequest": {
      const description = payload.tool_input?.description;
      const toolName = payload.tool_name ?? "a tool";
      return description ? `Requested permission: ${description}` : `Requested permission to use ${toolName}`;
    }
    case "Notification": {
      const notificationType = payload.notification_type;
      if (notificationType === "idle_prompt") return "Waiting for input";
      return notificationType ? `Notification: ${notificationType}` : "Notification";
    }
    case "Stop":
      return "Session finished";
    default:
      return type;
  }
}

export function classifyIconKind(type: string, payload: ActivityPayload): TimelineIconKind {
  switch (type) {
    case "SessionStart":
      return "start";
    case "Stop":
      return "stop";
    case "PostToolUse":
      return payload.tool_name === "Agent" || payload.tool_name === "Task" ? "spawn" : "tool";
    case "PermissionRequest":
      return "permission";
    case "Notification":
      return "notification";
    default:
      return "other";
  }
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/domain/activitySummary.test.ts`
Expected: PASS, all 15 tests green.

- [ ] **Step 5: Refactor `eventSummary.ts` to delegate to the new module**

Replace the full contents of `src/frontend/detail/eventSummary.ts` with:

```typescript
import type { EventDto } from "../lib/transport/Transport.js";
import { summarizeEvent, classifyIconKind, type TimelineIconKind, type ActivityPayload } from "../../domain/activitySummary.js";

export type { TimelineIconKind };

export interface TimelineEntry {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown[];
  count: number;
  iconKind: TimelineIconKind;
}

function groupingKey(type: string, payload: ActivityPayload): string {
  switch (type) {
    case "PostToolUse":
      return `${type}:${payload.tool_name ?? ""}`;
    case "Notification":
      return `${type}:${payload.notification_type ?? ""}`;
    default:
      return type;
  }
}

interface MappedEvent {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown;
  key: string;
  iconKind: TimelineIconKind;
}

interface Group {
  entries: MappedEvent[];
  key: string;
}

export function buildTimeline(events: EventDto[]): TimelineEntry[] {
  const mapped: MappedEvent[] = events
    .map((event) => {
      let raw: unknown = {};
      try {
        raw = JSON.parse(event.payload);
      } catch {
        raw = event.payload;
      }
      const payload = (raw ?? {}) as ActivityPayload;
      return {
        id: event.id,
        ts: event.ts,
        type: event.type,
        summary: summarizeEvent(event.type, payload),
        raw,
        key: groupingKey(event.type, payload),
        iconKind: classifyIconKind(event.type, payload),
      };
    })
    .sort((a, b) => a.id - b.id);

  const groups: Group[] = [];
  for (const entry of mapped) {
    const last = groups[groups.length - 1];
    if (last && last.key === entry.key) {
      last.entries.push(entry);
    } else {
      groups.push({ key: entry.key, entries: [entry] });
    }
  }

  return groups
    .map(({ entries }): TimelineEntry => {
      const latest = entries[entries.length - 1];
      return {
        id: latest.id,
        ts: latest.ts,
        type: latest.type,
        summary: latest.summary,
        raw: entries.map((e) => e.raw),
        count: entries.length,
        iconKind: latest.iconKind,
      };
    })
    .sort((a, b) => b.id - a.id);
}
```

- [ ] **Step 6: Run the existing Drawer timeline tests to confirm no regression**

Run: `npx vitest run src/frontend/detail/eventSummary.test.ts`
Expected: PASS, all existing tests green — `buildTimeline`'s behavior is unchanged, only its summarization logic moved.

- [ ] **Step 7: Commit**

```bash
git add src/domain/activitySummary.ts src/domain/activitySummary.test.ts src/frontend/detail/eventSummary.ts
git commit -m "refactor: extract event summarization into a shared domain module"
```

---

### Task 2: Add `lastActivitySummary` through the domain shape, schema, store, and ingest

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/store/schema.sql`
- Modify: `src/store/db.ts`
- Modify: `src/store/db.test.ts`
- Modify: `src/store/sessionStore.ts`
- Modify: `src/store/sessionStore.test.ts`
- Modify: `src/store/applyChange.test.ts`
- Modify: `src/sweep/staleSweeper.test.ts`
- Modify: `src/ingest/ingest.ts`
- Modify: `src/ingest/ingest.test.ts`
- Modify: `src/domain/subagentSynthesis.ts`
- Modify: `src/domain/subagentSynthesis.test.ts`

**Interfaces:**
- Consumes: `summarizeEvent` from `src/domain/activitySummary.ts` (Task 1).
- Produces: `SessionShape.lastActivitySummary: string | null`, populated for both top-level sessions (`ingest.ts`) and subagent rows (`subagentSynthesis.ts`). Later task (3) reads `session.lastActivitySummary` on the frontend `SessionDto`.

This is one atomic task, not split further: a reviewer can't sensibly approve "add the column" while rejecting "wire it into subagent synthesis," since the former alone leaves `subagentSynthesis.ts` failing to compile (it builds `Session` object literals that would be missing a newly-required field). Multiple TDD sub-cycles below, one commit at the end.

#### Sub-cycle A: schema + migration guard

- [ ] **Step 1: Extend the failing migration test**

In `src/store/db.test.ts`, change the first test to also assert the new column:

```typescript
  it("retrofits last_activity_at, fail_reason, and last_activity_summary onto a session table missing all three", () => {
    const db = oldShapeDb();
    migrateSessionColumns(db);
    const columns = (db.prepare("PRAGMA table_info(session)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain("last_activity_at");
    expect(columns).toContain("fail_reason");
    expect(columns).toContain("last_activity_summary");
  });
```

(Only the `it(...)` title and its body change — the second test, `oldShapeDb()`, and the imports stay as they are.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/store/db.test.ts`
Expected: FAIL — `expect(columns).toContain("last_activity_summary")` fails, column doesn't exist yet.

- [ ] **Step 3: Add the migration guard in `src/store/db.ts`**

In `migrateSessionColumns`, after the existing `fail_reason` guard, add:

```typescript
  if (!columns.some((c) => c.name === "last_activity_summary")) {
    db.exec("ALTER TABLE session ADD COLUMN last_activity_summary TEXT");
  }
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/store/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the column to the fresh-create schema**

In `src/store/schema.sql`, in the `session` table's `CREATE TABLE IF NOT EXISTS`, add a new column after `fail_reason TEXT`:

```sql
  fail_reason TEXT,
  last_activity_summary TEXT
```

#### Sub-cycle B: domain shape + store

- [ ] **Step 6: Add the field to `SessionShape`**

In `src/domain/types.ts`, add to the interface:

```typescript
export interface SessionShape {
  id: string;
  parentSessionId: string | null;
  owner: string;
  title: string | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  cwd: string;
  model: string | null;
  recap: string | null;
  failReason: string | null;
  lastActivitySummary: string | null;
}
```

- [ ] **Step 7: Update `src/store/sessionStore.ts`**

Add `last_activity_summary: string | null;` to the `SessionRow` interface. In `rowToSession`, add `lastActivitySummary: row.last_activity_summary,`. In `upsertSession`, add the column to both the `INSERT` column list/`VALUES` and the `ON CONFLICT ... DO UPDATE SET` clause:

```typescript
export function upsertSession(db: Database.Database, session: Session): void {
  db.prepare(
    `INSERT INTO session (id, parent_session_id, owner, title, status, started_at, ended_at, cwd, model, recap, fail_reason, last_activity_summary)
     VALUES (@id, @parentSessionId, @owner, @title, @status, @startedAt, @endedAt, @cwd, @model, @recap, @failReason, @lastActivitySummary)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       title = excluded.title,
       ended_at = excluded.ended_at,
       recap = excluded.recap,
       fail_reason = excluded.fail_reason,
       last_activity_summary = excluded.last_activity_summary`
  ).run(session);
}
```

- [ ] **Step 8: Fix the three test fixtures that call `upsertSession` with a fully-explicit `Session` literal**

Without this step, `upsertSession` throws a better-sqlite3 "missing named parameter" error at runtime, since these object literals don't spread from a `Partial` and don't have the new key.

In `src/store/sessionStore.test.ts`, change `baseSession`'s closing lines:

```typescript
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
  lastActivitySummary: null,
};
```

In `src/store/applyChange.test.ts`, change the `session` const's closing lines:

```typescript
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
  lastActivitySummary: null,
};
```

In `src/sweep/staleSweeper.test.ts`, change `baseSession`'s closing lines:

```typescript
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
```

- [ ] **Step 9: Run the store test suite to confirm it passes**

Run: `npx vitest run src/store/sessionStore.test.ts src/store/applyChange.test.ts src/sweep/staleSweeper.test.ts src/store/db.test.ts`
Expected: PASS, all green.

#### Sub-cycle C: top-level session wiring in `ingest.ts`

- [ ] **Step 10: Write the failing test**

In `src/ingest/ingest.test.ts`, add a new test after `"sets recap and endedAt on Stop"`:

```typescript
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
```

- [ ] **Step 11: Run it to confirm it fails**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: FAIL — `lastActivitySummary` is `undefined`/not set, since `ingest.ts` doesn't populate it yet.

- [ ] **Step 12: Wire it in `src/ingest/ingest.ts`**

Add the import at the top:

```typescript
import { summarizeEvent } from "../domain/activitySummary.js";
```

In the `updatedSession` object literal, add one field after `failReason`:

```typescript
    const updatedSession: Session = {
      id: payload.session_id,
      parentSessionId: existing?.parentSessionId ?? null,
      owner: existing?.owner ?? "main",
      title: existing?.title ?? null,
      status,
      startedAt: existing?.startedAt ?? receivedAt,
      endedAt: status === "done" || status === "failed" ? receivedAt : null,
      cwd: payload.cwd ?? existing?.cwd ?? "",
      model: payload.model ?? existing?.model ?? null,
      recap: payload.hook_event_name === "Stop" ? payload.last_assistant_message ?? null : existing?.recap ?? null,
      failReason: existing?.failReason ?? null,
      lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
    };
```

- [ ] **Step 13: Run it to confirm it passes**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: PASS. (This will also fail to *compile* until sub-cycle D below is done, since `subagentSynthesis.ts` builds `Session` literals too — run this together with sub-cycle D's steps before treating either as green in isolation.)

#### Sub-cycle D: subagent wiring in `subagentSynthesis.ts`

- [ ] **Step 14: Replace `src/domain/subagentSynthesis.ts` in full**

```typescript
import type { Session } from "../store/sessionStore.js";
import { summarizeEvent } from "./activitySummary.js";

export interface PostToolUsePayload {
  hook_event_name: "PostToolUse";
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: { subagent_type?: string; description?: string; [key: string]: unknown };
  tool_response?: { agentId?: string; error?: unknown; [key: string]: unknown };
}

function errorToReason(error: unknown): string {
  return typeof error === "string" ? error : JSON.stringify(error);
}

export function synthesizeSubagentSession(payload: PostToolUsePayload, receivedAt: string): Session | null {
  if (payload.tool_name !== "Agent" && payload.tool_name !== "Task") return null;
  const agentId = payload.tool_response?.agentId;
  if (!agentId) return null;

  const error = payload.tool_response?.error;
  const failed = Boolean(error);
  return {
    id: agentId,
    parentSessionId: payload.session_id,
    owner: payload.tool_input.subagent_type ?? "unknown",
    title: payload.tool_input.description || null,
    status: failed ? "failed" : "done",
    startedAt: receivedAt,
    endedAt: receivedAt,
    cwd: payload.cwd,
    model: null,
    recap: null,
    failReason: failed ? errorToReason(error) : null,
    lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
  };
}

export interface SubagentStartPayload {
  hook_event_name: "SubagentStart";
  session_id: string;
  cwd: string;
  agent_id?: string;
  agent_type?: string;
}

export function synthesizeSubagentStart(existing: Session | undefined, payload: SubagentStartPayload, receivedAt: string): Session | null {
  if (!payload.agent_id || !payload.agent_type) return null;
  if (existing) return existing;
  return {
    id: payload.agent_id,
    parentSessionId: payload.session_id,
    owner: payload.agent_type,
    title: null,
    status: "running",
    startedAt: receivedAt,
    endedAt: null,
    cwd: payload.cwd,
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
  };
}

export interface SubagentStopPayload {
  hook_event_name: "SubagentStop";
  session_id: string;
  agent_id?: string;
  agent_type?: string;
}

export function synthesizeSubagentStop(existing: Session, payload: SubagentStopPayload, receivedAt: string): Session | null {
  if (!payload.agent_id || !payload.agent_type) return null;
  if (existing.status === "failed") return existing;
  return {
    ...existing,
    status: "done",
    endedAt: receivedAt,
    lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
  };
}

export function mergeSubagentTitle(existing: Session, payload: PostToolUsePayload, receivedAt: string): Session {
  const error = payload.tool_response?.error;
  const failed = Boolean(error);
  return {
    ...existing,
    title: existing.title ?? (payload.tool_input.description || null),
    status: failed ? "failed" : existing.status,
    endedAt: failed && existing.status !== "failed" ? receivedAt : existing.endedAt,
    failReason: failed ? errorToReason(error) : existing.failReason,
    lastActivitySummary: summarizeEvent(payload.hook_event_name, payload),
  };
}
```

- [ ] **Step 15: Replace `src/domain/subagentSynthesis.test.ts` in full**

Every fixture/expectation below adds `lastActivitySummary` to match what the function under test now actually returns — computed by hand from `summarizeEvent`'s rules (Task 1): a `PostToolUse` with `tool_name: "Agent"` and a `tool_input.subagent_type` summarizes to `"Spawned <type> subagent"`; a `SubagentStart`/`SubagentStop` event (no case in the switch) falls through to the `default` branch, which returns the raw type string.

```typescript
import { describe, expect, it } from "vitest";
import {
  synthesizeSubagentSession,
  type PostToolUsePayload,
  synthesizeSubagentStart,
  type SubagentStartPayload,
  synthesizeSubagentStop,
  type SubagentStopPayload,
  mergeSubagentTitle,
} from "./subagentSynthesis.js";
import type { Session } from "../store/sessionStore.js";

function payload(overrides: Partial<PostToolUsePayload>): PostToolUsePayload {
  return {
    hook_event_name: "PostToolUse",
    session_id: "parent-1",
    cwd: "/tmp/project",
    tool_name: "Agent",
    tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
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
      title: "Find TODO occurrences",
      status: "done",
      startedAt: "2026-08-08T10:00:05.000Z",
      endedAt: "2026-08-08T10:00:05.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    });
  });

  it("synthesizes a failed child session when tool_response carries an error", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-456", error: "timed out" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.status).toBe("failed");
    expect(child?.failReason).toBe("timed out");
  });

  it("stringifies a non-string tool_response.error into failReason", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_response: { agentId: "agent-789", error: { code: 137, message: "killed" } } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.failReason).toBe(JSON.stringify({ code: 137, message: "killed" }));
  });

  it("defaults owner to \"unknown\" when subagent_type is missing", () => {
    const child = synthesizeSubagentSession(payload({ tool_input: {} }), "2026-08-08T10:00:05.000Z");
    expect(child?.owner).toBe("unknown");
  });

  it("recognizes tool_name \"Task\" as well as \"Agent\"", () => {
    expect(synthesizeSubagentSession(payload({ tool_name: "Task" }), "2026-08-08T10:00:05.000Z")).not.toBeNull();
  });

  it("sets title to null when description is missing", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_input: { subagent_type: "Explore" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.title).toBeNull();
  });

  it("sets title to null when description is an empty string", () => {
    const child = synthesizeSubagentSession(
      payload({ tool_input: { subagent_type: "Explore", description: "" } }),
      "2026-08-08T10:00:05.000Z"
    );
    expect(child?.title).toBeNull();
  });

  it("sets lastActivitySummary from the spawning PostToolUse call", () => {
    const child = synthesizeSubagentSession(payload({}), "2026-08-08T10:00:05.000Z");
    expect(child?.lastActivitySummary).toBe("Spawned Explore subagent");
  });
});

describe("synthesizeSubagentStart", () => {
  function startPayload(overrides: Partial<SubagentStartPayload> = {}): SubagentStartPayload {
    return {
      hook_event_name: "SubagentStart",
      session_id: "parent-1",
      cwd: "/tmp/project",
      agent_id: "agent-123",
      agent_type: "Explore",
      ...overrides,
    };
  }

  it("creates a running child session with no title yet, when no existing row", () => {
    const child = synthesizeSubagentStart(undefined, startPayload(), "2026-08-09T10:00:00.000Z");
    expect(child).toEqual({
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: null,
      status: "running",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "SubagentStart",
    });
  });

  it("returns null when agent_id is missing", () => {
    expect(synthesizeSubagentStart(undefined, startPayload({ agent_id: undefined }), "2026-08-09T10:00:00.000Z")).toBeNull();
  });

  it("returns null when agent_type is empty (background-job false positive filter)", () => {
    expect(synthesizeSubagentStart(undefined, startPayload({ agent_type: "" }), "2026-08-09T10:00:00.000Z")).toBeNull();
  });

  it("does not clobber an existing done row (late or duplicate SubagentStart delivery)", () => {
    const doneChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: "Find TODO occurrences",
      status: "done",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: "2026-08-09T10:00:17.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    };
    const result = synthesizeSubagentStart(doneChild, startPayload(), "2026-08-09T10:00:20.000Z");
    expect(result).toEqual(doneChild);
  });

  it("does not clobber an existing failed row (late or duplicate SubagentStart delivery)", () => {
    const failedChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: null,
      status: "failed",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: "2026-08-09T10:00:17.000Z",
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "Spawned Explore subagent",
    };
    const result = synthesizeSubagentStart(failedChild, startPayload(), "2026-08-09T10:00:20.000Z");
    expect(result).toEqual(failedChild);
  });

  it("does not clobber an existing running row (duplicate SubagentStart delivery)", () => {
    const runningChild: Session = {
      id: "agent-123",
      parentSessionId: "parent-1",
      owner: "Explore",
      title: "Find TODO occurrences",
      status: "running",
      startedAt: "2026-08-09T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: null,
      recap: null,
      failReason: null,
      lastActivitySummary: "SubagentStart",
    };
    const result = synthesizeSubagentStart(runningChild, startPayload(), "2026-08-09T10:00:05.000Z");
    expect(result).toEqual(runningChild);
  });
});

describe("synthesizeSubagentStop", () => {
  const runningChild: Session = {
    id: "agent-123",
    parentSessionId: "parent-1",
    owner: "Explore",
    title: null,
    status: "running",
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: null,
    cwd: "/tmp/project",
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: "SubagentStart",
  };

  function stopPayload(overrides: Partial<SubagentStopPayload> = {}): SubagentStopPayload {
    return {
      hook_event_name: "SubagentStop",
      session_id: "parent-1",
      agent_id: "agent-123",
      agent_type: "Explore",
      ...overrides,
    };
  }

  it("transitions a running child to done", () => {
    const updated = synthesizeSubagentStop(runningChild, stopPayload(), "2026-08-09T10:00:17.000Z");
    expect(updated).toEqual({
      ...runningChild,
      status: "done",
      endedAt: "2026-08-09T10:00:17.000Z",
      lastActivitySummary: "SubagentStop",
    });
  });

  it("never regresses an already-failed child back to done", () => {
    const failedChild: Session = { ...runningChild, status: "failed", endedAt: "2026-08-09T10:00:10.000Z" };
    const updated = synthesizeSubagentStop(failedChild, stopPayload(), "2026-08-09T10:00:17.000Z");
    expect(updated).toEqual(failedChild);
  });

  it("returns null when agent_id is missing", () => {
    expect(synthesizeSubagentStop(runningChild, stopPayload({ agent_id: undefined }), "2026-08-09T10:00:17.000Z")).toBeNull();
  });

  it("returns null when agent_type is empty (background-job false positive filter)", () => {
    expect(synthesizeSubagentStop(runningChild, stopPayload({ agent_type: "" }), "2026-08-09T10:00:17.000Z")).toBeNull();
  });
});

describe("mergeSubagentTitle", () => {
  const doneChild: Session = {
    id: "agent-123",
    parentSessionId: "parent-1",
    owner: "Explore",
    title: null,
    status: "done",
    startedAt: "2026-08-09T10:00:00.000Z",
    endedAt: "2026-08-09T10:00:17.000Z",
    cwd: "/tmp/project",
    model: null,
    recap: null,
    failReason: null,
    lastActivitySummary: "SubagentStop",
  };

  function toolUsePayload(overrides: Partial<PostToolUsePayload> = {}): PostToolUsePayload {
    return {
      hook_event_name: "PostToolUse",
      session_id: "parent-1",
      cwd: "/tmp/project",
      tool_name: "Agent",
      tool_input: { subagent_type: "Explore", description: "Find TODO occurrences" },
      tool_response: { agentId: "agent-123" },
      ...overrides,
    };
  }

  it("sets the title when the existing row has none yet", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.title).toBe("Find TODO occurrences");
  });

  it("keeps the existing title rather than overwriting it", () => {
    const alreadyTitled = { ...doneChild, title: "Original title" };
    const merged = mergeSubagentTitle(alreadyTitled, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.title).toBe("Original title");
  });

  it("leaves status alone when there is no tool_response error", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.status).toBe("done");
    expect(merged.endedAt).toBe(doneChild.endedAt);
  });

  it("escalates status to failed and updates endedAt when tool_response has an error", () => {
    const merged = mergeSubagentTitle(
      doneChild,
      toolUsePayload({ tool_response: { agentId: "agent-123", error: "boom" } }),
      "2026-08-09T10:00:18.000Z"
    );
    expect(merged.status).toBe("failed");
    expect(merged.endedAt).toBe("2026-08-09T10:00:18.000Z");
    expect(merged.failReason).toBe("boom");
  });

  it("does not change endedAt when already failed and an error is present again", () => {
    const alreadyFailed = { ...doneChild, status: "failed" as const, endedAt: "2026-08-09T10:00:17.000Z" };
    const merged = mergeSubagentTitle(
      alreadyFailed,
      toolUsePayload({ tool_response: { agentId: "agent-123", error: "boom" } }),
      "2026-08-09T10:00:18.000Z"
    );
    expect(merged.endedAt).toBe("2026-08-09T10:00:17.000Z");
  });

  it("sets lastActivitySummary from the merging PostToolUse call", () => {
    const merged = mergeSubagentTitle(doneChild, toolUsePayload(), "2026-08-09T10:00:18.000Z");
    expect(merged.lastActivitySummary).toBe("Spawned Explore subagent");
  });
});
```

- [ ] **Step 16: Run the full affected test suite and the typecheck**

Run: `npx vitest run src/domain/subagentSynthesis.test.ts src/ingest/ingest.test.ts src/store/sessionStore.test.ts src/store/applyChange.test.ts src/sweep/staleSweeper.test.ts src/store/db.test.ts`
Expected: PASS, all green.

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 17: Commit**

```bash
git add src/domain/types.ts src/store/schema.sql src/store/db.ts src/store/db.test.ts \
  src/store/sessionStore.ts src/store/sessionStore.test.ts src/store/applyChange.test.ts \
  src/sweep/staleSweeper.test.ts src/ingest/ingest.ts src/ingest/ingest.test.ts \
  src/domain/subagentSynthesis.ts src/domain/subagentSynthesis.test.ts
git commit -m "feat: track a live current-activity summary on every session and subagent row"
```

---

### Task 3: Render the current-activity line on session and subagent cards

**Files:**
- Modify: `src/frontend/board/SessionCard.tsx`
- Modify: `src/frontend/board/board.css`

**Interfaces:**
- Consumes: `session.lastActivitySummary: string | null` and `session.status` from `SessionDto` (already flows through automatically — `SessionDto = SessionShape`, Task 2 — no `Transport.ts`/API route change needed).
- Produces: no new exports — this is a leaf UI change.

No dedicated automated test is added for this step: this project has no component-level (React Testing Library) tests for the equivalent `card-fail-reason` conditional-render feature it mirrors, and this task follows that same precedent. Verification is the manual browser check in Step 3.

- [ ] **Step 1: Add the conditional line to `SessionCard.tsx`**

In `src/frontend/board/SessionCard.tsx`, add a new conditional block right after the existing `card-status` div (for the top-level card), and a matching one inside the `child-meta`/child-card block (for subagents):

```tsx
      <div className="card-status">{session.status}</div>
      {session.status === "running" && session.lastActivitySummary && (
        <div className="card-activity" title={session.lastActivitySummary}>{session.lastActivitySummary}</div>
      )}
      {session.status === "failed" && session.failReason && (
        <div className="card-fail-reason" title={session.failReason}>{session.failReason}</div>
      )}
```

And, inside the `children.map(...)` block, right after the existing `child-meta` div:

```tsx
              <div className="child-meta">
                <span className="card-owner">{child.owner}</span>
                <span className="card-status">{child.status}</span>
              </div>
              {child.status === "running" && child.lastActivitySummary && (
                <div className="card-activity" title={child.lastActivitySummary}>{child.lastActivitySummary}</div>
              )}
              {child.status === "failed" && child.failReason && (
                <div className="card-fail-reason" title={child.failReason}>{child.failReason}</div>
              )}
```

- [ ] **Step 2: Add matching styles to `board.css`**

After the existing `.card-fail-reason` rule, add:

```css
.card-activity {
  font-family: var(--ck-font-mono);
  font-size: 0.7rem;
  color: var(--ck-text-muted);
  order: 3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

And after the existing `.child-card .card-fail-reason` rule:

```css
.child-card .card-activity {
  font-size: 0.68rem;
}
```

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev:server` (one terminal) and `npm run dev:frontend` (another).

POST a couple of synthetic hook events at the running server to simulate a live session, e.g.:

```bash
curl -s -X POST http://localhost:4317/ingest -H "Content-Type: application/json" \
  -d '{"hook_event_name":"SessionStart","session_id":"demo-1","cwd":"/tmp/demo","model":"claude-sonnet-5"}'
curl -s -X POST http://localhost:4317/ingest -H "Content-Type: application/json" \
  -d '{"hook_event_name":"PostToolUse","session_id":"demo-1","cwd":"/tmp/demo","tool_name":"Bash"}'
```

Open the board in a browser. Expected: the `demo-1` card, in the `running` column, shows a small muted line reading "Called Bash" beneath its status. POST a `Stop` event for the same `session_id` and confirm the line disappears once the card moves to `done`.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/board/SessionCard.tsx src/frontend/board/board.css
git commit -m "feat: show a live current-activity line on running session and subagent cards"
```

---

## Self-Review Notes

- **Spec coverage:** every user story in `.scratch/session-current-activity/spec.md` maps to a task — extraction (Task 1, stories 3/7/8), storage/ingest wiring for both sessions and subagents (Task 2, stories 2/4/5/6/9), card rendering gated on `running` status (Task 3, stories 1/6). No `Drawer.tsx`/`Transport.ts`/API route changes were needed, matching the spec's explicit "no change required" note for those.
- **Type consistency:** `lastActivitySummary` is spelled identically across `SessionShape` (Task 2), `sessionStore.ts`'s SQL/row mapping (Task 2), `ingest.ts` (Task 2), `subagentSynthesis.ts` (Task 2), and `SessionCard.tsx` (Task 3) — verified against each file's actual current content before writing this plan, not assumed.
- **No placeholders:** every step has real, complete code — the two largest files (`subagentSynthesis.ts`, `subagentSynthesis.test.ts`) are given in full rather than as diffs, since nearly every existing test fixture needed the new field added for the `toEqual` assertions to keep matching actual output.

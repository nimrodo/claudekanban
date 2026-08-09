# Subagent Live Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 1's synthesize-on-completion subagent handling with a real `queued → running → done/failed` lifecycle for subagent cards, driven by the confirmed-live `SubagentStart`/`SubagentStop` hook events, so a subagent card behaves like a Jira sub-task instead of popping in already finished.

**Architecture:** `SubagentStart` creates the child `Session` row immediately (`status: "running"`). `SubagentStop` transitions that same row to `done`/`failed`. The parent's `PostToolUse` for the `Task`/`Agent` call — which still carries the only available title (`tool_input.description`) — merges the title into the existing row instead of creating it, and can escalate the row to `failed` if `tool_response.error` is set (the one piece of failure information `SubagentStop` itself doesn't carry). If no `SubagentStart` ever created the row (defensive fallback, e.g. hook misconfiguration), `PostToolUse` still fully synthesizes the row from scratch exactly as Phase 1 did — this plan is additive, not a replacement that can regress to Phase 1's behavior if the new hooks are missing.

**Tech Stack:** Same as the existing project (TypeScript, Express, better-sqlite3, Vitest, React) — no new dependencies.

## Global Constraints

- Confirmed live payload fields (`spike/findings.md`, "Subagent running-state signal"):
  - `SubagentStart`: `session_id` (the **parent's** id), `cwd` (parent's cwd), `agent_id`, `agent_type`, `hook_event_name`.
  - `SubagentStop`: same fields as `SubagentStart` (`session_id`, `agent_id`, `agent_type`), plus others not needed here (`last_assistant_message`, `background_tasks`, etc.).
  - Neither event carries a title/description or an explicit success/failure field.
- **Filter rule (confirmed live):** `SubagentStop` also fires with `agent_type: ""` (empty string) for a session's own turn-end when that session itself runs as a background job — this is not a real subagent and must be ignored. Applied defensively to `SubagentStart` too (only confirmed for `SubagentStop` in the live capture, but the same empty-`agent_type` check is applied to both for one consistent rule rather than two asymmetric ones).
- **Correlation key:** `agent_id` is confirmed identical across `SubagentStart`, `SubagentStop`, and the parent's `PostToolUse.tool_response.agentId` for the same subagent call — use it as the child `Session.id` throughout, exactly as Phase 1 already does for the `PostToolUse`-only path.
- **Ordering assumption:** `SubagentStart` → (subagent's own work, invisible to hooks) → `SubagentStop` → parent's `PostToolUse` for the `Task`/`Agent` call. `SubagentStop` therefore cannot know success/failure yet — it sets `status: "done"` optimistically; the later `PostToolUse` merge is the only place that can escalate to `"failed"`, and it must never regress an already-`"failed"` row back to `"done"`. The live capture only confirms one ordering sample, not a guarantee — **every one of the three write paths (`SubagentStart`, `SubagentStop`, `PostToolUse` merge) must treat an already-`done`/`failed` existing row as terminal and never overwrite it back toward `running`** (grilled: `synthesizeSubagentStart` originally had no such guard and could have clobbered a finished subagent's status/title back to `running`/`null` on a late or duplicate delivery — fixed below by giving it the same `existing`-aware signature as the other two).
- **Reachable states for a subagent row are narrower than the full kanban set:** only `running`, `done`, `failed` are reachable (no `queued`, no `waiting`) — a subagent's own permission prompts/notifications fire under the *parent's* `session_id`, not a distinct child id, so `waiting` never applies to a child row. Do not add `queued`/`waiting` handling for subagent rows.
- All domain logic stays pure (no I/O) in `src/domain/`; only `src/ingest/ingest.ts` performs reads/writes — same separation the codebase already uses throughout.
- Test runner: Vitest (established project-wide).

---

### Task 1: Fix `upsertSession` to actually persist `title` on conflict

**Files:**
- Modify: `src/store/sessionStore.ts`
- Test: `src/store/sessionStore.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: no interface change — `upsertSession`'s existing signature is unchanged, only its `ON CONFLICT` SQL behavior changes. Later tasks (2, 3) depend on `title` actually being updatable on a second `upsertSession` call for the same `id`, which today it silently is not.

This is a real, pre-existing bug found while planning this feature: `upsertSession`'s `ON CONFLICT ... DO UPDATE SET` clause updates `status`/`ended_at`/`recap` but not `title`. Every caller passes a `title` value on every call (including ones intending to preserve it, via `existing?.title ?? null`), but a caller that *intends* to change an existing row's title on a second write currently can't — the column is silently ignored after the first insert. This plan's whole design (`SubagentStart` creates a row with `title: null`, a later `PostToolUse` sets the real title) depends on this actually working.

- [ ] **Step 1: Write the failing test**

Add to `src/store/sessionStore.test.ts`, after the existing "updates status/ended_at/recap on conflict" test:

```ts
  it("updates title on conflict when a later upsert sets a new value", () => {
    const db = testDb();
    upsertSession(db, { ...baseSession, title: null });
    upsertSession(db, { ...baseSession, title: "Find TODO occurrences" });
    expect(getSession(db, "sess-1")?.title).toBe("Find TODO occurrences");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/sessionStore.test.ts`
Expected: FAIL — `title` stays `null` after the second upsert

- [ ] **Step 3: Fix the `ON CONFLICT` clause**

In `src/store/sessionStore.ts`, change the `upsertSession` function's SQL from:

```ts
export function upsertSession(db: Database.Database, session: Session): void {
  db.prepare(
    `INSERT INTO session (id, parent_session_id, owner, title, status, started_at, ended_at, cwd, model, recap)
     VALUES (@id, @parentSessionId, @owner, @title, @status, @startedAt, @endedAt, @cwd, @model, @recap)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       ended_at = excluded.ended_at,
       recap = excluded.recap`
  ).run(session);
}
```

to:

```ts
export function upsertSession(db: Database.Database, session: Session): void {
  db.prepare(
    `INSERT INTO session (id, parent_session_id, owner, title, status, started_at, ended_at, cwd, model, recap)
     VALUES (@id, @parentSessionId, @owner, @title, @status, @startedAt, @endedAt, @cwd, @model, @recap)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       title = excluded.title,
       ended_at = excluded.ended_at,
       recap = excluded.recap`
  ).run(session);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/store/sessionStore.test.ts`
Expected: PASS (6 tests: 5 existing + 1 new)

- [ ] **Step 5: Run the whole suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS (all 80 existing tests plus the 1 new one — every caller of `upsertSession` already passes a `title` intended to either preserve or intentionally change the value, so this fix should not change any existing test's outcome)

- [ ] **Step 6: Commit**

```bash
git add src/store/sessionStore.ts src/store/sessionStore.test.ts
git commit -m "fix: persist title on upsertSession conflict, not just at first insert"
```

---

### Task 2: Domain logic — `SubagentStart`/`SubagentStop` synthesis + title merge

**Files:**
- Modify: `src/domain/subagentSynthesis.ts`
- Modify: `src/domain/subagentSynthesis.test.ts`

**Interfaces:**
- Consumes: `Session` from `../store/sessionStore.js` (existing).
- Produces (new exports, consumed by Task 3's ingest wiring):
  - `SubagentStartPayload` type (`{ hook_event_name: "SubagentStart"; session_id: string; cwd: string; agent_id?: string; agent_type?: string }`)
  - `synthesizeSubagentStart(existing: Session | undefined, payload: SubagentStartPayload, receivedAt: string): Session | null`
  - `SubagentStopPayload` type (`{ hook_event_name: "SubagentStop"; session_id: string; agent_id?: string; agent_type?: string }`)
  - `synthesizeSubagentStop(existing: Session, payload: SubagentStopPayload, receivedAt: string): Session | null`
  - `mergeSubagentTitle(existing: Session, payload: PostToolUsePayload, receivedAt: string): Session`
  - The existing `PostToolUsePayload` type and `synthesizeSubagentSession` function are unchanged and remain exported — Task 3 keeps using `synthesizeSubagentSession` as the no-`SubagentStart`-arrived fallback.

- [ ] **Step 1: Write the failing tests**

Add to `src/domain/subagentSynthesis.test.ts`, after the existing `describe("synthesizeSubagentSession", ...)` block:

```ts
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
    };
    const result = synthesizeSubagentStart(failedChild, startPayload(), "2026-08-09T10:00:20.000Z");
    expect(result).toEqual(failedChild);
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
    expect(updated).toEqual({ ...runningChild, status: "done", endedAt: "2026-08-09T10:00:17.000Z" });
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
});
```

Add `SubagentStartPayload` and `SubagentStopPayload` to the existing `import type { PostToolUsePayload } from "./subagentSynthesis.js";`-style import line at the top of the test file (it currently imports `synthesizeSubagentSession, type PostToolUsePayload` — extend that same import statement to also bring in `synthesizeSubagentStart, type SubagentStartPayload, synthesizeSubagentStop, type SubagentStopPayload, mergeSubagentTitle`, and add `import type { Session } from "../store/sessionStore.js";` if not already present).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/subagentSynthesis.test.ts`
Expected: FAIL — `synthesizeSubagentStart`/`synthesizeSubagentStop`/`mergeSubagentTitle` are not exported yet

- [ ] **Step 3: Implement the three new functions**

Replace `src/domain/subagentSynthesis.ts`'s contents with:

```ts
import type { Session } from "../store/sessionStore.js";

export interface PostToolUsePayload {
  hook_event_name: "PostToolUse";
  session_id: string;
  cwd: string;
  tool_name: string;
  tool_input: { subagent_type?: string; description?: string; [key: string]: unknown };
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
    title: payload.tool_input.description || null,
    status: failed ? "failed" : "done",
    startedAt: receivedAt,
    endedAt: receivedAt,
    cwd: payload.cwd,
    model: null,
    recap: null,
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
  if (existing && (existing.status === "done" || existing.status === "failed")) return existing;
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
  };
}

export function mergeSubagentTitle(existing: Session, payload: PostToolUsePayload, receivedAt: string): Session {
  const failed = Boolean(payload.tool_response?.error);
  return {
    ...existing,
    title: existing.title ?? (payload.tool_input.description || null),
    status: failed ? "failed" : existing.status,
    endedAt: failed && existing.status !== "failed" ? receivedAt : existing.endedAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/subagentSynthesis.test.ts`
Expected: PASS (all existing tests plus 14 new ones: 5 for `synthesizeSubagentStart`, 4 for `synthesizeSubagentStop`, 5 for `mergeSubagentTitle`)

- [ ] **Step 5: Commit**

```bash
git add src/domain/subagentSynthesis.ts src/domain/subagentSynthesis.test.ts
git commit -m "feat: add SubagentStart/SubagentStop synthesis and title-merge domain logic"
```

---

### Task 3: Wire `SubagentStart`/`SubagentStop`/`PostToolUse`-merge into ingest

**Files:**
- Modify: `src/ingest/ingest.ts`
- Modify: `src/ingest/ingest.test.ts`

**Interfaces:**
- Consumes: `synthesizeSubagentStart`, `synthesizeSubagentStop`, `mergeSubagentTitle`, `SubagentStartPayload`, `SubagentStopPayload` from `../domain/subagentSynthesis.js` (Task 2); `getSession` from `../store/sessionStore.js` (existing, already imported).
- Produces: no new exports — `createIngestHandler`'s behavior extends to handle `SubagentStart`/`SubagentStop` and to prefer merging into an existing child over Phase 1's full-synthesis fallback.

- [ ] **Step 1: Write the failing tests**

Add to `src/ingest/ingest.test.ts`, after the existing "skips subagent synthesis when tool_input is missing on PostToolUse" test:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: FAIL — `SubagentStart`/`SubagentStop` produce no child row yet, and `PostToolUse` always takes the full-synthesis path

- [ ] **Step 3: Wire the new branches into `createIngestHandler`**

Replace `src/ingest/ingest.ts`'s contents with:

```ts
import type { Request, Response } from "express";
import type Database from "better-sqlite3";
import { insertEvent } from "../store/eventStore.js";
import { upsertSession, getSession } from "../store/sessionStore.js";
import { deriveStatus, type HookPayload } from "../domain/stateMachine.js";
import {
  synthesizeSubagentSession,
  synthesizeSubagentStart,
  synthesizeSubagentStop,
  mergeSubagentTitle,
  type PostToolUsePayload,
  type SubagentStartPayload,
  type SubagentStopPayload,
} from "../domain/subagentSynthesis.js";
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
      title: existing?.title ?? null,
      status,
      startedAt: existing?.startedAt ?? receivedAt,
      endedAt: status === "done" || status === "failed" ? receivedAt : null,
      cwd: payload.cwd ?? existing?.cwd ?? "",
      model: payload.model ?? existing?.model ?? null,
      recap: payload.hook_event_name === "Stop" ? payload.last_assistant_message ?? null : existing?.recap ?? null,
    });
    changeEmitter.emit("session-changed", payload.session_id);

    if (payload.hook_event_name === "SubagentStart") {
      const startPayload = payload as SubagentStartPayload;
      const existingChild = startPayload.agent_id ? getSession(db, startPayload.agent_id) : undefined;
      const child = synthesizeSubagentStart(existingChild, startPayload, receivedAt);
      if (child) {
        upsertSession(db, child);
        changeEmitter.emit("session-changed", child.id);
      }
    }

    if (payload.hook_event_name === "SubagentStop") {
      const stopPayload = payload as SubagentStopPayload;
      if (stopPayload.agent_id && stopPayload.agent_type) {
        const existingChild = getSession(db, stopPayload.agent_id);
        if (existingChild) {
          const updated = synthesizeSubagentStop(existingChild, stopPayload, receivedAt);
          if (updated) {
            upsertSession(db, updated);
            changeEmitter.emit("session-changed", updated.id);
          }
        }
      }
    }

    if (payload.hook_event_name === "PostToolUse" && payload.tool_input) {
      const agentId = payload.tool_response?.agentId;
      if (agentId) {
        const existingChild = getSession(db, agentId);
        if (existingChild) {
          const merged = mergeSubagentTitle(existingChild, payload as PostToolUsePayload, receivedAt);
          upsertSession(db, merged);
          changeEmitter.emit("session-changed", merged.id);
        } else {
          const child = synthesizeSubagentSession(payload as PostToolUsePayload, receivedAt);
          if (child) {
            upsertSession(db, child);
            changeEmitter.emit("session-changed", child.id);
          }
        }
      }
    }

    res.status(200).json({ ok: true });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ingest/ingest.test.ts`
Expected: PASS (all existing tests plus 7 new ones)

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS (all tests green)

- [ ] **Step 6: Commit**

```bash
git add src/ingest/ingest.ts src/ingest/ingest.test.ts
git commit -m "feat: wire SubagentStart/SubagentStop into ingest, merge title from PostToolUse"
```

---

### Task 4: Real hook scripts for `SubagentStart`/`SubagentStop`

**Files:**
- Create: `hooks/on-subagent-start.sh`
- Create: `hooks/on-subagent-stop.sh`
- Modify: `hooks/hooks.test.sh`

**Interfaces:**
- Consumes: nothing (shell scripts, same forwarding pattern as every existing script in `hooks/`).
- Produces: nothing consumed by other tasks — these are the installable Claude Code hook commands the user wires into `~/.claude/settings.json` manually (per the Manual Test section below), same as Phase 1's hook scripts.

- [ ] **Step 1: Create `hooks/on-subagent-start.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${CLAUDEKANBAN_PORT:-4317}"
cat | curl -s -X POST "http://127.0.0.1:${PORT}/ingest" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 2: Create `hooks/on-subagent-stop.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
PORT="${CLAUDEKANBAN_PORT:-4317}"
cat | curl -s -X POST "http://127.0.0.1:${PORT}/ingest" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 3: Make both scripts executable**

Run: `chmod +x hooks/on-subagent-start.sh hooks/on-subagent-stop.sh`

- [ ] **Step 4: Add both scripts to the existing smoke test's script list**

In `hooks/hooks.test.sh`, find the line:

```bash
for script in hooks/on-session-start.sh hooks/on-tool-use.sh hooks/on-stop.sh hooks/on-permission-request.sh hooks/on-notification.sh; do
```

and replace it with:

```bash
for script in hooks/on-session-start.sh hooks/on-tool-use.sh hooks/on-stop.sh hooks/on-permission-request.sh hooks/on-notification.sh hooks/on-subagent-start.sh hooks/on-subagent-stop.sh; do
```

- [ ] **Step 5: Run the smoke test to verify it passes**

Run: `bash hooks/hooks.test.sh`
Expected: `PASS: all hook scripts forward stdin correctly`

- [ ] **Step 6: Commit**

```bash
git add hooks/on-subagent-start.sh hooks/on-subagent-stop.sh hooks/hooks.test.sh
git commit -m "feat: add on-subagent-start/on-subagent-stop hook scripts"
```

---

### Task 5: Board UI — visual status accent on subagent cards

**Files:**
- Modify: `src/frontend/board/SessionCard.tsx`
- Modify: `src/frontend/board/board.css`
- Modify: `src/frontend/board/Board.test.tsx`

**Interfaces:**
- Consumes: nothing new — `child.status` already exists on `SessionDto`.
- Produces: no interface change — this is a rendering/styling-only task.

Today a child card's own status (`running`/`done`/`failed`) is rendered as plain muted text with no color coding — this never mattered in Phase 1 because a child was always already `done`/`failed` by the time it appeared. Now that a child can genuinely sit in `running` for real elapsed time, it needs its own visual status accent so a live "in progress" subagent reads at a glance, the same way the parent card's column does.

- [ ] **Step 1: Write the failing test**

Add to `src/frontend/board/Board.test.tsx`, after the existing "shows a subagent's title alongside its owner when present" test:

```ts
  it("sets data-status on a child card matching its own status", () => {
    const { container } = render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "running" }),
        ]}
        onSelect={() => {}}
      />
    );
    const childCard = container.querySelector(".child-card");
    expect(childCard?.getAttribute("data-status")).toBe("running");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: FAIL — `data-status` attribute not present on `.child-card`

- [ ] **Step 3: Add `data-status` to the child card element**

In `src/frontend/board/SessionCard.tsx`, find the child-card `<div>`:

```tsx
            <div
              key={child.id}
              className="child-card"
              role="button"
              tabIndex={0}
```

and add `data-status={child.status}` to it:

```tsx
            <div
              key={child.id}
              className="child-card"
              data-status={child.status}
              role="button"
              tabIndex={0}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: PASS

- [ ] **Step 5: Add status-accent CSS**

In `src/frontend/board/board.css`, immediately after the existing `.child-card:focus-visible` rule at the end of the file (the last rule in the file today), add:

```css
/* Per-card status accent for subagent cards — a child can now genuinely be
   "running" for real elapsed time (SubagentStart/SubagentStop), unlike Phase 1
   where a child was always already done/failed by the time it appeared. */
.child-card[data-status="running"] {
  border-left: 2px solid var(--ck-running);
}

.child-card[data-status="done"] {
  border-left: 2px solid var(--ck-done);
}

.child-card[data-status="failed"] {
  border-left: 2px solid var(--ck-failed);
}

@media (prefers-reduced-motion: no-preference) {
  .child-card[data-status="running"] {
    animation: ck-running-glow 3.2s ease-in-out infinite;
  }
}
```

This reuses the existing `--ck-running`/`--ck-done`/`--ck-failed` tokens and the existing `ck-running-glow` keyframe (already defined earlier in `board.css` for the column-level pulse) — no new colors, no new animation, consistent with the established token system.

- [ ] **Step 6: Run the whole suite**

Run: `npx vitest run`
Expected: PASS (all tests green)

- [ ] **Step 7: Commit**

```bash
git add src/frontend/board/SessionCard.tsx src/frontend/board/board.css src/frontend/board/Board.test.tsx
git commit -m "feat: add live status accent to subagent cards"
```

---

## Acceptance Criteria

- Spawning a subagent produces a card that appears in `running` as soon as the subagent starts (not after it finishes), nested under its parent, with a visible running accent (colored left border + pulse, matching the parent column's own running treatment).
- That card transitions to `done` (or `failed`, with the failed-column-promotion behavior from Phase 1 unchanged) once the subagent's work completes — visibly, without a page refresh.
- The subagent's title (task description) still appears once the parent's `PostToolUse` for that call arrives, merged into the same card rather than replacing it.
- A `SubagentStop` event with an empty `agent_type` (the confirmed background-job false-positive) does not create or corrupt any session row.
- If `SubagentStart`/`SubagentStop` hooks are not installed for some reason, subagent cards still work exactly as they did in Phase 1 (full synthesis from `PostToolUse`, popping in already done/failed) — no regression, pure fallback.

## Manual Test

1. Install the two new hook scripts into `~/.claude/settings.json` under `SubagentStart` and `SubagentStop` (matcher `"*"`), alongside the existing Phase 1 hooks, pointing at `hooks/on-subagent-start.sh`/`hooks/on-subagent-stop.sh` in this repo.
2. With the backend and frontend running, start a fresh Claude Code session and ask it to spawn a subagent that takes a few seconds (e.g. "use the Explore agent to search this whole repo for the word 'TODO'").
3. Watch the board: confirm a child card appears under the parent **while the subagent is still working** (running accent visible), not only after it finishes.
4. Confirm the child card's title appears once the parent's tool call resolves, and the card settles into `done` (or `failed` if the subagent errors) shortly after.
5. Confirm the parent card itself stays `running` throughout, and only reaches `done` once the parent's own `Stop` fires (i.e., after the subagent call returns control to the parent).

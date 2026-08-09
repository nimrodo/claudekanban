# Phase 2 — Detail View, Timeline, Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-through session detail drawer to the existing live board — session metadata, a human-readable event timeline (newest-first, raw payload on demand), and the `recap` text shown prominently once a session is done.

**Architecture:** Pure-frontend addition on top of Phase 1's already-shipped backend (`GET /api/sessions/:id` and `session.title` both already exist and ship unchanged). Extend the existing `Transport` interface with `getSessionDetail(id)`, add a `useSessionDetail` hook that fetches on selection and refetches on a matching SSE `session-changed` event (same "refetch on notify" pattern `useLiveState` already uses for the board — no patch-diffing, no new SSE channel). A new `Drawer` component renders as a right-side panel that slides in over a dimmed (not blocking) board. Board cards become clickable to select a session; selection state is local React state in `main.tsx` — no router, no URL param.

**Tech Stack:** TypeScript, React 18, Vitest + @testing-library/react (same as Phase 1 — no new dependencies).

## Global Constraints

- `fetch`/`EventSource` may only appear inside `src/frontend/lib/transport/` — all other frontend code talks through the `Transport` interface. (spec, "Transport abstraction")
- No router, no URL param for drawer open/closed state in this phase — local React state only. (grilled decision, this plan's scoping)
- Live updates use "refetch on notify": on a matching SSE event, refetch the full resource via the existing REST endpoint, never apply a partial patch client-side. (established pattern, `useLiveState.ts`)
- The drawer is a right-side sliding panel; the board stays visible (dimmed) behind it — not a full-screen modal, not a bottom sheet. (grilled decision)
- Timeline entries render a short human-readable one-liner per event; the raw JSON payload is available per-entry behind an expand toggle, not shown by default. (grilled decision)
- Visual design reuses the existing token system in `src/frontend/board/board.css` (`--ck-*` custom properties, IBM Plex Mono/Sans) — no new palette invented for the drawer. (spec, "Visual design")
- `session.title` and `GET /api/sessions/:id` already exist and are out of scope for this plan — do not re-implement them.

---

### Task 1: Transport — session detail types + `getSessionDetail`

**Files:**
- Modify: `src/frontend/lib/transport/Transport.ts`
- Modify: `src/frontend/lib/transport/HttpSseTransport.ts`
- Modify: `src/frontend/lib/transport/HttpSseTransport.test.ts`
- Modify: `src/frontend/lib/useLiveState.test.tsx` (its local `fakeTransport` implements `Transport` by object literal and must satisfy the extended interface)

**Interfaces:**
- Consumes: nothing new — extends the existing `Transport`/`SessionDto` types already defined in `src/frontend/lib/transport/Transport.ts`.
- Produces: `EventDto` (`{ id: number; sessionId: string; ts: string; type: string; payload: string }`), `SessionDetailResponse` (`{ session: SessionDto; events: EventDto[] }`), and `Transport.getSessionDetail(id: string): Promise<SessionDetailResponse>` — later tasks (`useSessionDetail`, `Drawer`, `eventSummary`) consume these exact names.

- [ ] **Step 1: Write the failing test for `HttpSseTransport.getSessionDetail`**

Add to `src/frontend/lib/transport/HttpSseTransport.test.ts` (inside the existing `describe("HttpSseTransport", ...)` block, after the existing `getState` tests):

```ts
  it("getSessionDetail fetches /api/sessions/:id and returns parsed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ session: { id: "sess-1" }, events: [{ id: 1, sessionId: "sess-1", ts: "t", type: "SessionStart", payload: "{}" }] }),
      }))
    );
    const transport = new HttpSseTransport();
    const detail = await transport.getSessionDetail("sess-1");
    expect(fetch).toHaveBeenCalledWith("/api/sessions/sess-1");
    expect(detail.session).toEqual({ id: "sess-1" });
    expect(detail.events).toHaveLength(1);
  });

  it("getSessionDetail throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const transport = new HttpSseTransport();
    await expect(transport.getSessionDetail("missing")).rejects.toThrow("GET /api/sessions/missing failed: 404");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/frontend/lib/transport/HttpSseTransport.test.ts`
Expected: FAIL — `transport.getSessionDetail is not a function`

- [ ] **Step 3: Add the types to `Transport.ts`**

In `src/frontend/lib/transport/Transport.ts`, replace the file's contents with:

```ts
import type { SessionShape, SessionStatus } from "../../../domain/types.js";

export type { SessionStatus };

export type SessionDto = SessionShape;

export interface StateResponse {
  sessions: SessionDto[];
}

export interface EventDto {
  id: number;
  sessionId: string;
  ts: string;
  type: string;
  payload: string;
}

export interface SessionDetailResponse {
  session: SessionDto;
  events: EventDto[];
}

export interface StreamEvent {
  type: string;
  entityId: string;
}

export interface Transport {
  getState(): Promise<StateResponse>;
  getSessionDetail(id: string): Promise<SessionDetailResponse>;
  subscribe(onEvent: (event: StreamEvent) => void): () => void;
}
```

- [ ] **Step 4: Implement `getSessionDetail` in `HttpSseTransport.ts`**

In `src/frontend/lib/transport/HttpSseTransport.ts`, replace the file's contents with:

```ts
import type { SessionDetailResponse, StateResponse, StreamEvent, Transport } from "./Transport.js";

export class HttpSseTransport implements Transport {
  constructor(private readonly baseUrl: string = "") {}

  async getState(): Promise<StateResponse> {
    const res = await fetch(`${this.baseUrl}/api/state`);
    if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
    return res.json() as Promise<StateResponse>;
  }

  async getSessionDetail(id: string): Promise<SessionDetailResponse> {
    const res = await fetch(`${this.baseUrl}/api/sessions/${id}`);
    if (!res.ok) throw new Error(`GET /api/sessions/${id} failed: ${res.status}`);
    return res.json() as Promise<SessionDetailResponse>;
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/frontend/lib/transport/HttpSseTransport.test.ts`
Expected: PASS (5 tests: 2 existing `getState`, 2 new `getSessionDetail`, plus the existing 2 `subscribe` tests — 6 total)

- [ ] **Step 6: Fix `useLiveState.test.tsx`'s `fakeTransport` to satisfy the extended interface**

`src/frontend/lib/useLiveState.test.tsx` builds `Transport` object literals by hand in three places (the `fakeTransport` helper and two inline literals in the last two tests). Add a `getSessionDetail` stub to each so they still type-check as `Transport` — `useLiveState` itself never calls this method, so the stub just needs to satisfy the type:

In `fakeTransport`'s returned object (around line 24-32), add the method:

```ts
  const transport: Transport = {
    getState: async () => ({ sessions: state }),
    getSessionDetail: () => Promise.reject(new Error("not used by useLiveState")),
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
```

Do the same — add `getSessionDetail: () => Promise.reject(new Error("not used by useLiveState")),` right after each `getState: ...,` line — in the two inline `Transport` literals inside the "tears down the subscription..." and "ignores a stale getState()..." tests.

- [ ] **Step 7: Run the full suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS (all existing 47 tests plus the 2 new ones = 49 total)

- [ ] **Step 8: Commit**

```bash
git add src/frontend/lib/transport/Transport.ts src/frontend/lib/transport/HttpSseTransport.ts src/frontend/lib/transport/HttpSseTransport.test.ts src/frontend/lib/useLiveState.test.tsx
git commit -m "feat: add Transport.getSessionDetail for the detail drawer"
```

---

### Task 2: Event timeline summaries

**Files:**
- Create: `src/frontend/detail/eventSummary.ts`
- Test: `src/frontend/detail/eventSummary.test.ts`

**Interfaces:**
- Consumes: `EventDto` from `../lib/transport/Transport.js` (Task 1).
- Produces: `TimelineEntry` (`{ id: number; ts: string; type: string; summary: string; raw: unknown }`) and `buildTimeline(events: EventDto[]): TimelineEntry[]` — consumed by `Drawer` (Task 4).

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/detail/eventSummary.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildTimeline } from "./eventSummary.js";
import type { EventDto } from "../lib/transport/Transport.js";

function event(overrides: Partial<EventDto>): EventDto {
  return {
    id: 1,
    sessionId: "sess-1",
    ts: "2026-08-08T10:00:00.000Z",
    type: "SessionStart",
    payload: "{}",
    ...overrides,
  };
}

describe("buildTimeline", () => {
  it("summarizes SessionStart", () => {
    const [entry] = buildTimeline([event({ type: "SessionStart", payload: "{}" })]);
    expect(entry.summary).toBe("Session started");
  });

  it("summarizes a plain PostToolUse call by tool name", () => {
    const [entry] = buildTimeline([
      event({ type: "PostToolUse", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entry.summary).toBe("Called Bash");
  });

  it("summarizes a subagent-spawning PostToolUse call", () => {
    const [entry] = buildTimeline([
      event({
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "Explore" } }),
      }),
    ]);
    expect(entry.summary).toBe("Spawned Explore subagent");
  });

  it("summarizes PermissionRequest with the tool_input description when present", () => {
    const [entry] = buildTimeline([
      event({
        type: "PermissionRequest",
        payload: JSON.stringify({ tool_name: "Bash", tool_input: { command: "rm nimrod.txt", description: "Remove nimrod.txt" } }),
      }),
    ]);
    expect(entry.summary).toBe("Requested permission: Remove nimrod.txt");
  });

  it("summarizes PermissionRequest without a description by tool name", () => {
    const [entry] = buildTimeline([
      event({ type: "PermissionRequest", payload: JSON.stringify({ tool_name: "Bash" }) }),
    ]);
    expect(entry.summary).toBe("Requested permission to use Bash");
  });

  it("summarizes an idle_prompt Notification", () => {
    const [entry] = buildTimeline([
      event({ type: "Notification", payload: JSON.stringify({ notification_type: "idle_prompt" }) }),
    ]);
    expect(entry.summary).toBe("Waiting for input");
  });

  it("summarizes Stop", () => {
    const [entry] = buildTimeline([event({ type: "Stop", payload: "{}" })]);
    expect(entry.summary).toBe("Session finished");
  });

  it("falls back to the raw type for an unrecognized event type", () => {
    const [entry] = buildTimeline([event({ type: "SomethingNew", payload: "{}" })]);
    expect(entry.summary).toBe("SomethingNew");
  });

  it("orders entries newest-first by id", () => {
    const entries = buildTimeline([event({ id: 1 }), event({ id: 3 }), event({ id: 2 })]);
    expect(entries.map((e) => e.id)).toEqual([3, 2, 1]);
  });

  it("exposes the parsed payload as raw", () => {
    const [entry] = buildTimeline([event({ payload: JSON.stringify({ tool_name: "Bash" }) })]);
    expect(entry.raw).toEqual({ tool_name: "Bash" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/frontend/detail/eventSummary.test.ts`
Expected: FAIL — `Cannot find module './eventSummary.js'`

- [ ] **Step 3: Implement `eventSummary.ts`**

Create `src/frontend/detail/eventSummary.ts`:

```ts
import type { EventDto } from "../lib/transport/Transport.js";

export interface TimelineEntry {
  id: number;
  ts: string;
  type: string;
  summary: string;
  raw: unknown;
}

interface ToolCallPayload {
  tool_name?: string;
  tool_input?: { subagent_type?: string; description?: string; [key: string]: unknown };
  notification_type?: string;
}

function summarize(type: string, payload: ToolCallPayload): string {
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

export function buildTimeline(events: EventDto[]): TimelineEntry[] {
  return events
    .map((event) => {
      let raw: unknown = {};
      try {
        raw = JSON.parse(event.payload);
      } catch {
        raw = event.payload;
      }
      return {
        id: event.id,
        ts: event.ts,
        type: event.type,
        summary: summarize(event.type, (raw ?? {}) as ToolCallPayload),
        raw,
      };
    })
    .sort((a, b) => b.id - a.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/frontend/detail/eventSummary.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/detail/eventSummary.ts src/frontend/detail/eventSummary.test.ts
git commit -m "feat: add human-readable event timeline summaries"
```

---

### Task 3: `useSessionDetail` hook

**Files:**
- Create: `src/frontend/lib/useSessionDetail.ts`
- Test: `src/frontend/lib/useSessionDetail.test.tsx`

**Interfaces:**
- Consumes: `Transport.getSessionDetail`, `Transport.subscribe`, `StreamEvent`, `SessionDetailResponse` from `./transport/Transport.js` (Task 1).
- Produces: `useSessionDetail(transport: Transport, sessionId: string | null): { detail: SessionDetailResponse | null; loading: boolean }` — consumed by `main.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/lib/useSessionDetail.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSessionDetail } from "./useSessionDetail.js";
import type { SessionDetailResponse, StreamEvent, Transport } from "./transport/Transport.js";

function makeDetail(id: string): SessionDetailResponse {
  return {
    session: {
      id,
      parentSessionId: null,
      owner: "main",
      title: null,
      status: "running",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp",
      model: null,
      recap: null,
    },
    events: [],
  };
}

function fakeTransport(): {
  transport: Transport;
  emit: (e: StreamEvent) => void;
  resolveNext: (detail: SessionDetailResponse) => void;
  getDetailCallCount: () => number;
} {
  let listener: ((event: StreamEvent) => void) | null = null;
  let callCount = 0;
  const resolvers: Array<(detail: SessionDetailResponse) => void> = [];
  const transport: Transport = {
    getState: async () => ({ sessions: [] }),
    getSessionDetail: (_id: string) => {
      callCount += 1;
      return new Promise((resolve) => resolvers.push(resolve));
    },
    subscribe: (onEvent) => {
      listener = onEvent;
      return () => {
        listener = null;
      };
    },
  };
  return {
    transport,
    emit: (event) => listener?.(event),
    resolveNext: (detail) => resolvers.shift()?.(detail),
    getDetailCallCount: () => callCount,
  };
}

describe("useSessionDetail", () => {
  it("returns no detail and not loading when sessionId is null", () => {
    const { transport } = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(transport, null));
    expect(result.current).toEqual({ detail: null, loading: false });
  });

  it("fetches and loads detail when given a sessionId", async () => {
    const helper = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    expect(result.current.loading).toBe(true);

    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.detail?.session.id).toBe("sess-1");
  });

  it("refetches when a session-changed event matches the current sessionId", async () => {
    const helper = fakeTransport();
    const { result } = renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    helper.emit({ type: "session-changed", entityId: "sess-1" });
    await waitFor(() => expect(helper.getDetailCallCount()).toBe(2));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(result.current.detail?.session.id).toBe("sess-1"));
  });

  it("ignores a session-changed event for a different sessionId", async () => {
    const helper = fakeTransport();
    renderHook(() => useSessionDetail(helper.transport, "sess-1"));
    helper.resolveNext(makeDetail("sess-1"));
    await waitFor(() => expect(helper.getDetailCallCount()).toBe(1));

    helper.emit({ type: "session-changed", entityId: "sess-2" });
    // Give any (incorrect) refetch a chance to fire, then assert it didn't.
    await Promise.resolve();
    expect(helper.getDetailCallCount()).toBe(1);
  });

  it("unsubscribes on unmount", () => {
    let unsubscribed = false;
    const transport: Transport = {
      getState: async () => ({ sessions: [] }),
      getSessionDetail: () => new Promise(() => {}),
      subscribe: () => () => {
        unsubscribed = true;
      },
    };
    const { unmount } = renderHook(() => useSessionDetail(transport, "sess-1"));
    unmount();
    expect(unsubscribed).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/frontend/lib/useSessionDetail.test.tsx`
Expected: FAIL — `Cannot find module './useSessionDetail.js'`

- [ ] **Step 3: Implement `useSessionDetail.ts`**

Create `src/frontend/lib/useSessionDetail.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import type { SessionDetailResponse, StreamEvent, Transport } from "./transport/Transport.js";

export function useSessionDetail(
  transport: Transport,
  sessionId: string | null
): { detail: SessionDetailResponse | null; loading: boolean } {
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setDetail(null);
    setLoading(true);

    function fetchDetail() {
      latestRequestId.current += 1;
      const requestId = latestRequestId.current;
      transport.getSessionDetail(sessionId as string).then((result) => {
        if (!cancelled && requestId === latestRequestId.current) {
          setDetail(result);
          setLoading(false);
        }
      });
    }

    fetchDetail();

    const unsubscribe = transport.subscribe((event: StreamEvent) => {
      if (event.entityId === sessionId) {
        fetchDetail();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [transport, sessionId]);

  return { detail, loading };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/frontend/lib/useSessionDetail.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/frontend/lib/useSessionDetail.ts src/frontend/lib/useSessionDetail.test.tsx
git commit -m "feat: add useSessionDetail hook (fetch + refetch on matching SSE event)"
```

---

### Task 4: Drawer component

**Files:**
- Create: `src/frontend/detail/Drawer.tsx`
- Create: `src/frontend/detail/drawer.css`
- Test: `src/frontend/detail/Drawer.test.tsx`

**Interfaces:**
- Consumes: `SessionDetailResponse` from `../lib/transport/Transport.js` (Task 1), `buildTimeline`/`TimelineEntry` from `./eventSummary.js` (Task 2).
- Produces: `Drawer({ open, detail, loading, onClose }: { open: boolean; detail: SessionDetailResponse | null; loading: boolean; onClose: () => void })` — consumed by `main.tsx` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `src/frontend/detail/Drawer.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Drawer } from "./Drawer.js";
import type { SessionDetailResponse } from "../lib/transport/Transport.js";

function detail(overrides: Partial<SessionDetailResponse["session"]> = {}): SessionDetailResponse {
  return {
    session: {
      id: "sess-1",
      parentSessionId: null,
      owner: "main",
      title: "Find TODO occurrences",
      status: "running",
      startedAt: "2026-08-08T10:00:00.000Z",
      endedAt: null,
      cwd: "/tmp/project",
      model: "claude-sonnet-5",
      recap: null,
      ...overrides,
    },
    events: [
      { id: 1, sessionId: "sess-1", ts: "2026-08-08T10:00:00.000Z", type: "SessionStart", payload: "{}" },
      {
        id: 2,
        sessionId: "sess-1",
        ts: "2026-08-08T10:00:05.000Z",
        type: "PostToolUse",
        payload: JSON.stringify({ tool_name: "Bash" }),
      },
    ],
  };
}

describe("Drawer", () => {
  it("shows a loading placeholder when loading and no detail yet", () => {
    render(<Drawer open detail={null} loading onClose={() => {}} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("renders session metadata", () => {
    render(<Drawer open detail={detail()} loading={false} onClose={() => {}} />);
    expect(screen.getByText("Find TODO occurrences")).toBeInTheDocument();
    expect(screen.getByText("/tmp/project")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("renders timeline entries newest-first with human-readable summaries", () => {
    render(<Drawer open detail={detail()} loading={false} onClose={() => {}} />);
    const summaries = screen.getAllByText(/Session started|Called Bash/);
    expect(summaries.map((el) => el.textContent)).toEqual(["Called Bash", "Session started"]);
  });

  it("reveals raw JSON for a timeline entry when its toggle is clicked", () => {
    render(<Drawer open detail={detail()} loading={false} onClose={() => {}} />);
    expect(screen.queryByText(/"tool_name"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Show raw")[0]);
    expect(screen.getByText(/"tool_name"/)).toBeInTheDocument();
  });

  it("shows the recap when status is done and recap is set", () => {
    render(
      <Drawer
        open
        detail={detail({ status: "done", recap: "Found 2 files with TODOs." })}
        loading={false}
        onClose={() => {}}
      />
    );
    expect(screen.getByText("Found 2 files with TODOs.")).toBeInTheDocument();
  });

  it("does not show a recap section when status is not done", () => {
    render(<Drawer open detail={detail({ status: "running", recap: null })} loading={false} onClose={() => {}} />);
    expect(screen.queryByText("Recap")).not.toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<Drawer open detail={detail()} loading={false} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the overlay is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(<Drawer open detail={detail()} loading={false} onClose={onClose} />);
    fireEvent.click(container.querySelector(".drawer-overlay")!);
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed while open", () => {
    const onClose = vi.fn();
    render(<Drawer open detail={detail()} loading={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not respond to Escape when closed", () => {
    const onClose = vi.fn();
    render(<Drawer open={false} detail={detail()} loading={false} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/frontend/detail/Drawer.test.tsx`
Expected: FAIL — `Cannot find module './Drawer.js'`

- [ ] **Step 3: Implement `Drawer.tsx`**

Create `src/frontend/detail/Drawer.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { SessionDetailResponse } from "../lib/transport/Transport.js";
import { buildTimeline } from "./eventSummary.js";
import "./drawer.css";

export function Drawer({
  open,
  detail,
  loading,
  onClose,
}: {
  open: boolean;
  detail: SessionDetailResponse | null;
  loading: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const timeline = detail ? buildTimeline(detail.events) : [];

  return (
    <>
      <div className="drawer-overlay" data-open={open} onClick={onClose} />
      <aside className="drawer" data-open={open} aria-hidden={!open}>
        {loading && !detail && <div className="drawer-loading">Loading…</div>}
        {detail && (
          <>
            <div className="drawer-header">
              <div>
                <div className="drawer-title">{detail.session.title ?? detail.session.owner}</div>
                <div className="drawer-subtitle">{detail.session.cwd}</div>
              </div>
              <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>

            <dl className="drawer-meta">
              <dt>Status</dt>
              <dd className="drawer-status">{detail.session.status}</dd>
              <dt>Owner</dt>
              <dd>{detail.session.owner}</dd>
              <dt>Model</dt>
              <dd>{detail.session.model ?? "—"}</dd>
              <dt>Started</dt>
              <dd>{detail.session.startedAt}</dd>
              <dt>Ended</dt>
              <dd>{detail.session.endedAt ?? "—"}</dd>
            </dl>

            {detail.session.status === "done" && detail.session.recap && (
              <div className="drawer-recap">
                <h3>Recap</h3>
                <p>{detail.session.recap}</p>
              </div>
            )}

            <div className="drawer-timeline">
              <h3>Timeline</h3>
              {timeline.map((entry) => (
                <div key={entry.id} className="timeline-entry">
                  <div className="timeline-row">
                    <span className="timeline-ts">{entry.ts}</span>
                    <span className="timeline-summary">{entry.summary}</span>
                    <button type="button" className="timeline-toggle" onClick={() => toggleExpanded(entry.id)}>
                      {expanded.has(entry.id) ? "Hide raw" : "Show raw"}
                    </button>
                  </div>
                  {expanded.has(entry.id) && (
                    <pre className="timeline-raw">{JSON.stringify(entry.raw, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}
```

- [ ] **Step 4: Add a functional baseline `drawer.css`**

Create `src/frontend/detail/drawer.css` (functional layout using the board's existing `--ck-*` tokens; Step 6 below polishes this further):

```css
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.drawer-overlay[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 100vw);
  background: var(--ck-panel);
  border-left: 1px solid var(--ck-border);
  padding: 1rem 1.1rem 1.5rem;
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 0.2s ease;
  z-index: 11;
  font-family: var(--ck-font-sans);
  color: var(--ck-text);
}

.drawer[data-open="true"] {
  transform: translateX(0);
}

.drawer-loading {
  color: var(--ck-text-muted);
  font-family: var(--ck-font-mono);
  font-size: 0.85rem;
  padding-top: 2rem;
  text-align: center;
}

.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.drawer-title {
  font-weight: 600;
  font-size: 1rem;
}

.drawer-subtitle {
  font-family: var(--ck-font-mono);
  font-size: 0.78rem;
  color: var(--ck-text-muted);
}

.drawer-close {
  background: none;
  border: none;
  color: var(--ck-text-muted);
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.drawer-meta {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 0.75rem;
  font-family: var(--ck-font-mono);
  font-size: 0.8rem;
  margin: 0 0 1rem;
}

.drawer-meta dt {
  color: var(--ck-text-faint);
}

.drawer-meta dd {
  margin: 0;
}

.drawer-recap {
  background: var(--ck-panel-raised);
  border: 1px solid var(--ck-border-soft);
  border-radius: 4px;
  padding: 0.6rem 0.75rem;
  margin-bottom: 1rem;
}

.drawer-recap h3,
.drawer-timeline h3 {
  font-family: var(--ck-font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ck-text-muted);
  margin: 0 0 0.5rem;
}

.timeline-entry {
  border-top: 1px solid var(--ck-border-soft);
  padding: 0.5rem 0;
}

.timeline-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
}

.timeline-ts {
  font-family: var(--ck-font-mono);
  color: var(--ck-text-faint);
  font-size: 0.72rem;
}

.timeline-summary {
  flex: 1;
}

.timeline-toggle {
  background: none;
  border: 1px solid var(--ck-border-soft);
  color: var(--ck-text-muted);
  font-family: var(--ck-font-mono);
  font-size: 0.68rem;
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
}

.timeline-raw {
  font-family: var(--ck-font-mono);
  font-size: 0.72rem;
  color: var(--ck-text-muted);
  background: var(--ck-bg);
  border-radius: 3px;
  padding: 0.5rem;
  overflow-x: auto;
  margin: 0.4rem 0 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/frontend/detail/Drawer.test.tsx`
Expected: PASS (10 tests)

- [ ] **Step 6: Run the `frontend-design` skill to polish `drawer.css`**

Invoke the `frontend-design` skill on `src/frontend/detail/drawer.css`, with the constraint that it must reuse the existing `--ck-*` custom properties and IBM Plex Mono/Sans fonts already defined in `src/frontend/board/board.css` (same palette/type system as the board — no new colors or fonts), and must not change any class names used in `Drawer.tsx` or break the `Drawer.test.tsx` assertions above (re-run `npx vitest run src/frontend/detail/Drawer.test.tsx` after polishing to confirm).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/detail/Drawer.tsx src/frontend/detail/drawer.css src/frontend/detail/Drawer.test.tsx
git commit -m "feat: add session detail drawer with live timeline and recap"
```

---

### Task 5: Board click wiring + app-level state

**Files:**
- Modify: `src/frontend/board/SessionCard.tsx`
- Modify: `src/frontend/board/Board.tsx`
- Modify: `src/frontend/board/Board.test.tsx`
- Modify: `src/frontend/main.tsx`

**Interfaces:**
- Consumes: `Drawer` (Task 4), `useSessionDetail` (Task 3), `HttpSseTransport` (existing).
- Produces: `SessionCard`/`Board` gain a required `onSelect: (id: string) => void` prop.

- [ ] **Step 1: Write the failing tests**

Add to `src/frontend/board/Board.test.tsx`. First, update the `session()` fixture's usage — the existing tests call `<Board sessions={...} />` without `onSelect`, which will now fail to compile since `onSelect` becomes required. Update every existing `render(<Board sessions={...} />)` call in the file to `render(<Board sessions={...} onSelect={() => {}} />)`, then add:

```tsx
  it("calls onSelect with a top-level session's id when its card is clicked", () => {
    const onSelect = vi.fn();
    render(<Board sessions={[session({ id: "sess-1", status: "running" })]} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("tmp"));
    expect(onSelect).toHaveBeenCalledWith("sess-1");
  });

  it("calls onSelect with a subagent's id (not its parent's) when its child card is clicked", () => {
    const onSelect = vi.fn();
    render(
      <Board
        sessions={[
          session({ id: "parent-1", owner: "main", status: "running" }),
          session({ id: "child-1", owner: "Explore", parentSessionId: "parent-1", status: "done" }),
        ]}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("Explore"));
    expect(onSelect).toHaveBeenCalledWith("child-1");
    expect(onSelect).not.toHaveBeenCalledWith("parent-1");
  });
```

Also add `fireEvent` and `vi` to the existing `import { describe, expect, it } from "vitest";` and `import { render, screen } from "@testing-library/react";` lines at the top of the file, making them:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: FAIL — compile error (`onSelect` missing) or, once the fixture calls are updated, `onSelect` never called

- [ ] **Step 3: Add click handling to `SessionCard.tsx`**

Replace `src/frontend/board/SessionCard.tsx`'s contents with:

```tsx
import type { KeyboardEvent } from "react";
import type { SessionDto } from "../lib/transport/Transport.js";

function cwdLabel(cwd: string): string {
  return cwd.replace(/\/+$/, "").split("/").pop() || cwd;
}

function handleActivateKey(e: KeyboardEvent, onActivate: () => void) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onActivate();
  }
}

export function SessionCard({
  session,
  children,
  onSelect,
}: {
  session: SessionDto;
  children: SessionDto[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(session.id)}
      onKeyDown={(e) => handleActivateKey(e, () => onSelect(session.id))}
    >
      <div className="card-cwd" title={session.cwd}>{cwdLabel(session.cwd)}</div>
      <div className="card-owner">{session.owner}</div>
      <div className="card-id">{session.id.slice(0, 8)}</div>
      <div className="card-status">{session.status}</div>
      {children.length > 0 && (
        <div className="card-children">
          {children.map((child) => (
            <div
              key={child.id}
              className="child-card"
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(child.id);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                handleActivateKey(e, () => onSelect(child.id));
              }}
            >
              {child.title && (
                <div className="child-title" title={child.title}>{child.title}</div>
              )}
              <div className="child-meta">
                <span className="card-owner">{child.owner}</span>
                <span className="card-status">{child.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Thread `onSelect` through `Board.tsx`**

Replace `src/frontend/board/Board.tsx`'s contents with:

```tsx
import type { SessionDto, SessionStatus } from "../lib/transport/Transport.js";
import { SessionCard } from "./SessionCard.js";
import "./board.css";

const STATUS_COLUMNS: SessionStatus[] = ["queued", "running", "waiting", "done", "failed"];

export function Board({ sessions, onSelect }: { sessions: SessionDto[]; onSelect: (id: string) => void }) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  // A failed subagent is promoted to a top-level card in the "failed" column so its
  // failure is visible at column level, instead of being buried inside its parent's card.
  const isPromotedFailedChild = (s: SessionDto) => Boolean(s.parentSessionId) && byId.has(s.parentSessionId!) && s.status === "failed";
  const topLevel = sessions.filter((s) => (!s.parentSessionId || !byId.has(s.parentSessionId) || isPromotedFailedChild(s)));

  return (
    <div className="board">
      {STATUS_COLUMNS.map((status) => (
        <div key={status} className="column" data-status={status}>
          <h2>{status}</h2>
          {topLevel
            .filter((s) => s.status === status)
            .map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onSelect={onSelect}
                children={isPromotedFailedChild(s) ? [] : sessions.filter((c) => c.parentSessionId === s.id && c.status !== "failed")}
              />
            ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/frontend/board/Board.test.tsx`
Expected: PASS (6 tests: 4 existing + 2 new)

- [ ] **Step 6: Wire the drawer into `main.tsx`**

Replace `src/frontend/main.tsx`'s contents with:

```tsx
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { Board } from "./board/Board.js";
import { Drawer } from "./detail/Drawer.js";
import { useLiveState } from "./lib/useLiveState.js";
import { useSessionDetail } from "./lib/useSessionDetail.js";
import { HttpSseTransport } from "./lib/transport/HttpSseTransport.js";

const transport = new HttpSseTransport();

function App() {
  const { sessions } = useLiveState(transport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { detail, loading } = useSessionDetail(transport, selectedId);

  return (
    <>
      <Board sessions={sessions} onSelect={setSelectedId} />
      <Drawer open={selectedId !== null} detail={detail} loading={loading} onClose={() => setSelectedId(null)} />
    </>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("missing #root element");
createRoot(container).render(<App />);
```

- [ ] **Step 7: Run the full suite to verify nothing broke**

Run: `npx vitest run`
Expected: PASS (all tests green — Task 1's 49, plus Task 2's 10, Task 3's 5, Task 4's 10, Task 5's 2 new Board tests = 76 total)

- [ ] **Step 8: Commit**

```bash
git add src/frontend/board/SessionCard.tsx src/frontend/board/Board.tsx src/frontend/board/Board.test.tsx src/frontend/main.tsx
git commit -m "feat: make session cards clickable and wire the detail drawer into the app"
```

---

## Acceptance Criteria

- Clicking any top-level session card opens the drawer for that session; clicking a subagent (child) card opens the drawer for the subagent, not its parent.
- The drawer shows session metadata (title/owner, cwd, status, model, started/ended timestamps) and, once `status === "done"`, the `recap` text prominently.
- The timeline shows every event for the session in newest-first order, each as a short human-readable summary with its timestamp; clicking an entry's "Show raw" toggle reveals the full JSON payload, and "Hide raw" collapses it again.
- New events for the open session append to the timeline live (drawer refetches on a matching SSE `session-changed` event) without closing/reopening the drawer.
- The board stays visible (dimmed) behind the open drawer; clicking the dimmed overlay, clicking the close button, or pressing Escape all close the drawer.
- No page reload, router, or URL param is involved in opening/closing the drawer.

## Manual Test

1. With the backend (`npm run dev:server`) and frontend (`npm run dev:frontend`) running and hooks installed (per Phase 1's manual test), start a real Claude Code session.
2. Click its card once it appears on the board — confirm the drawer slides in from the right, the board is still visible but dimmed behind it, and the timeline shows a "Session started" entry.
3. Trigger a permission prompt or spawn a subagent while the drawer is open — confirm new timeline entries append live without needing to close/reopen the drawer.
4. Click a "Show raw" toggle on one entry — confirm the raw JSON payload appears; click again to collapse it.
5. Let the session finish (`Stop`) — confirm the recap section appears in the drawer once `status` becomes `done`.
6. Close the drawer via the × button, then reopen and close it via clicking the dimmed overlay, then reopen and close it via the Escape key — confirm all three close paths work.
7. Spawn a subagent, wait for it to complete, and click its child card specifically — confirm the drawer opens for the subagent (its own id/title/owner), not the parent session.

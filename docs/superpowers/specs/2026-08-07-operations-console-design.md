# claudekanban — Operations Console Design

## Context

A real-time kanban-style operations console for Claude Code: a local web app that lets a developer watch tasks/sessions/subagents execute across multiple Claude Code invocations, drill into a live activity timeline, and take limited interventions (approve/retry/resume/cancel/guidance). Greenfield project.

Clarified during design:
- **Ingestion**: Claude Code hooks are the primary event source (SessionStart/PreToolUse/PostToolUse/Stop/etc. push structured events); transcript/JSONL tailing is a secondary fallback for richer content later — not required for MVP.
- **Intervention**: DB-mediated signal. The console writes an intent row; a cooperating hook/script in the target session polls/checks it and acts. No direct process control (no stdin injection/signals) in MVP.
- **Persistence**: SQLite (single file, transactional, queryable, manually inspectable).
- **Deployment scope**: Local machine only for MVP, but the event-ingestion boundary (HTTP endpoint) is designed to be network-reachable so a remote machine could push events later without a rewrite.
- **Domain model**: Task entity dropped for v1 — Session is the sole kanban unit. Every session, main or subagent, is its own card. Subagents are Session rows linked via `parent_session_id`, carrying an `owner` label (from `subagent_type` when the hook payload exposes it, else a generic fallback) so their card shows who owns them. Approval and Intervention are merged into one `intervention` table (`origin: 'system' | 'human'`). Artifact table dropped — a `recap` text column on `session`, populated from the raw `Stop` hook payload's final message, covers the "see the agent's recap when done" requirement without a separate table or a summarization step. **Conflict found in Phase 0:** subagents do not emit their own hook stream — see `spike/findings.md` ("Subagent linkage"); the ingest/domain-model design below must synthesize subagent Session rows from a single parent `PostToolUse` event, not from an independent SessionStart/Stop pair.
- **v1 scope is read-only observability only.** Intervention schema exists but `POST /intervene` and the session-side polling hook are v2, deferred until Phase 0 confirms a running session can actually notice a pending intervention.
- **Frontend**: once Phase 1 (board UI) is reached, go through the `frontend-design` skill for palette/type/layout before/while building — not decided abstractly now, since real card content (status, owner, recap) needs to exist first.
- **Open fork to resolve in Phase 0**: the Claude Agent SDK (`claude-agent-sdk` / `@anthropic-ai/claude-agent-sdk`) packages the same harness as Claude Code — agent loop, hooks, sessions, subagents — as a library. If claudekanban's backend used it to launch sessions itself, hooks become native in-process callbacks (no shell scripts, no HTTP hop, richer typed events including subagent identity) — but claudekanban would then only see sessions it launches itself, not ones a developer starts independently in a terminal. Current plan keeps the CLI-hooks approach (passive observer of any session); revisit this choice once Phase 0 clarifies what CLI hooks actually expose.
  **Resolved (Phase 0):** keep CLI hooks — see `spike/findings.md` ("CLI hooks vs. Agent SDK — ingestion decision"). The Agent SDK capture (`spike/captures/agent-sdk.jsonl`) showed the same subagent-nested-in-parent-`PostToolUse` limitation as CLI hooks (no independent session-id stream for subagents either way), plus a new regression where `SessionStart` did not fire despite correct native hook registration. With no decisive win on subagent linkage and a real loss of passive-observer scope (SDK ingestion only sees sessions claudekanban itself launches), CLI hooks remain the ingestion path.

---

## Executive summary

Build a local web app: Claude Code hooks push JSON events over HTTP to a small Node/TypeScript backend, which validates and writes them to SQLite (source of truth) and fans them out over SSE to a React frontend showing a kanban board (queued/running/failed/done for v1; waiting/review deferred). Every session — main or subagent — is its own card, with an owner badge and a recap shown once done. Recommended architecture: **single Node process, Express + `better-sqlite3`, SSE push (no WebSocket, no broker), React + Vite frontend, single package.** v1 ships read-only; DB-mediated intervention (approve/retry/resume/cancel/guidance) is v2. Electron-compatibility is preserved by keeping the Node backend as a standalone process the UI shell only talks to over HTTP/SSE. VSCode-extension compatibility is preserved the same way plus one more layer: the frontend never calls `fetch`/`EventSource` directly — it goes through a `Transport` interface, so a future VSCode Webview shell can swap in a `postMessage`-bridged implementation (routed through the extension host, which can always reach the backend) without touching UI code.

## Problem framing

Today, running several Claude Code sessions/subagents in parallel means tailing several terminals by hand — there's no single place to see what's queued, what's stuck waiting on approval, or what just failed. This tool is a developer console, not a project tracker: its unit of interest is *live execution state*, not backlog grooming. Two jobs: (1) glanceable observability across concurrent sessions, (2) narrow, safe intervention when a session needs a human (approve a tool call, retry after failure, resume after interruption, cancel, or drop in guidance text).

## Hidden assumptions

| Assumption | Risk if wrong | Resolution |
|---|---|---|
| Claude Code hooks can emit arbitrary HTTP calls with enough payload (session id, tool name, status) | If hooks are too limited, ingestion needs transcript tailing as primary, not fallback | Validate in Phase 0 spike |
| A session process can be made to *check* for pending intent (poll DB/file) between/during tool calls | If a running session can't check mid-task, "cancel"/"guidance" can only apply at next tool boundary, not truly real-time | Confirmed intervention model is DB-mediated + polling; MVP accepts boundary-granularity intervention, not mid-generation interrupt |
| One developer, one machine, moderate session count (single digits to low tens concurrently) | If concurrency is much higher, SQLite write contention / polling interval choices need revisiting | Acceptable for MVP; note in open questions |
| "Resume" means re-invoking `claude --resume <session-id>` or equivalent CLI resume, not literally un-pausing a suspended process | If Claude Code has no resume primitive matching this, the control needs redefining | Confirm exact Claude Code resume mechanics in Phase 0 spike |
| Hook events are enough to infer session state (queued/running/waiting/review/done/failed) without parsing full transcripts | If hook coverage has gaps (e.g., no "waiting on approval" hook), some states must be inferred heuristically | Map explicitly in state machine section; log unknowns rather than guessing silently |

## Architecture options

**Option A — Single Node process, SQLite, WebSocket**
Express app hosts (1) an ingest endpoint for hook events, (2) a REST API for the frontend to read/act, (3) a WebSocket server to push live updates. SQLite via `better-sqlite3` is the only store. React/Vite SPA served by the same process or by Vite dev server in development.

**Option B — Same, but SSE instead of WebSocket (recommended)**
Identical to A except server→client push uses Server-Sent Events. Actions (approve/cancel/etc.) go over plain POST. Simpler (no WS handshake/reconnect logic to hand-roll — SSE reconnects natively), but one-directional; client actions already need a separate POST channel anyway, so this costs little and removes a dependency.

**Option C — Backend + broker (e.g., SQLite + a lightweight pub/sub like Redis, or a durable queue)**
Adds a message broker between ingest and the DB/UI fan-out, decoupling write-path from broadcast-path. Useful at higher event volume or multi-instance backends, but is an extra moving part with no MVP benefit for a single local developer.

### Comparison

| | A: Node+SQLite+WS | B: Node+SQLite+SSE | C: +Broker |
|---|---|---|---|
| Implementation speed | Fast | Fastest | Slower |
| Reliability | Good (single process, WS needs reconnect logic) | Good (SSE auto-reconnects) | Good but more failure surface |
| Observability | Straightforward — one process, one DB file to inspect | Same | Harder — state split across broker + DB |
| Real-time update complexity | Medium (bidirectional WS) | Low (SSE push + POST actions) | Medium-high |
| Electron compatibility later | High — backend is a standalone process either way | High | High but heavier to embed |
| Solo-builder friendliness | High | Highest | Low — unnecessary ops burden |

## Recommended architecture

**Option B: single Node/TypeScript process, SQLite as source of truth, SSE for server→client push, POST for client→server actions.** Rationale: the frontend only ever *reads* live state and *issues* discrete action commands (approve/retry/resume/cancel/guidance) — it never needs to push a continuous stream to the server, so full-duplex WebSocket buys nothing here but reconnect/heartbeat complexity. SSE is natively reconnecting, works over plain HTTP, and is trivial to consume from `EventSource` in the browser (and later, in an Electron renderer via the same mechanism). This keeps moving parts minimal: one process, one DB file, one push protocol, no broker.

Backend layout: `ingest` (hook→HTTP endpoint), `store` (SQLite access layer, the sole writer), `api` (REST for reads + actions), `stream` (SSE broadcaster fed by a store change-notification hook, e.g. an in-process EventEmitter fired right after each write). Frontend is a Vite+React SPA that hits `api` for initial state and subscribes to `stream` for deltas.

## Domain model

Session is the sole kanban card, including subagents. No Task, no separate Agent or Artifact table; Approval merged into Intervention.

| Entity | Key fields | Notes |
|---|---|---|
| **Session** | id, parent_session_id (nullable — set for subagents), owner (subagent_type from the hook payload, or a generic fallback for the main session / when unavailable), status, started_at, ended_at, cwd, model, recap (text, nullable) | One Claude Code invocation, main or subagent. `recap` is populated from the `Stop` hook payload's final message, verbatim, when status becomes `done`. |
| **Event** | id, session_id, ts, type (hook name), payload(json) | Append-only log; the source of truth for the timeline. Never mutated. |
| **Intervention** | id, session_id, type (approval_request/retry/resume/cancel/guidance), origin ('system'\|'human'), status (pending/applied/resolved), payload(json), created_at, resolved_at | Merged Approval+Intervention. System-originated rows (e.g. a `PreToolUse` block) are resolved by a human action; human-originated rows (retry/cancel/guidance) are applied by the session-side poller. Schema ships in v1; the endpoints/poller that act on it are v2. |

## State machine

**Session status**: `queued → running → waiting → (review | failed) → done`, with `waiting` re-entrant (a session can go running→waiting→running repeatedly, e.g. multiple approvals). `failed` and `done` are terminal; `review` transitions to `done` on explicit close or back to `running` if more work is dispatched. `review` is unreachable/unused in v1 pending confirmation of a hook signal for it (see Open questions) — everything running maps directly to `done` or `failed`.

| Transition | Trigger |
|---|---|
| queued → running | `SessionStart` hook received |
| running → waiting | `PermissionRequest` hook fires (confirmed in a follow-up spike — see `spike/findings.md` "Review-state signal"; supersedes the originally-assumed but never-observed `PreToolUse` trigger), or `Notification` with `notification_type: "idle_prompt"` (Claude caught up, awaiting input) |
| waiting → running | matching `intervention` row (origin=system, type=approval_request) resolved as approved (v2) |
| running → review | *(v1: unused — no confirmed hook signal yet)* |
| running → failed | `Stop`/error hook with non-zero/error payload, or ingest timeout (no event for N minutes while status=running) |
| running/review → done | `Stop` hook with success payload; `recap` set from its final-message field |
| failed → queued | `retry` intervention creates a new Session row, `parent_session_id` unset, same `owner` (v2) |

## Source of truth and sync

SQLite is the single source of truth for everything — no separate cache layer. The `Event` table is append-only and authoritative for history; `Session` status columns are denormalized/derived fields updated transactionally in the same write as the triggering event, so reads never need to recompute state from the full event log (though they *could*, as a consistency check). The frontend holds no independent state beyond what it fetched/streamed — a page refresh always re-syncs from `GET /api/state` with zero data loss, since SQLite already has everything.

## Real-time update design

Every write to `store` (event insert, status transition, intervention update) fires an in-process EventEmitter. The `stream` module subscribes and pushes a small delta payload (`{type, entityId, patch}`) to all connected SSE clients. Clients apply the patch to local state (a simple normalized store, e.g. a `Map` keyed by id) rather than refetching. On reconnect (native to `EventSource`), the client calls `GET /api/state?since=<lastEventId>` to fill any gap, then resumes streaming. No polling anywhere in the frontend; the *session-side* hook script is the only poller (against `GET /api/interventions/pending?session_id=`), on a short interval (e.g. 2s), since it has no push channel back into the running Claude Code process.

## Backend design

Minimal responsibilities, no more. v1 (read-only) endpoints only; v2 endpoints noted separately:
- `POST /ingest` — accepts one hook event, validates shape, writes `Event` row, updates `Session.status` (and `recap` on `Stop`), emits change.
- `GET /api/state` — full current board state (sessions + latest status) for initial load / reconnect gap-fill.
- `GET /api/sessions/:id` — session detail: events + recap.
- `GET /stream` — SSE endpoint, pushes deltas.
- *(v2)* `POST /api/sessions/:id/intervene` — body `{type, payload}`, writes an `intervention` row (status=pending).
- *(v2)* `GET /api/interventions/pending?session_id=` — polled by the session-side hook script; hook script marks `applied`/`resolved` via a small `PATCH`.
- `schema.sql` applied on startup with `CREATE TABLE IF NOT EXISTS` — no migrations directory, no ORM, until the schema stabilizes.

## Frontend design

Minimal responsibilities for v1:
- Board view: columns = Session status; every session (main or subagent) is a card, showing `owner` badge, elapsed time, last event summary, and — via `parent_session_id` — visual grouping under its parent.
- Detail drawer: opens on card click, shows session metadata + live timeline (events newest-first); shows `recap` prominently when status=done.
- One data layer: a small client (`useLiveState` hook or equivalent) that does initial fetch + SSE subscribe + local patch-apply; no separate state management library needed at this scope.
- No routing complexity needed beyond board vs. drawer-open (drawer can be a URL param for shareability, still MVP-simple).
- *(v2)* Intervention controls: buttons/inputs scoped to what's valid for current status.
- **Visual design**: run this through the `frontend-design` skill when Phase 1 UI work starts — palette/type/layout should be chosen against real card content (status, owner, recap), not decided in the abstract here.
- **Transport abstraction (VSCode-extension compatibility)**: React components must talk to a small `Transport` interface (`getState()`, `subscribe(onEvent)`, `postAction(...)`), never to `fetch`/`EventSource` directly. Web and Electron use the same `HttpSseTransport` implementation (direct HTTP/SSE to the backend). A VSCode extension shell cannot use this implementation as-is: a VSCode Webview panel is a sandboxed iframe that either can't reach `http://localhost:<port>` at all (remote/web VSCode) or can only do so under a CSP the extension must explicitly configure — the documented, portable pattern is instead for the Webview to talk only via `acquireVsCodeApi().postMessage`/`onDidReceiveMessage`, with the extension host (a plain Node process, same runtime our backend already targets) acting as the bridge that actually does the HTTP/SSE calls. So a future `PostMessageTransport` implementing the same interface — Webview UI ↔ postMessage ↔ extension host ↔ HTTP/SSE ↔ backend — swaps in without touching any component. No VSCode-specific code ships in v1; this only constrains where `fetch`/`EventSource` calls are allowed to live (`src/frontend/lib/transport/`, nowhere else).

## Repository structure

```
claudekanban/
  src/
    ingest/        # hook event intake + validation
    store/          # schema.sql, queries (sole writer)
    api/             # REST routes
    stream/         # SSE broadcaster
    domain/          # state machine logic, status derivation
    server.ts
    frontend/
      board/
      detail/
      lib/
        transport/     # Transport interface + HttpSseTransport (only place fetch/EventSource may appear)
        useLiveState.ts   # live-state client, consumes Transport
      main.tsx
  hooks/                 # scripts installed into Claude Code's hook config
    on-session-start.sh
    on-tool-use.sh
    on-stop.sh
    poll-interventions.sh   # v2
  docs/
    superpowers/specs/
  package.json          # single package, Vite dev server proxies /api to Express
```

## Phased plan

**Phase 0 — Validation spikes**
- Goals: de-risk the biggest unknowns — hook payload richness, subagent linkage/owner, resume mechanics.
- Deliverables: a throwaway script wiring `PostToolUse`/`Stop` hooks to POST to a local HTTP listener, logging the raw payload — including a run that spawns a subagent via the `Task` tool, to confirm whether `subagent_type` and parent linkage are exposed; a manual test of `claude --resume` behavior; a side-by-side check of the same events via the Claude Agent SDK's native hook callbacks (Python or TS), to decide whether to keep CLI hooks or switch ingestion to Agent-SDK-launched sessions.
- Likely files: `hooks/spike-*.sh`, a 20-line Express listener, a small Agent SDK spike script.
- Acceptance criteria: confirmed list of available hook events + payload fields; confirmed whether `subagent_type`/parent session id are present (via CLI hooks and via the Agent SDK); confirmed resume command/flow; confirmed whether `Stop` payload carries a usable final-message field for `recap`; explicit decision recorded on CLI-hooks vs. Agent-SDK ingestion.
- Manual test: run a real Claude Code session that spawns at least one subagent, with the spike hook installed, and inspect payloads for start/tool-use/stop on both.

**Phase 1 — Read-only live board**
- Goals: ingest → SQLite → board renders live. Sole entity is Session; subagents are their own cards with an owner badge.
- Deliverables: `schema.sql`, `POST /ingest`, `GET /api/state`, `/stream` SSE, board UI with status columns, owner badges, parent/child grouping. Run the board UI through the `frontend-design` skill before/while building it.
- Likely files: `src/ingest`, `src/store`, `src/stream`, `src/frontend/board`.
- Acceptance criteria: starting a real Claude Code session with hooks installed produces a card that moves queued→running→done live in the browser with no refresh; a spawned subagent appears as its own card with an owner badge and visible link to its parent.
- Manual test: run a session that spawns two subagents, confirm three independent live-updating cards.

**Phase 2 — Detail view, timeline, recap**
- Goals: click-through detail drawer with full event timeline; recap shown when done.
- Deliverables: `GET /api/sessions/:id`, drawer UI, `recap` column populated from `Stop` payload and rendered in the drawer (and/or on the card) once status=done.
- Likely files: `src/api`, `src/frontend/detail`.
- Acceptance criteria: opening a session shows every event in order with timestamps; new events append live while drawer is open; a done session shows its recap text without further clicks.
- Manual test: open drawer mid-session, watch events stream in; let it finish and confirm recap appears.

**Phase 3 (v2) — Intervention controls**
- Goals: DB-mediated approve/retry/resume/cancel/guidance loop closes end-to-end. Only start once Phase 0/1/2 are in real use and the polling-viability question has a real answer.
- Deliverables: `intervention` table, `POST /intervene`, `GET/PATCH /api/interventions/pending`, `hooks/poll-interventions.sh`, intervention buttons in UI.
- Likely files: `src/domain` (state transitions on intervention), `hooks/poll-interventions.sh`, `src/frontend/intervene`.
- Acceptance criteria: clicking "approve" in the UI unblocks a real waiting session within one poll interval; "cancel" stops a session; "retry" spawns a new session row.
- Manual test: trigger an approval-gated tool call, approve from the UI, confirm the session proceeds; kill a session via "cancel" and confirm status reflects it.

**Phase 4 — Hardening/refinement**
- Goals: handle the rough edges found in 0–3.
- Deliverables: stale/orphaned session detection (timeout → failed), reconnect gap-fill verified, basic error surfacing in UI for malformed hook payloads.
- Likely files: `src/domain` (timeout sweep), `src/frontend/board` (error/empty states).
- Acceptance criteria: killing a session process without a `Stop` hook eventually surfaces as `failed`, not stuck `running` forever.
- Manual test: `kill -9` a Claude Code process mid-session, confirm the board eventually reflects failure.

## Prioritized backlog (highest learning value first)

1. Phase 0 spikes (hook payload, subagent linkage/owner, resume mechanics) — resolves the unknowns everything else depends on.
2. `schema.sql` + ingest endpoint + status update on real events.
3. Board UI + SSE live update (first demoable milestone; apply `frontend-design` here).
4. Subagent cards + owner badge, validated against a real subagent-spawning session.
5. Recap on done.
6. Detail drawer / timeline.
7. *(v2, deferred)* Intervention endpoint + polling hook + UI controls.
8. Timeout/stale-session sweep.
9. Reconnect/gap-fill polish.

## Open questions

1. Exact set of Claude Code hook events and their payload fields — must be confirmed in Phase 0, not assumed.
   **Resolved (Phase 0):** see spike/findings.md — CLI hooks emit `SessionStart`, `PostToolUse`, and `Stop` (no `PreToolUse`/`SubagentStop`/`UserPromptSubmit` observed); field list captured per event.
2. Exact CLI/mechanism for "resume" (`claude --resume`? something else?) — confirm before designing the retry/resume intervention.
   **Phase 0 outcome (not resolved):** see spike/findings.md — not tested in this spike, still open; no resume data captured yet.
3. Whether distinct "Agent" identity within a session (beyond session id) is exposed at all by Claude Code, or whether Agent should just be collapsed into Session for MVP.
   **Resolved (Phase 0):** see spike/findings.md — a subagent spawn is exposed only as `subagent_type`/`tool_response.agentId` nested inside one `PostToolUse` event on the parent session, not as its own session-id stream; the spec's assumption of a subagent-owned hook stream conflicts with this and needs resolving before Phase 1.
4. What marks a session as needing "review" vs going straight to "done" — is there a hook signal for this, or does it need a heuristic/manual toggle?
   **Partially resolved (follow-up spike):** see spike/findings.md ("Review-state signal") — `PermissionRequest` is a confirmed, direct `running → waiting` signal (fires before the on-screen approval prompt, carries `tool_name`/`tool_input`), superseding the spec's originally-assumed but never-observed `PreToolUse` trigger. `Notification` with `notification_type: "idle_prompt"` is a second confirmed `waiting`-adjacent signal (Claude caught up, awaiting user input) — worth folding into Phase 1. A distinct `review` state (as opposed to `waiting`) still has no confirmed hook source and remains a heuristic/manual-toggle question.
5. Poll interval for `poll-interventions.sh` (tradeoff: responsiveness vs. overhead) — proposed 2s default, worth confirming acceptable.
6. Whether Task creation is manual (developer names a task, then attaches sessions) or auto-created per session with a title inferred from the first prompt — affects Phase 1/2 scope. (Note: superseded by dropping Task from v1 — retained here as a v2 consideration if Task ever comes back.)

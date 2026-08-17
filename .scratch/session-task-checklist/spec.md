Status: ready-for-agent

# Session task checklist (revived, retargeted at Task tools)

**History (2026-08-16):** originally speced against `TodoWrite`, spiked, and found to
have no available data source at all in this environment — see `spike/findings.md`,
"TodoWrite payload shape" (marked the spec `wontfix`, and a repointed feature,
`.scratch/session-current-activity/spec.md`, shipped a signal that's unconditionally
available instead). The user then pointed at
`https://code.claude.com/docs/en/agent-sdk/todo-tracking`, which explained the real
cause and was live-verified the same day (`spike/findings.md`, "TodoWrite payload
shape" — "Correction" and "Live re-verification with the opt-in set" entries): on
Sonnet 5 (and Opus 4.8/Fable 5/Mythos 5), task-tracking tools are off by default,
opt-in via `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`; once enabled, Claude Code uses
`TaskCreate`/`TaskUpdate` (delta-based) by default, not legacy `TodoWrite`
(full-snapshot). This spec revives the feature retargeted at the confirmed real
signal, explicitly as a **progressive enhancement layered on top of** the
current-activity indicator rather than a replacement for it — chosen over reverting to
plain `TodoWrite` targeting or dropping the feature entirely.

## Problem Statement

A viewer of the board — recruiter skimming a screenshot, or engineer watching a live
session — can see that a session or subagent is `running`, but for sessions that do
track structured task state, there's no way to see progress on that structured list
specifically (done/total, individual item text) — only the generic one-line "currently
doing X" that `.scratch/session-current-activity/spec.md` already covers for every
session regardless of whether it uses task tools.

## Solution

Introduce a new `Task` entity, populated from `TaskCreate`/`TaskUpdate` tool-call
payloads that already arrive via the existing `PostToolUse` hook (no new hook required,
same as the current-activity indicator). Each session or subagent that has emitted
`TaskCreate`/`TaskUpdate` calls gets a compact progress fraction (e.g. "3/5 tasks") on
its board card, shown **alongside** (not instead of) the current-activity line, and the
full checklist — with each item's text and status — visible in the Drawer. This is
explicitly conditional: most real developer sessions won't have
`CLAUDE_CODE_ENABLE_TODO_TOOLS=1` set, so most cards will never show a fraction, and
that's the expected, correct behavior, not a bug — the current-activity line remains
every session's baseline signal regardless of whether this richer one is present.

## User Stories

1. As a recruiter skimming a screenshot of the board, I want to see a task-progress
   fraction on sessions that have one, so that the tool visibly demonstrates observing
   structured, multi-step agent work when the data is available.
2. As an engineer watching a live session with task tools enabled, I want to see a
   task-progress fraction on the card, so that I can tell how far along a long-running
   session is without opening the Drawer.
3. As an engineer, I want the fraction to update in real time as `TaskUpdate` calls
   change item statuses, so that the board reflects genuine live progress.
4. As an engineer who opens the Drawer for a session with task data, I want to see the
   full checklist (`subject`/`description`/`activeForm`/status per item), so that I can
   understand exactly what the session is doing without reading the raw event timeline.
5. As an engineer, I want the task list to be built by **accumulating** `TaskCreate`
   calls (one new item each) and **patching** existing items by `taskId` on
   `TaskUpdate` calls, not by replacing the whole list on each call, matching the
   confirmed-live delta model (`spike/findings.md`: 3× `TaskCreate` followed by 6×
   `TaskUpdate` for a 3-item list, not a repeated full list).
6. As an engineer, I want subagent (child) cards to show the same fraction as top-level
   session cards when the subagent has its own task-tool calls, so that nested subagent
   progress is visible with the same affordance as the parent, consistent with how
   failure-reason hints already apply uniformly to both (`fail_reason` on `Session`).
7. As an engineer, I want a session or subagent card with no `TaskCreate`/`TaskUpdate`
   calls at all — the common case, since the tools are opt-in and off by default — to
   render exactly as it does today plus its current-activity line, with no fraction and
   no empty progress bar, so the feature is purely additive.
8. As an engineer, I want the task-progress computation (`done`/`total` from a task
   list) to be a pure, directly-unit-tested function, so its correctness doesn't depend
   on the database or a rendered component.
9. As an engineer extending `taskSynthesis.ts` later, I want it to follow the same
   shape as `subagentSynthesis.ts` (pure functions, no I/O, payload-in/entity-out), so
   the module is consistent with the codebase's existing domain-synthesis pattern.
10. As an engineer, I want a `TaskUpdate` referencing a `taskId` that was never created
    (e.g. the ingest arrived out of order, or task creation predates this feature's
    deployment) to be handled without throwing, so a single out-of-order event can't
    crash ingestion — treat it as a no-op or create a placeholder item, a call left to
    implementation but which must not throw either way.
11. As an engineer, I want the Drawer's checklist to sit alongside, not replace, the
    existing raw event timeline, so the task view is a summary layer on top of the
    existing detail, not a competing source of truth.
12. As an engineer, I want a `TaskCreate`/`TaskUpdate` payload with a missing or
    malformed required field (e.g. no `subject`, no `taskId`) to be skipped rather than
    corrupting the stored task list, matching the defensive-parsing precedent already
    used for `TodoWrite`/`SubagentStop` payloads elsewhere in this project's domain
    layer.

## Implementation Decisions

- **No further spike prerequisite** — the payload shapes for both `TaskCreate` and
  `TaskUpdate` are confirmed live (`spike/findings.md`), including the delta model.
  Field-name defensiveness note from the docs, worth carrying into the parser: the
  *streamed* `tool_use` input is the raw model-emitted shape, and Claude Code repairs
  some near-miss key names (`id`/`task_id` → `taskId`, `active_form` → `activeForm`)
  before execution — but that repair isn't reflected in the hook payload stream itself.
  Read `TaskUpdate` fields defensively (`taskId ?? id ?? task_id`), not assuming the
  canonical name is always present, per the docs' own guidance for SDK consumers of
  this exact data.

- **New domain module `src/domain/taskSynthesis.ts`**, mirroring
  `src/domain/subagentSynthesis.ts`'s shape: pure functions, no I/O. Two entry points,
  not one, matching the two-call-type delta model:
  - `synthesizeTaskCreate(payload: PostToolUsePayload): Task | null` — returns `null`
    when `tool_name !== "TaskCreate"` or required fields are missing; otherwise a new
    `Task` in `pending` status (`TaskCreate` payloads don't carry a status field per the
    confirmed capture — new items start `pending`).
  - `applyTaskUpdate(existing: Task[], payload: PostToolUsePayload): Task[]` — returns
    `existing` unchanged (no-op) when `tool_name !== "TaskUpdate"`, the referenced
    `taskId` (read defensively per above) isn't found, or `status` is missing;
    otherwise returns a new array with that one item's `status` patched.

- **`Task` shape**: `{ sessionId: string; taskId: string; subject: string; description:
  string | null; activeForm: string | null; status: "pending" | "in_progress" |
  "completed"; createdAt: string }` — `taskId` is the external identifier from
  `TaskCreate`/`TaskUpdate` payloads (confirmed observed as a simple sequential string
  scoped to the session, per the live capture), used as the patch key; `createdAt`
  (the ingest-assigned timestamp of the `TaskCreate` call) doubles as the ordering key
  for rendering, since `taskId` isn't guaranteed numerically sortable across every
  session in general even though it was in the observed capture.

- **New `task` table** in `src/store/schema.sql`, following the existing `session`/
  `intervention` table conventions, with `(session_id, task_id)` as a natural composite
  key (or a synthetic autoincrement PK plus a unique constraint on the pair) — inserted
  on `TaskCreate`, updated in place on `TaskUpdate`, never wholesale-replaced (this is
  the one design point that inverts from the original `TodoWrite`-targeted spec, per
  the confirmed delta model).

- **New `src/store/taskStore.ts`**, thin row-mapping module mirroring
  `sessionStore.ts`'s pattern: e.g. `insertTask(db, task)`,
  `updateTaskStatus(db, sessionId, taskId, status)`, `listTasksForSession(db,
  sessionId)`. Not a unit-test seam, consistent with `sessionStore.ts` today —
  correctness lives in `taskSynthesis.ts` above it.

- **Ingest wiring in `src/ingest/ingest.ts`**: extend the existing
  `payload.hook_event_name === "PostToolUse"` branch with checks for `tool_name ===
  "TaskCreate"` (call `synthesizeTaskCreate` + `insertTask`) and `tool_name ===
  "TaskUpdate"` (fetch the session's current tasks, call `applyTaskUpdate`, persist the
  one changed row). Applies uniformly to top-level sessions and subagents, matching the
  existing `agentId`-agnostic dispatch pattern already used for the current-activity
  indicator and `mergeSubagentTitle`.

- **New pure function `src/frontend/board/taskProgress.ts`**:
  `computeTaskProgress(tasks: TaskDto[]): { done: number; total: number } | null` —
  returns `null` for an empty/absent task list (per User Story 7), otherwise counts
  `status === "completed"` against total length. (Unchanged from the original spec's
  design for this function — the delta-vs-snapshot distinction only affects how the
  list is built, not how progress is computed from it.)

- **Transport/API changes**: same shape as the original spec — precompute
  `taskProgress: { done: number; total: number } | null` server-side into `SessionDto`
  for the board's `/api/state` response (cheap aggregate query per session), and add a
  `tasks: TaskDto[]` field to `SessionDetailResponse` for the Drawer's full checklist,
  fetched via `listTasksForSession`.

- **`SessionCard.tsx` rendering**: a new small line, positioned near (not replacing)
  the current-activity line from `.scratch/session-current-activity/spec.md` — e.g.
  activity line above, task fraction below, both muted/monospace, both conditionally
  rendered independently (`session.status === "running" && session.lastActivitySummary`
  for one, `session.taskProgress !== null` for the other; the fraction is shown
  regardless of running/done/failed status, since "3/5 tasks" remains meaningful
  context after a session finishes, unlike the transient activity line). Applies to
  both top-level and `.child-meta` subagent cards.

- **`Drawer.tsx` rendering**: a new checklist block, positioned alongside the existing
  timeline — exact placement left to implementation, same as the original spec.

## Testing Decisions

- Only test external behavior, not implementation details — matches
  `subagentSynthesis.test.ts`/`groupSessions.test.ts` style.
- **`taskSynthesis.ts`** is the primary tested module. Cases for
  `synthesizeTaskCreate`: valid payload → `Task` with `status: "pending"`; missing
  `subject` → `null`; wrong `tool_name` → `null`. Cases for `applyTaskUpdate`: valid
  `taskId` + `status` → patched array, other items unchanged; unknown `taskId` → input
  array returned unchanged (no throw, per User Story 10); missing `status` → unchanged;
  `taskId` read from each of `taskId`/`id`/`task_id` fallback fields (per the docs'
  defensive-parsing note above) → all three resolve to the same patch.
- **`taskProgress.ts`** — unchanged from the original spec's test plan: empty list →
  `null`; all-pending → `{done: 0, total: N}`; all-completed → `{done: N, total: N}`;
  mixed → correct partial count.
- `taskStore.ts` and the `ingest.ts` wiring are plumbing, untested at the unit level,
  consistent with `sessionStore.ts`/`ingest.ts` today — covered by the hook smoke test
  and manual verification against `spike/captures/todowrite-optin.jsonl`.
- No new component-level tests specified, consistent with this project's existing
  balance of pure-function tests over component tests for additive, conditionally
  rendered UI.

## Out of Scope

- Any UI for the fields `TaskUpdate` also supports but this spec doesn't surface:
  `addBlocks`/`addBlockedBy` (task dependency graph), `owner`, `metadata` — the docs
  show these exist but this spec only tracks `status` changes, matching the original
  scope's intent (progress fraction + checklist, not a dependency graph).
- Any UI beyond a fraction on the card and a full checklist in the Drawer — no
  drag-and-drop editing, no manual task creation/completion from the board.
- Any attempt to detect or migrate legacy `TodoWrite` payloads — out of scope for this
  spec; if a session somehow still emits `TodoWrite` (e.g. `CLAUDE_CODE_ENABLE_TASKS=0`
  set alongside the opt-in, per the docs), those payloads are simply not ingested by
  this feature. Revisit only if real-world usage shows this matters.
- Documenting or prompting users to set `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` — this spec
  only ingests the data if a session happens to produce it; whether/how to advertise
  the opt-in to claudekanban's own users is a separate documentation/presentation
  concern, not part of this implementation.
- The `waiting`/`review` kanban columns, the `intervention` table's endpoints/poller,
  and any other `docs/roadmap.md` items — separate, already-sequenced backlog entries.
- Cross-session task aggregation, historical task state — same as the original spec's
  scope boundary, unchanged by the retargeting.

## Further Notes

- This spec depends on nothing from `.scratch/session-current-activity/spec.md` at the
  implementation level (independent ingest branches, independent DB columns/tables) —
  the "layered on top of" framing is about the **UI relationship** (both render on the
  same card, activity line as the unconditional baseline, this fraction as the
  conditional enhancement), not a build-order dependency. Either can be implemented
  first.
- The `intervention` table (`src/store/schema.sql`) already establishes a precedent in
  this codebase for shipping a table ahead of the endpoints that act on it — the new
  `task` table's migration should follow that same commented-precedent pattern if any
  part of this feature ships in phases.
- `Task.status` deliberately mirrors the Task tools' own vocabulary (`pending` /
  `in_progress` / `completed`) rather than being coerced into the board's existing
  `SessionStatus` vocabulary — different state machines for different entities, per the
  domain-modeling reasoning that led to rejecting "task as session replacement" in
  `docs/research/2026-08-13-claude-code-kanban-comparison.md`.
- Live evidence for every payload shape decision above lives in
  `spike/captures/todowrite-optin.jsonl` and is summarized in `spike/findings.md`'s
  "TodoWrite payload shape" section (despite the file name, that capture is the
  Task-tools-opt-in one, not a `TodoWrite` capture — `TodoWrite` itself was never
  observed to fire in any test run this project performed).

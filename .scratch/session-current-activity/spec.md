Status: done

# Session current-activity indicator

**Shipped 2026-08-16** via `docs/superpowers/plans/2026-08-16-session-current-activity.md`,
executed with `superpowers:subagent-driven-development` — 3 tasks, 1 mid-task fix round,
1 final-review fix wave (2 Important findings: `SubagentStart`/`SubagentStop` needed real
summaries instead of leaking raw event names, and the card's render gate needed to include
`waiting` status, not just `running`, to actually surface the summaries spec story 9 wanted).
Merged to `main` at commit `c6529db`. See `spike/findings.md` for the review history if
needed; the plan's SDD workspace/ledger was deleted per the skill's cleanup step once the
final review was clean.

Source: repoints `docs/roadmap.md` item 2 ("Task entity") after
`.scratch/session-task-checklist/spec.md`'s spike prerequisite came back negative — see
`spike/findings.md`, "TodoWrite payload shape" section: no `TodoWrite` tool exists in
this account's Claude Code, confirmed across two CLI versions and both headless/
interactive mode. This spec keeps the original problem (a board viewer can't tell *what*
a running session is doing) but sources it from a signal that's confirmed to already
exist: the `PostToolUse` event stream claudekanban already ingests for every tool call.

## Problem Statement

A viewer of the board — recruiter skimming a screenshot, or engineer watching a live
session — can see that a session or subagent is `running`, but not *what it's currently
doing*. The board's only per-card state today is a status word; the actual tool-call
activity only becomes visible by opening the Drawer and reading the raw timeline. There's
no answer on the board today to "what is this session doing right now."

## Solution

Store a short, human-readable summary of the **most recent event** on each `Session` row
— e.g. "Called Read", "Spawned Explore subagent", "Requested permission: rm nimrod.txt",
"Waiting for input" — updated every time a new hook event arrives for that session, using
the same summarization rules the Drawer's timeline already applies
(`src/frontend/detail/eventSummary.ts`'s `summarize()`). Surface it as a single line on
the card face, visible only while the session is `running`, so it reads as "currently:
<activity>" rather than a permanent label.

## User Stories

1. As a recruiter skimming a screenshot of the board, I want to see a short line of what
   a running session is actually doing, so that the tool reads as observing real work in
   progress, not just a static status label.
2. As an engineer watching a live session on the board, I want the activity line to
   update in real time as the session calls new tools, so that the card reflects genuine
   live progress, not a stale snapshot.
3. As an engineer, I want the activity summary to use the same phrasing the Drawer's
   timeline already uses for the same event ("Called Read", "Spawned Explore subagent",
   etc.), so that the board and the Drawer speak one consistent vocabulary instead of two
   different summarization rules that could drift apart.
4. As an engineer, I want subagent (child) cards to show their own activity line, not
   just the parent's, so that a nested subagent's current work is visible with the same
   affordance as the parent — consistent with how failure-reason hints already apply
   uniformly to both (`fail_reason` on `Session`, `SessionCard.tsx` lines 36-38 and
   64-66).
5. As an engineer, I want the activity line to disappear once a session reaches `done`
   or `failed`, so that a finished card doesn't show a stale "Called Bash" line
   competing for attention with the more meaningful `recap`/`failReason` text — mirroring
   how `fail_reason` is itself only rendered `session.status === "failed"`.
6. As an engineer, I want a session that hasn't had any event besides `SessionStart` yet
   (still `queued`, or just started) to render with no activity line rather than a blank
   or misleading one, so the feature is purely additive to the running state.
7. As an engineer reading the codebase, I want the summarization logic
   (`eventSummary.ts`'s `summarize()`) to have exactly one implementation shared by both
   the Drawer's timeline and this new per-session stored summary, not two copies that can
   silently diverge, so that a future new hook-event type only needs its summary phrasing
   written once.
8. As an engineer, I want this feature to require no new hook wiring beyond what
   claudekanban already installs (`PostToolUse` with matcher `"*"`, per
   `scripts/install-hooks-lib.ts` line 31, already reaching every tool call today), so
   that it ships without asking existing users to reinstall or reconfigure hooks.
9. As an engineer, I want the stored activity summary to update on every relevant hook
   event type the timeline already summarizes (`PostToolUse`, `PermissionRequest`,
   `Notification`, not just `PostToolUse`), so that "waiting for input" or "requested
   permission" states are visible on the card, not just tool calls — richer than a
   tool-call-only signal would be.

## Implementation Decisions

- **Extract the shared summarization module.** Move `summarize()`, `ToolCallPayload`,
  and the small per-event-type switch logic currently in
  `src/frontend/detail/eventSummary.ts` (lines 15-48) into a new pure domain module,
  e.g. `src/domain/activitySummary.ts` — no I/O, one `(type: string, payload:
  ToolCallPayload) => string` function in, string out. `eventSummary.ts`'s
  `buildTimeline` imports and calls it exactly as before (behavior-preserving move, not a
  rewrite); the new backend ingest path (below) imports the same function. This is the
  single seam this feature adds new logic to — everything else is composition around it.

- **New `Session` field**: `lastActivitySummary: string | null`, alongside the existing
  `recap`/`failReason` fields (`src/domain/types.ts`'s `SessionShape`, mirrring the
  existing precedent of `recap` being populated from `Stop.last_assistant_message` at
  ingest time). New `session.last_activity_summary` `TEXT` column, added via the existing
  migration-guard pattern in `src/store/db.ts`'s `migrateSessionColumns` (same shape as
  the existing `last_activity_at`/`fail_reason` guards, `db.ts` lines 20-25).

- **Ingest wiring (`src/ingest/ingest.ts`)**: on every incoming hook payload (not just
  `PostToolUse`), call the shared `activitySummary` function with `payload.hook_event_name`
  and the payload itself, and set `updatedSession.lastActivitySummary` to the result —
  same place `recap` is already conditionally set today (`ingest.ts` line 40). Applies
  uniformly to both top-level sessions and subagent rows, since `ingest.ts` already keys
  everything off `payload.session_id`/`agentId` without special-casing which is which
  (per User Story 4) — subagent rows get updated the same way via the existing
  `mergeSubagentTitle`/`synthesizeSubagentStart` call sites, extended to also set
  `lastActivitySummary`.

- **No new table, no new hook, no schema beyond one column.** Unlike the superseded
  Task-checklist design, this reuses data already flowing through the existing `event`
  table and `PostToolUse`/`PermissionRequest`/`Notification` hooks claudekanban's
  installer already wires (`scripts/install-hooks-lib.ts` lines 31-36) — no spike
  prerequisite, no new ingestion dependency.

- **`SessionCard.tsx` rendering**: a new line, e.g. `<div className="card-activity">
  {session.lastActivitySummary}</div>`, rendered only when `session.status === "running"
  && session.lastActivitySummary` — mirrors the existing conditional-render pattern used
  for `card-fail-reason` (`SessionCard.tsx` lines 36-38), applied to both the top-level
  card and the `.child-meta` block for subagent cards (lines 64-66 today only handle
  `failReason`; extend the same conditional alongside it). Styling follows the existing
  restrained, monospace, muted-tone approach already used for `card-fail-reason` — not a
  new visual language.

- **Drawer**: no change required — the timeline already shows this information in full,
  richer detail; the card-level summary is a condensed pointer at the same underlying
  data, not a new view.

## Testing Decisions

- Only test external behavior (event type + payload → summary string), not
  implementation details — matches this project's existing testing style.
- **`activitySummary.ts`** (the extracted shared module) is the primary tested module.
  Prior art: the existing (currently untested at the unit level, since it lives in a
  frontend file exercised only via component behavior) `summarize()` logic — extracting
  it is itself an improvement, since it becomes directly unit-testable the way
  `subagentSynthesis.ts` and `groupSessions.ts` already are. Cases to cover: every event
  type the current `summarize()` switch handles (`SessionStart`, `PostToolUse` for a
  plain tool, `PostToolUse` for `Agent`/`Task` subagent spawn, `PermissionRequest` with
  and without a `tool_input.description`, `Notification` with `idle_prompt` and other
  types, `Stop`, and the `default` fallback for an unrecognized event type).
- `eventSummary.ts`'s existing `buildTimeline` tests (if any exist today — verify) must
  continue passing unchanged after the extraction, since `summarize()`'s behavior is not
  supposed to change, only its location.
- `ingest.ts`'s new per-event `lastActivitySummary` update and `sessionStore.ts`'s new
  column plumbing are untested at the unit level, consistent with how `recap`/
  `fail_reason` ingestion is untested today — covered by the existing hook smoke test
  (`hooks/hooks.test.sh`) and manual verification.
- No new component-level (React Testing Library) tests specified for `SessionCard.tsx`,
  consistent with how the `fail_reason` hint work was tested primarily at the domain
  level.

## Out of Scope

- Any richer "current activity" affordance beyond a single text line — no icons, no
  activity history/log on the card face (that's what the Drawer's timeline is for).
- Retroactively backfilling `lastActivitySummary` for existing `session` rows written
  before this migration — `NULL` until the next event arrives for that session, same as
  how `fail_reason` behaves for pre-existing rows today.
- Any change to the Drawer's timeline UI or its existing icon/collapsing behavior — this
  spec only extracts `summarize()`'s logic into a shared location, it does not change
  what the Drawer renders or how.
- The other `docs/roadmap.md` items (main-session title resolution, VSCode demo shell,
  deferred v2 spec items, remaining CCK-comparison ideas, presentation track) — separate,
  already-sequenced backlog entries.

## Further Notes

- This spec exists specifically because `.scratch/session-task-checklist/spec.md`'s
  original premise (a `TodoWrite`-sourced checklist) turned out to have no real data
  source in this environment by default — see `spike/findings.md` for the
  investigation. That spec has since been revived, retargeted at the confirmed-real
  `TaskCreate`/`TaskUpdate` opt-in tools, as a progressive enhancement layered on top of
  this one: this activity line is every session's unconditional baseline; the revived
  spec's task-progress fraction is an additional, conditional signal shown alongside it
  only for the minority of sessions that happen to have task-tool data. Build order
  between the two is independent — see that spec's "Further Notes".
- Because this design reuses the existing `event` table's already-ingested payloads
  rather than requiring a new tool to exist, it has no analogous "spike prerequisite" —
  the signal it depends on is already confirmed live and flowing, per every hook capture
  in `spike/findings.md` prior to this entry.

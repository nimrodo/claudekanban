# Roadmap

Captured from a grilling session on 2026-08-16. Framing and priority calls below are
this session's conclusions, not derived from code — see git history for that context if
this doc goes stale.

## Framing

claudekanban's primary purpose is a **GitHub portfolio piece**, read mainly by **tech
recruiters** skimming for ~30 seconds (README, screenshots/GIF, maybe a live demo), and
secondarily by **engineers** who read code and architecture in depth. There's no time
pressure and nothing is being cut — this doc orders *everything* currently considered,
it doesn't scope anything out.

Two tracks are kept deliberately separate: **Product Features** (the app itself) and
**Presentation** (how the finished work is shown off). They're different kinds of work
and conflating them would muddy this doc as a legible artifact in its own right.

Ordering principle: **dependency + narrative flow**, not raw effort or raw impact —
cheap visible correctness first, then the new domain entity it sets a precedent for,
then the architecturally interesting demo, then the rest of the deferred/borrowed
ideas, with Presentation last since it documents features that need to exist first.

## Explicitly out of scope

Carried over from `docs/research/2026-08-13-claude-code-kanban-comparison.md` and
reaffirmed this session — reasoning holds regardless of audience:

- A multi-theme picker (CCK ships ~19 editor themes) — dilutes claudekanban's
  deliberately single, semantically-tuned dark "graphite console" palette.
- Chokidar/filesystem-watching ingestion in place of the hook-push model — would
  contradict the project's own spike-first "Decision: Keep CLI hooks"
  (`spike/findings.md`).
- Task-as-**replacement**-for-session modeling — rejected specifically as a
  replacement; see item 2 below for the entity actually planned instead.
- A zero-build vanilla-JS regression — would downgrade the existing
  TypeScript/React/Vite pipeline for no benefit.
- Hooks used as a write-only, file-watched-indirection channel — adds a filesystem
  round-trip claudekanban's synchronous HTTP ingest doesn't need.

## Product Features (in order)

### 1. Main-session title resolution

**Why first:** cheap, and visible on *every* top-level session card today — currently
falls back to raw `cwd` basename, which reads as unfinished in a screenshot. The
unresolved gap is documented in
`docs/superpowers/specs/2026-08-07-operations-console-design.md` (no `UserPromptSubmit`
hook observed in this Claude Code version).

**Work:** re-spike whether `UserPromptSubmit` fires in the currently installed Claude
Code version (per this project's spike-first discipline — verify live, don't trust the
prior finding as permanent); if still absent, fall back to parsing the session
transcript file for the first user message.

**Effort:** low–medium (spike + one ingestion change).

### 2a. Session current-activity indicator (repointed from "Task entity")

**Status update (2026-08-16):** the originally planned `TodoWrite`-sourced task
checklist was spiked and initially looked dead — no `TodoWrite` tool call ever fired,
across two CLI versions and both headless/interactive mode (see `spike/findings.md`,
"TodoWrite payload shape"). Repointed at a signal that's unconditionally live: the
`PostToolUse`/`PermissionRequest`/`Notification` event stream claudekanban already
ingests. See `.scratch/session-current-activity/spec.md` for the full spec. (The
follow-up correction below, item 2b, later found the original premise wasn't entirely
wrong — this item stands on its own regardless, as every session's unconditional
baseline signal.)

**Model:** a short human-readable summary of each session's most recent event (e.g.
"Called Read", "Spawned Explore subagent", "Waiting for input"), stored on the `Session`
row and updated on every incoming hook event, reusing the same summarization logic the
Drawer's timeline already applies (`eventSummary.ts`'s `summarize()`, extracted into a
shared, directly-testable domain module as part of this work). Applies uniformly to
top-level session cards and subagent (child) cards.

**UI:** a single line on the card face, e.g. "Called Read", shown only while
`status === "running"`; no change to the Drawer, which already shows this in full via
the timeline.

**Work:** extract `summarize()` into `src/domain/activitySummary.ts`, add one new
`Session` column + migration guard, wire ingest to update it on every event, card
rendering. No new hook, no new table, no spike prerequisite — the data source is already
confirmed flowing.

**Effort:** low–medium.

### 2b. Session task checklist (revived, retargeted at Task tools)

**Status update, same day:** the user pointed at
`https://code.claude.com/docs/en/agent-sdk/todo-tracking`, which explained the real
cause of item 2a's original dead end: on Sonnet 5 (and Opus 4.8/Fable 5/Mythos 5),
task-tracking tools are off by default, opt-in via `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`;
once enabled, Claude Code defaults to `TaskCreate`/`TaskUpdate` (delta-based), not
legacy `TodoWrite` (full-snapshot) — live-verified in `spike/findings.md`. The
checklist feature is revived, retargeted at the confirmed real payloads, as a
**progressive enhancement layered on top of item 2a**: most real sessions won't have
the opt-in set, so most cards will only ever show 2a's activity line; sessions that do
will additionally show a task-progress fraction. See
`.scratch/session-task-checklist/spec.md` for the full spec.

**Model:** a new `Task` entity, accumulated from `TaskCreate` (new item, `pending`) and
patched by `TaskUpdate` (status change, keyed by `taskId`) — a delta model, not a
snapshot-replace, per the confirmed live capture.

**UI:** a compact fraction ("3/5 tasks") on the card, alongside (not replacing) item
2a's activity line; full checklist in the Drawer.

**Work:** new `task` table + migration, `taskSynthesis.ts` (two pure functions:
create + patch), ingest wiring for both `TaskCreate`/`TaskUpdate`, `taskProgress.ts`,
card + Drawer UI. No further spike prerequisite — payload shapes are confirmed.

**Effort:** medium. Independent of item 2a at the implementation level (separate
ingest branches, separate schema) — either can be built first.

### 3. VSCode demo shell

**Why here:** the architecturally interesting piece — proves out the `Transport`
interface design (`getState`/`subscribe`/`postAction`) already built into the spec for
exactly this purpose (`docs/superpowers/specs/2026-08-07-operations-console-design.md`).
Sequenced after items 2a/2b so the demo has something more interesting to show than
plain session/subagent cards.

**Scope, deliberately minimal:** a bare VS Code webview that renders the existing board
via a new `PostMessageTransport`, not a marketplace-installable extension — no packaging,
publishing, or extension-marketplace polish. The point is demonstrating the seam works,
not shipping a real VS Code product.

**Effort:** medium.

### 4a. Waiting → Review escalation (decided)

**Decided 2026-08-16**, via a grilling session — see
`docs/adr/0001-monitoring-only-no-intervention.md` for the companion decision this was
grilled alongside. Stays fully observational: `review` surfaces state, it never acts on
anything.

**Model:** a session that's been `waiting` for more than 5 minutes escalates to
`review`. Purely time-derived — no hook signal distinguishes a `review`-worthy wait from
any other (per `spike/findings.md`). Implemented as a new periodic sweep, following the
same shape as the existing stale-sweep mechanism (`src/sweep/staleSweeper.ts`) rather
than living in `deriveStatus` (`src/domain/stateMachine.ts`), since it isn't triggered
by any single event. Needs a new `waiting_since` timestamp, set only on the transition
into `waiting` — reusing `last_activity_at` would be wrong, since that updates on every
event regardless of status. Only ever applies to top-level sessions; subagents never
reach `waiting` in the current status-derivation logic.

**UI:** a new, sixth board column (`queued`/`running`/`waiting`/`review`/`done`/
`failed`), matching the original design spec's intent — not a highlight within the
existing `waiting` column.

**Work:** the new sweep + `waiting_since` field/migration, one new board column.

**Effort:** medium.

### 4b. Intervention (decided: not pursued in the web app)

**Decided 2026-08-16** — see `docs/adr/0001-monitoring-only-no-intervention.md` for the
full reasoning. The web app stays monitoring-only: no `POST /intervene` endpoint, no
session-side polling hook, no UI controls that act on a running session. The unused
`intervention` table in `src/store/schema.sql` stays in place as deferred scaffolding
(see item 5 below), not something to clean up now.

### 5. VSCode-hosted intervention (future, gated on item 3)

**New item, 2026-08-16.** Explicitly separate from item 3 (the VSCode demo shell, which
stays scoped to just proving the `Transport` seam) — this depends on a *real*,
non-demo VSCode extension existing first.

**Why this is different from 4b:** `vscode.Terminal` exposes `.processId` directly (a
real PID, no `ps`/`lsof` guessing) and `Terminal.sendText(text)` can inject text into
any terminal the extension holds a reference to. For sessions running in a
VSCode-managed terminal, this makes two of the five intervention types the
`intervention.type` column already anticipates into reliable, real capabilities:

- **`cancel`** — stop a running session, via the terminal's real PID.
- **`guidance`** — inject a message into a running session, via `Terminal.sendText`.

The other three types (`approval_request`, `retry`, `resume`) stay out of scope
indefinitely — none of them get meaningfully more buildable in a VSCode host; their
blockers (whether `PermissionRequest` hooks actually block waiting for an answer,
whether `claude --resume` even works) are Claude Code CLI properties, not hosting
properties, and remain unconfirmed per `spike/findings.md`.

**Work:** not yet spec'd — gated on item 3 shipping first.

**Effort:** large (real terminal integration, well beyond the demo shell).

### 6. Remaining CCK-comparison ideas (opportunistic backlog)

From `docs/research/2026-08-13-claude-code-kanban-comparison.md`, roughly in that doc's
own priority order, minus what's already promoted above:

- **Teammate/idle re-spawn handling** — deprioritized behind everything above: it
  addresses a *speculative* gap (`spike/findings.md` filters background-job
  `SubagentStop` with empty `agent_type` as a no-op today; no proven visible bug exists
  yet). Needs its own live spike against team-session behavior before any schema change.
- **Active-session staleness heuristic refinement** — CCK's multi-signal, multi-timeout
  approach vs. claudekanban's current single `last_activity_at` timeout rule in
  `staleSweep.ts`.
- **Cost/token/tool-impact stats** — schema has no columns for this yet; hook payloads
  already carry some of it (`tool_response.totalTokens`, `.usage`, per
  `spike/findings.md`). Surface as a stat block in the Drawer, not the card face.
- **Storage/disk-usage inspector** — adapted as a "SQLite DB size / event-table growth"
  view (claudekanban owns its own DB, unlike CCK's filesystem-derived model), reusing
  the Drawer's slide-over pattern rather than a new modal system.
- **UI density polish**, bundled since each is small/independent:
  - Column count badges + a global ambient status strip ("N running / N failed").
  - Timeline event-type icons + repeat-call (`×N`) collapsing in the Drawer.
  - Card-level micro-progress for parent sessions with subagents (e.g. "3 subagents ·
    2 done").
  - A light-mode variant of the existing graphite palette (accessibility /
    screen-sharing use, not a personal-preference theme gallery — see rejected list).
- **`?` keyboard-shortcut reference overlay** — frontend-only, no backend change.

**Effort:** low–medium each; no dependencies between them.

## Presentation (last, documents the finished product)

Net-new for this backlog — not from either source doc, proposed for the recruiter-facing
track:

- **README rewrite**: lead with what the tool does and why the architecture is
  interesting (spike-first methodology, push-based hook ingestion vs. filesystem
  watching, the Transport seam), not just install instructions.
- **Screenshots / GIF**: the board mid-run (running-glow animation, subagent tree
  nesting) and the Drawer detail view — claudekanban's two most visually distinctive,
  already-built UI ideas.
- **Hosted live demo**: feasibility TBD — would need seeded/synthetic session data
  rather than real hook traffic, since there's no production usage to point at.
- **CI status badge** — if/once a CI workflow exists; ties visibly to the existing
  TDD/spike-first discipline for the engineer-reader audience.

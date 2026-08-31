# Roadmap

Captured from a grilling session on 2026-08-16, then re-derived on 2026-08-31. Framing
and priority calls below are those sessions' conclusions, not derived from code — see git
history for that context if this doc goes stale.

**The live ranking is [Re-derivation — 2026-08-31](#re-derivation--2026-08-31).** The
`## Product Features` / `## Presentation` sections below it are kept as the original
2026-08-16 record (with per-item status banners); where they disagree with the
re-derivation, the re-derivation wins.

## Framing

claudekanban's primary purpose is a **GitHub portfolio piece**, read mainly by **tech
recruiters** skimming for ~30 seconds (README, screenshots/GIF, maybe a live demo), and
secondarily by **engineers** who read code and architecture in depth. There's no time
pressure and nothing is being cut — this doc orders *everything* currently considered,
it doesn't scope anything out. _(The "nothing is cut" stance was revisited on
2026-08-31; two items were ruled out of scope — see the Re-derivation section.)_

Two tracks are kept deliberately separate: **Product Features** (the app itself) and
**Presentation** (how the finished work is shown off). They're different kinds of work
and conflating them would muddy this doc as a legible artifact in its own right.

Ordering principle: **dependency + narrative flow**, not raw effort or raw impact —
cheap visible correctness first, then the new domain entity it sets a precedent for,
then the architecturally interesting demo, then the rest of the deferred/borrowed
ideas, with Presentation last since it documents features that need to exist first.
_(Superseded 2026-08-31 — see below.)_

## Re-derivation — 2026-08-31

Re-ranked in a grilling session on 2026-08-31, after items 1, 2a, and the VSCode
extension shipped. The extension outgrew its planned "demo shell" slot (item 3): it
landed with a real activate/deactivate lifecycle, a managed-server child process, a
board Webview panel, an "Install Hooks" command, workspace-scoped DB config, and a
port-file hook bridge (`extension/`, merge #2). Two roadmap items are done and one
overshot, so "where next" was a request to re-derive the ordering, not pop the next
card.

### What changed from the 2026-08-16 framing

- **Ordering principle** is now **recruiter-visible payload per unit effort** — optimize
  what a 30-second skimmer sees per hour spent — not "dependency + narrative flow". The
  structural foundation is built; the job now is making it legible to the primary
  audience.
- **Presentation items may interleave with / jump ahead of** remaining product features.
  They are no longer pinned last. None of the Presentation track exists yet and it is
  the literal 30-second payload.
- **The Product Features / Presentation split is retained** as a labelling device only,
  not as an ordering constraint.

### Ranked remaining work

Top band ("do these next") is items 1–3; the rest is ranked but not urgent.

1. **Stand up CI** — a test-run workflow (`vitest run`) on push/PR plus a green-checks
   badge in the README. Cheapest item that serves both audiences at once, and it speaks
   directly to the TDD / spike-first discipline. No `.github/` exists today. Effort: low.
2. **Package the VSCode extension as a `.vsix`** — [issue #3](https://github.com/nimrodo/claudekanban/issues/3),
   already labelled `ready-for-agent`. `package:extension` build script exists; this is
   the last sliver of the extension story (marketplace publishing stays out of scope).
   Effort: low.
3. **Waiting → Review escalation** (2026-08-16 item 4a) — a session `waiting` more than
   5 minutes escalates to a new sixth board column (`queued`/`running`/`waiting`/
   `review`/`done`/`failed`), via a new periodic sweep + `waiting_since` timestamp.
   Already decided (see `docs/adr/0001-monitoring-only-no-intervention.md`); promoted
   ahead of the README/GIF so there is a finished surface to document and film once,
   rather than re-shooting after. Effort: medium.
4. **README rewrite** — lead with what the tool does and why the architecture is
   interesting (spike-first methodology, push-based hook ingestion vs. filesystem
   watching, the `Transport` seam), not install instructions. Effort: low–medium.
5. **Screenshots / GIF** — board mid-run (running-glow animation, subagent tree nesting)
   and the Drawer detail view. Committed into the repo (e.g. `docs/assets/`) and
   referenced by relative path; GitHub renders animated GIF inline in markdown (MP4 does
   not autoplay in a README). Needs compelling multi-session board state to capture —
   see the fog note below. Effort: low–medium.
6. **UI density polish bundle** (2026-08-16 item 6) — column count badges + a global
   ambient status strip ("N running / N failed"); timeline event-type icons + repeat-call
   (`×N`) collapsing in the Drawer; card-level micro-progress for parent sessions with
   subagents ("3 subagents · 2 done"); a light-mode variant of the graphite palette; a
   `?` keyboard-shortcut reference overlay. Each small and independent. Effort:
   low–medium.
7. **Deeper backlog** (2026-08-16 item 6, remainder) — cost/token/tool-impact stats as a
   Drawer stat block; a SQLite DB size / event-table growth inspector; active-session
   staleness heuristic refinement; teammate/idle re-spawn handling (needs its own live
   spike first). Effort: medium each; no dependencies between them.

### Not yet specified (fog)

- **Hosted live demo** — feasibility unknown; would need seeded/synthetic session data
  rather than real hook traffic, and a hosting target. Kept as fog, not ranked, until
  its feasibility is investigated.
- **Synthetic / seeded demo board state** — a shared dependency of the Screenshots/GIF
  item (5) and the hosted live demo. Real hook traffic will not reliably produce a good
  frame on demand. Graduates into its own decision when item 5 is picked up.

### Ruled out of scope on 2026-08-31

- **Session task checklist** (2026-08-16 item 2b) — a `Task` entity fed by opt-in
  `TaskCreate`/`TaskUpdate`. Medium effort for a feature most sessions never trigger
  (the `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` opt-in is off by default), so near-zero
  recruiter payoff under the new principle. The `.scratch/session-task-checklist/spec.md`
  spec stays on disk if the destination is ever redrawn.
- **VSCode-hosted intervention** (2026-08-16 item 5) — `cancel` via terminal PID,
  `guidance` via `Terminal.sendText`. Now technically unblocked (the extension is real),
  but large effort, hard to show in a static portfolio, and in tension with the spirit
  of the monitoring-only ADR. Out of scope for this destination.

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

### 1. Main-session title resolution — DONE

**Shipped 2026-08-17.** Re-spiked live: `UserPromptSubmit` fires on Claude Code
`2.1.233` and carries the prompt in a `prompt` field (the official docs claim
`user_input`; the live payload disagreed — see `spike/findings.md` "UserPromptSubmit
payload shape"). No transcript-parsing fallback was needed. `src/domain/mainTitle.ts`
extracts the first line (untruncated); `src/ingest/ingest.ts` locks the title in once,
from the first `UserPromptSubmit` per session; `SessionCard.tsx` prefers it over the
`cwd` basename. Grilled via `superpowers:grilling` + `domain-modeling` before
implementation — see `CONTEXT.md`'s **Title**/**Task** entries for the settled
terminology and `docs/superpowers/specs/2026-08-07-operations-console-design.md` Open
Question #7 for the resolved design record.

### 2a. Session current-activity indicator (repointed from "Task entity") — DONE

**Shipped 2026-08-17** (verified against code: `src/domain/activitySummary.ts`'s
`summarizeEvent`, `last_activity_summary` column in `src/store/schema.sql`, rendered on
both session and subagent cards in `SessionCard.tsx`). Commits: `9697fb5`, `6cc9c97`,
`89c44a0`, `c6529db`.

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

> **Status 2026-08-31: ruled out of scope.** See
> [Re-derivation — 2026-08-31](#re-derivation--2026-08-31). Kept below as the original
> record.

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

> **Status 2026-08-31: done, and overshot.** The extension shipped in merge #2 with far
> more than a demo shell (see [Re-derivation — 2026-08-31](#re-derivation--2026-08-31)).
> Remaining sliver — packaging as a `.vsix` — is now item 2 of the re-derived ranking.

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

> **Status 2026-08-31: ruled out of scope.** Now technically unblocked (the extension is
> real), but out of scope for the current destination — see
> [Re-derivation — 2026-08-31](#re-derivation--2026-08-31).

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

> **Status 2026-08-31: no longer pinned last.** Under the re-derived principle these
> items interleave with product features — README rewrite and Screenshots/GIF are
> items 4–5, and "CI status badge" was promoted to item 1 (stand up CI). See
> [Re-derivation — 2026-08-31](#re-derivation--2026-08-31).

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

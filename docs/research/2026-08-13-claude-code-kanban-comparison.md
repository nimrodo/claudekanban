# claudekanban vs. github.com/NikiforovAll/claude-code-kanban

Research date: 2026-08-13. Primary source repo cloned/browsed via `gh api` and
`raw.githubusercontent.com` at commit on branch `main` (default branch confirmed via
`gh api repos/NikiforovAll/claude-code-kanban` → `default_branch: "main"`), 44 stars,
JavaScript. All claims about that repo are cited against specific file paths there; all
claims about claudekanban are cited against files in this repo's working tree.

## Summary verdict

Worth borrowing from selectively, not wholesale. The two projects solve overlapping
problems with genuinely different ingestion philosophies — claude-code-kanban (CCK) is
a **filesystem-watching reader** of Claude Code's own native state (tasks, session
JSONL transcripts, agent-activity files it writes via hooks), while claudekanban is a
**push-based hook receiver** with no filesystem access to `~/.claude` at all beyond what
hook payloads carry. That architectural split means most of CCK's ingestion code is not
directly portable, but several of its UI/UX ideas, its data-derivation techniques (rich
JSONL parsing for cost/tokens/tool-impact), and a couple of its hook-lifecycle choices
are concretely adaptable within claudekanban's existing push model. The single most
valuable idea is **teammate/idle re-spawn handling** (CCK's `TeammateIdle` hook +
name→id dedup) since claudekanban's own spike notes flag an unresolved gap in this area.

## Architecture / stack comparison

| Aspect | claudekanban (this repo) | claude-code-kanban (CCK) |
|---|---|---|
| Language/runtime | TypeScript, Node (Express backend, React frontend, Vite build) — `CLAUDE.md` | Vanilla JS, Node ≥20, zero build step — `package.json` (github.com/NikiforovAll/claude-code-kanban) |
| Data store | SQLite via `better-sqlite3`, schema in `src/store/schema.sql` | None — no DB; state is derived live from files each read, with short-TTL in-memory caches (`docs/session-scanning.md`, CCK repo) |
| Ingestion mechanism | **Push**: `hooks/*.sh` `curl` the raw hook JSON to `POST /ingest` (`src/ingest/ingest.ts`) | **Pull**: `chokidar` watchers on `~/.claude/projects/**/*.jsonl`, `~/.claude/tasks/*.json`, plans, and `~/.claude/agent-activity/**` (`docs/session-scanning.md`, CCK repo); hooks (`plugin/plugins/claude-code-kanban/scripts/agent-spy.sh`) are used *only* to write supplementary agent-activity JSON files, not to push the primary task/session data |
| Real-time push to browser | SSE via `src/stream/broadcaster.ts`, triggered by `changeEmitter` (`src/domain/changeEmitter.ts`) on every DB write | SSE via `server.js`, triggered by the chokidar watchers on file add/change/unlink (`docs/session-scanning.md`, CCK repo) |
| Session/subagent modeling | One `session` SQLite table, two lifecycles: top-level via `SessionStart`/`Stop`, subagent ("child") via `SubagentStart`/`SubagentStop`/`PostToolUse` merge, keyed by `parent_session_id` (`src/store/schema.sql`, `src/domain/subagentSynthesis.ts`) | No unified table. Tasks are Claude Code's own native task JSON files (schema: `id`, `subject`, `status` ∈ `pending/in_progress/completed`, `blocks`, `blockedBy` — `test/schemas/task.schema.json`, CCK repo) read as-is; agents are separate per-session JSON files at `~/.claude/agent-activity/{sessionId}/{agentId}.json` written by the hook script, with `status` ∈ `active/idle/stopped` and a distinct `TeammateIdle` lifecycle for agent-team members (`docs/agent-log-spec.md`, CCK repo) |
| Cost/token/tool-impact data | Not modeled — claudekanban's `Session` row has no token/cost fields (`src/store/schema.sql`) | Derived by parsing the full session JSONL transcript in `lib/parsers.js` — `formatTaskUsage()`, `buildSessionDigest()` (CCK repo) |
| Hook events consumed | 7: `SessionStart`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification`, `PermissionRequest` (`CLAUDE.md`, `hooks/` dir) | 7, different set: `SessionStart`, `SubagentStart`, `SubagentStop`, `TeammateIdle`, `PermissionRequest`, `PreToolUse` (matchers `AskUserQuestion`/`ExitPlanMode`), `PostToolUse`, all routed to one script `agent-spy.sh` (`plugin/plugins/claude-code-kanban/hooks/hooks.json`, CCK repo) |
| Verification methodology | "Spike-first": live-captures hook payloads before trusting docs, documented gotchas in `spike/findings.md` (this repo) | No equivalent documented methodology found in the files browsed; behavior is asserted directly in `docs/agent-log-spec.md`/`docs/session-scanning.md` without a stated live-verification discipline |

## Prioritized borrowable ideas

1. **Teammate/idle re-spawn handling via a `TeammateIdle`-equivalent signal.**
   Source: `docs/agent-log-spec.md` (CCK repo, github.com/NikiforovAll/claude-code-kanban)
   — "Teammates transition active → idle → re-spawn — the old instance is always idle
   (not active) when the new one starts," deduped via name→id mapping files
   (`_name-{type}.id`). claudekanban's own `spike/findings.md` documents an open,
   unresolved gap in exactly this area (background-job sessions producing
   `SubagentStop` with empty `agent_type`, filtered as a "false positive" rather than
   modeled as a real state — `spike/findings.md` lines 227-236, this repo). CCK's
   approach — an explicit intermediate `idle` status plus id-dedup by agent name/type —
   is a plausible resolution model to spike against live Claude Code team-session
   behavior before extending `synthesizeSubagentStop` (`src/domain/subagentSynthesis.ts`).
   **Effort: medium** (needs its own spike-first verification per this repo's own
   methodology, then a `status` enum change and a new synthesis function). **Fit: good**
   — extends the existing one-table-two-lifecycles model rather than replacing it.

2. **"Active session" composite heuristic for surfacing/hiding stale work.**
   Source: `docs/active-session.md` (CCK repo) — eight OR'd conditions (pending/
   in-progress tasks, agents updated within the last hour, plans edited within 15
   minutes, JSONL log touched within 5 minutes, waiting-marker expiring after 30
   minutes, etc.) used to decide what counts as "active" and worth surfacing. Compare
   claudekanban's `src/domain/staleSweep.ts`/`listRunningSessionActivity`
   (`src/store/sessionStore.ts` lines 63-68), which currently sweeps only `status =
   'running'` rows on `last_activity_at` — a single timeout rule. CCK's multi-signal,
   multi-timeout approach (different staleness windows for different data sources) is a
   concrete refinement idea for board decluttering. **Effort: low-medium** — the
   `staleSweep` module is already the right seam; this is parameter/rule tuning, not new
   plumbing. **Fit: good.**

3. **Cost/token/tool-impact breakdown per session.**
   Source: `lib/parsers.js`, `formatTaskUsage()` (tokens, tool-use count, duration
   formatting) and `buildSessionDigest()` (CCK repo); also listed as a README feature
   ("Context window monitoring with token/cost breakdowns," `README.md`, CCK repo).
   claudekanban's hook payloads already carry some of this (`spike/findings.md` line 25:
   `tool_response.totalDurationMs`, `tool_response.totalTokens`, `tool_response.usage`
   observed on `PostToolUse` for subagent spawns) but the `Session` row/schema
   (`src/store/schema.sql`) has no columns for it and nothing currently persists or
   surfaces it. **Effort: medium** — schema migration plus a UI addition to
   `SessionCard.tsx`/`Drawer.tsx`. **Fit: good**, no ingestion-model conflict since the
   data already arrives via existing hook payloads, no filesystem reads required.

4. **Storage/disk-usage inspector.**
   Source: README feature bullet "Storage manager for disk usage inspection" and
   `assets/shot-storage-manager.png` (CCK repo). claudekanban has no equivalent —
   `src/store/schema.sql` has no housekeeping/retention story visible in the files
   reviewed. Since claudekanban owns a SQLite file rather than reading Claude Code's own
   files, the equivalent feature would be "SQLite DB size / event-table growth
   inspector," not a literal port. **Effort: low.** **Fit: fair** — useful but
   lower-priority than 1-3; adapt the *feature idea*, not the code.

5. **Keyboard-first navigation with a `?` shortcut-reference overlay.**
   Source: README ("Keyboard-first navigation... Press `?` for the full shortcut
   reference," CCK repo). claudekanban's frontend (`src/frontend/board/Board.tsx`,
   `src/frontend/detail/Drawer.tsx`) has no keyboard-navigation layer visible in the
   files reviewed. **Effort: low-medium** (frontend-only, no backend/domain change).
   **Fit: good**, purely additive.

## What NOT to borrow, and why

- **File-watching (chokidar) ingestion in place of the hook-push model.** CCK's core
  design assumption — that Claude Code writes readable, sufficiently structured files to
  `~/.claude/{tasks,projects,agent-activity}` that a dashboard can watch directly
  (`docs/session-scanning.md`, CCK repo) — is exactly the kind of undocumented-behavior
  assumption this project's spike-first methodology exists to distrust
  (`spike/findings.md`, this repo, e.g. the `Notification`/`permission_prompt` and
  `SessionStart`-not-firing-on-SDK gotchas). claudekanban's design spec
  (`docs/superpowers/specs/2026-08-07-operations-console-design.md`) and its Phase-0
  spike already chose CLI hooks over richer alternatives specifically to preserve
  passive, install-anywhere observation without depending on filesystem layout details
  that could silently change between Claude Code versions (`spike/findings.md` lines
  176-188, "Decision: Keep CLI hooks"). Switching to file-watching would directly
  contradict that already-deliberated tradeoff, not just add a feature.

- **Task-as-primary-entity modeling (`pending`/`in_progress`/`completed` task objects,
  `test/schemas/task.schema.json`, CCK repo) as a *replacement* for claudekanban's
  session/subagent table.** CCK's kanban board is fundamentally organized around Claude
  Code's own task list (todos), a different unit of work than a session or subagent.
  Grafting task-tracking onto claudekanban's `session` table would blur the
  "sessions vs. subagents — one table, two lifecycles" model that `CLAUDE.md` and
  `src/domain/subagentSynthesis.ts` deliberately keep simple. If task-level tracking is
  wanted later, it should be a new table/entity, not a reshaping of `session`.

- **Zero-build vanilla-JS frontend with CDN dependencies** (`CLAUDE.md`, CCK repo: "Zero
  build step: Vanilla JavaScript with CDN dependencies (marked.js, DOMPurify,
  highlight.js)"). claudekanban already has a working TypeScript/React/Vite pipeline
  (`npm run build` in this repo's `CLAUDE.md`) with typechecking and a component
  structure (`src/frontend/board/`, `src/frontend/detail/`). Regressing to a
  build-free vanilla-JS approach would be a net architecture downgrade for this
  project, not an improvement, even though it works fine for CCK's own goals (avoiding
  a build step for a `npx`-installed CLI tool is a reasonable tradeoff for *their*
  distribution model, not for claudekanban's).

- **Using hooks as a secondary/write-only channel instead of the primary data path.**
  CCK's hooks (`agent-spy.sh`) only write small JSON files that the file-watcher then
  picks up — hooks are not directly parsed for their payload content the way
  claudekanban's ingest handler does (`src/ingest/ingest.ts` reads `req.body` directly
  as the source of truth). Adopting CCK's indirection (hook → file → watcher → app)
  would add a filesystem round-trip and a new failure mode (file write races, OS-level
  latency) for no benefit in claudekanban's context, since claudekanban already receives
  the full payload synchronously over HTTP.

## Where claudekanban's existing approach is already equal or superior

- **Push-based ingestion has strictly more observability into hook payload shape than
  file-derived state.** claudekanban's ingest handler (`src/ingest/ingest.ts`) sees the
  exact JSON Claude Code hands the hook, including fields CCK's file-watching approach
  cannot recover at all (e.g. `tool_response.agentId`/`tool_response.error` used for
  subagent failure detection, `mergeSubagentTitle` in
  `src/domain/subagentSynthesis.ts`) since those only exist transiently in the hook
  call, not in any file CCK reads.
- **Documented, evidence-based verification discipline.** `spike/findings.md` (this
  repo) systematically distrusts undocumented/newly-documented behavior and re-verifies
  live against installed Claude Code versions, catching real gotchas (empty
  `agent_type` on background-job `SubagentStop`, `Notification.permission_prompt` never
  firing) that a filesystem-reading approach like CCK's would be equally exposed to but
  has no documented equivalent methodology for surfacing in the files reviewed
  (`docs/agent-log-spec.md`, `docs/session-scanning.md`, CCK repo).
- **Durable SQLite persistence vs. CCK's file-derived, cache-only model.**
  claudekanban's `src/store/schema.sql` gives it a queryable historical `event` log
  (`event` table) independent of whether Claude Code's own files still exist on disk;
  CCK's model (`docs/session-scanning.md`, "no periodic full scan... backed by
  short-TTL caches") is inherently tied to Claude Code's own file retention and would
  lose history if those files are cleaned up (its own "Storage manager" feature exists
  precisely because of this coupling).
- **Simpler, single-table domain model.** The one-`session`-table,
  `parentSessionId`-linked design (`src/store/schema.sql`,
  `src/domain/subagentSynthesis.ts`) is considerably easier to reason about and query
  than CCK's three-way split across native task files, native session JSONL, and
  hook-derived agent-activity JSON files spread across separate directories
  (`docs/agent-log-spec.md`, CCK repo) — a deliberate simplicity claudekanban should
  keep even while adopting individual ideas above.

## UI/UX deep dive

Follow-up to the summary above, which only lightly touched UI via README text. This
section is based on actually viewing CCK's screenshots and reading its CSS/HTML source,
plus a full read of claudekanban's current frontend components and stylesheets.

Method: cloned `github.com/NikiforovAll/claude-code-kanban` to a scratch directory
(`/tmp/cck-research/claude-code-kanban`, read-only, not part of this repo) at commit
`5784df5` ("Bump version to 4.18.0"). Its README screenshots are committed directly to
the repo under `assets/*.png` (not hosted externally), so they were viewed directly via
the `Read` tool rather than fetched over HTTP. Screenshots inspected: `shot-kanban.png`,
`shot-subagent-preview.png`, `shot-session-info.png`, `shot-storage-manager.png`,
`shot-theme-picker.png`, `shot-tool-stats-impact.png`, `shot-session-log.png`. Source
also spot-checked: `public/style.css` (4939 lines), `public/themes.css` (823 lines) —
both confirm a single `--mono`/`--font-mono` monospace font token used throughout, no
separate display/sans font. claudekanban's own frontend was read in full:
`src/frontend/board/Board.tsx`, `SessionCard.tsx`, `board.css`; `src/frontend/detail/Drawer.tsx`,
`drawer.css`.

### What CCK's UI actually looks like

CCK is a **light-mode-by-default, three-pane desktop dashboard**, not a card-grid kanban
in the Trello sense despite the name. Layout, from `shot-kanban.png`:

- **Left rail** (~300px): a session list grouped by project (collapsible), each row a
  small task-progress card — title, branch name, a thin horizontal progress bar (0/4,
  1/4 fraction shown as text), a colored dot for status (amber = active, gray = idle),
  and a relative timestamp ("just now"). A search box and two filter dropdowns ("Recent
  24h", "Active Only") sit above the list. Global status chips ("0 waiting", "2 active")
  sit above that as page-level ambient status, always visible regardless of scroll.
- **Center pane**: the actual "kanban" — three text-only status columns (Pending / In
  Progress / Completed), each column header a colored dot + label + a numeric count
  badge. Cards are plain white rectangles, no border-left accent, no shadow — hierarchy
  comes entirely from a colored status label line under the title ("Prevent idle agent
  from activating session" in orange) and strikethrough text for completed items. Task
  IDs (`#2135-1`) are muted gray monospace. A `BLOCKED` badge and "Waiting on #2" caption
  appear inline on blocked cards — dependency state is shown as text, not a separate
  column or connector line.
  - Notably thin: no swimlanes, no drag-and-drop affordance visible, no per-card avatar
    or owner chip on the board itself (owner/session context lives in the left rail, not
    repeated on every card) — a deliberate low-repetition choice.
- **Right pane / Session Log** (`shot-session-log.png`, opens on demand, ~550px): a dense
  reverse-chronological event feed. Each entry is icon-tagged by type (eye = read, magnifying
  glass = grep, pencil = edit, robot = agent action, terminal = bash, person = user
  slash-command), one-line summary, relative/absolute date stamp underneath. A small `×2`
  chip collapses repeated identical calls (e.g. "Read server.js L294 +50 ×2") instead of
  listing every repetition — a solid density trick. Long-running or notable entries
  (marked with a left orange bar) expand inline with full multi-paragraph text and a
  diff-style code snippet block, no modal needed for that level of detail. A separate
  "Pinned" section pins specific entries to the top permanently.
- **Top bar**: task title + breadcrumb metadata line (task count, project path,
  last-updated), a horizontal overall-progress bar with percentage on the far right, then
  a row of icon-only buttons (chat/comment, edit/pin, database=storage manager,
  palette=theme picker, sun=light/dark, ?=help, GitHub link).
- **Modals** (`shot-subagent-preview.png`, `shot-session-info.png`,
  `shot-storage-manager.png`, `shot-tool-stats-impact.png`): all centered white cards
  with a soft scrim overlay, consistent header pattern (bold title left, icon buttons +
  × right), consistent chip row for metadata (`ID`, `Stopped`, duration, `MODEL`,
  timestamps as separate pill chips rather than a label:value list). The session-info
  modal in particular is well done for a monitoring tool: a labeled horizontal token-usage
  bar (green fill = used, colored tick marks for checkpoints) above a two-column
  key/value grid (cache read/write, input/output tokens, cost in dollars, API time, lines
  +/-). The tool-stats modal reuses the same "value + thin proportion bar + percentage"
  pattern for per-tool call-count "Impact" — a nice repeated visual language across
  different stat surfaces rather than a bespoke chart per modal.
- **Storage Manager** (`shot-storage-manager.png`): tabbed (Sessions / Scratchpads /
  Linked Docs), byte-size shown in the modal header itself (`5.4 KB`), per-item "View" /
  "Clear All" / "Unpin" actions, a "Clean Orphaned" primary action at the bottom. It's a
  housekeeping utility, not a chart-heavy storage visualizer — text lists plus counts,
  consistent with the rest of the UI's low-chrome philosophy.
- **Theme picker** (`shot-theme-picker.png`): a dropdown list of ~19 named themes (Ember,
  Gruvbox, Catppuccin, Tokyo Night, Solarized, Dracula, Nord, Rosé Pine, Everforest,
  Kanagawa, One Dark, Night Owl, Monokai Pro, GitHub, Ayu, Vitesse, Synthwave '84, …),
  each row previewed with three small color swatch dots (not a full live preview) before
  you commit. This is CCK's single most distinctive UI feature — most competing tools
  ship one dark/light toggle; CCK ships a whole editor-theme ecosystem, clearly aimed at
  developers who already have a strong personal-preference muscle from their code editor.
- **Typography and density**: one monospace font family for structural/numeric text
  (IDs, timestamps, code, log entries) and a slightly larger serif/sans for card titles
  and modal headings — actually a fairly information-dense UI (small type sizes
  throughout, tight line spacing in the session log) that reads more like a developer
  tool / IDE panel than a consumer dashboard. No visible empty-state illustration was
  captured in any screenshot reviewed — empty states weren't directly observable from the
  available assets since all screenshots show populated data.
- **Color/status coding**: sparse and functional rather than decorative — orange/amber
  for "active/in-progress", green for done/success, red for failed, gray/muted for
  idle/waiting, blue accent for selection. Status color is applied to text and small dots,
  almost never to whole card backgrounds or large fills, keeping the base page
  overwhelmingly white/gray with color reserved as a genuine signal.

### Comparison to claudekanban's current UI

claudekanband's frontend (read directly, not from docs) is a **dark-only, five-column
process-monitor board**, deliberately themed — the `board.css` header comment (lines
1-31) states the intent explicitly: "structurally closer to a process monitor (`ps
--forest` / `k9s` / `git log --graph`) than a generic project-management kanban." This
is already a considered, non-default design, not an unstyled scaffold:

- **Layout**: `Board.tsx` renders a CSS grid of 5 fixed status columns (queued / running
  / waiting / done / failed), each a full-height pane with a sticky monospace header (a
  small colored dot + uppercase label, no count badge — a gap vs. CCK's per-column
  numeric badges). `SessionCard.tsx` cards live inside columns; a card only shows `cwd`
  (last path segment), `owner`, an 8-char id, and status text — no title/description text
  on the parent card itself, and no progress indicator of any kind.
- **Subagent nesting**: children render inside the parent card (`.card-children`) with an
  actual hand-drawn tree connector (`::before`/`::after` CSS border tricks forming an
  L-shaped branch line, `board.css` lines 262-333) — a genuinely distinctive visual idea
  CCK doesn't have (CCK's "Agents Log" is a flat row of cards below the board, not nested
  under a parent task).
- **Status color**: five semantic tokens (`--ck-queued` #6b7a99 slate, `--ck-running`
  #d9a441 amber, `--ck-waiting` #9b7fd4 violet, `--ck-done` #5fa876 green, `--ck-failed`
  #c05f4f red-orange) applied as a 3px left border on cards and a small dot before column
  headers — conceptually the same "restrained accent, not full-card fill" philosophy CCK
  uses, applied to a different (5-status vs 3-status) state machine. A nice touch CCK
  lacks entirely: a `prefers-reduced-motion`-respecting animated glow pulse
  (`ck-running-glow`) on running cards (`board.css` lines 190-204, 385-389) — a real
  live-monitoring affordance, signaling "this card is actively updating" via subtle
  motion rather than static color alone.
- **Typography**: two-font system (IBM Plex Mono for structural/data text, IBM Plex Sans
  for the one prose label), self-hosted specifically to avoid outbound requests for
  potentially sensitive cwd/recap text (`board.css` lines 27-31) — a privacy-conscious
  decision CCK has no equivalent stated rationale for (CCK's fonts weren't inspected in
  detail but its CSS shows a single mono-only approach for structural text).
- **Drawer** (`Drawer.tsx`/`drawer.css`): a right-side slide-over panel (not a centered
  modal like every CCK dialog) with a `dl`-based metadata grid (status/owner/model/
  started/ended), a recap block bordered in the "done" green accent, and a vertical
  timeline with a dot-and-rail spine per entry (`drawer.css` lines 188-224) — structurally
  similar in spirit to CCK's Session Log rail but currently much sparser: no icon-per-
  event-type (CCK differentiates read/grep/edit/bash/agent/user icons; claudekanban's
  timeline entries are undifferentiated text rows with a "Show raw"/"Hide raw" JSON
  toggle instead), no repeat-call collapsing (`×2`-style), no pinning.
- **What claudekanban has that CCK's screenshots don't show**: keyboard activation on
  cards (`Enter`/`Space` via `handleActivateKey`, `SessionCard.tsx` lines 8-13),
  `focus-visible` outlines on both cards and child-cards (`board.css` lines 364-368),
  and drawer focus-trap/return-focus handling (`Drawer.tsx` lines 32-42) — CCK's
  screenshots don't reveal whether it has equivalent keyboard/focus handling despite its
  README claiming "keyboard-first navigation," since that can't be verified from static
  images alone.
- **What CCK has that claudekanban doesn't, confirmed from screenshots**: column count
  badges, per-card progress bars/fractions, a global "N active / N waiting" ambient
  status readout above the board, log-entry type icons, repeat-call collapsing, entry
  pinning, and a token/cost/duration stats surface (session-info + tool-stats modals) —
  none of which claudekanban's `Session` row or frontend currently model at all (schema
  gap already noted in the architecture comparison above).

### Prioritized UI improvement ideas for claudekanban

Ordered by payoff-per-effort, each with a concrete rationale (not "copy CCK" — several
diverge from what CCK does because CCK's choice is mediocre or wrong for this project's
"process monitor" identity):

1. **Add column count badges + a global ambient status strip.** *Effort: low* (pure
   frontend, `Board.tsx` already computes `columnSessions` per column — just render
   `.length` next to the `<h2>`; a top-of-page strip summarizing "N running / N waiting /
   N failed" is a `useMemo` over `sessions` plus a small fixed-position bar). *Payoff:
   high.* This is CCK's single best information-hierarchy idea (`shot-kanban.png` top-left
   chips, and every column header) and claudekanban's board currently forces a manual
   scan-and-count to answer "how many things are running right now" — exactly the
   question a process monitor should answer in under a second. Do it as small
   monospace numerals in the existing `--ck-text-muted` tone, not a loud badge, to stay
   in the graphite-console voice.

2. **Timeline event-type icons + repeat-call collapsing in the Drawer.** *Effort:
   low-medium* (`eventSummary.ts` already classifies events into a `summary` string —
   extending it to also return a `kind` enum for icon lookup is additive; collapsing
   consecutive identical `(tool, target)` pairs into a `×N` chip is a pure function over
   the existing `timeline` array, no new data needed). *Payoff: high.* CCK's session log
   (`shot-session-log.png`) is legible at a glance specifically because icon shape does
   half the work text would otherwise do, and repeat-collapsing keeps a chatty tool-call
   sequence from drowning the one interesting entry. claudekanban's current
   `timeline-entry` rows are undifferentiated text with a raw-JSON toggle — functional
   but slower to scan, and a long Bash-heavy session will currently produce a wall of
   near-identical rows.

3. **Per-session token/cost/duration stats, surfaced in both the card and Drawer.**
   *Effort: medium* (needs the schema/ingestion work already flagged as idea #3 in the
   architecture section above — this is the UI half of that same idea). *Payoff:
   medium-high.* CCK's session-info modal (`shot-session-info.png`) — a labeled
   proportional usage bar plus a clean key/value stat grid — is genuinely good dashboard
   design (restrained, scannable, no unnecessary chart chrome) and is directly reusable
   as a visual pattern even though the underlying data pipeline has to be built first.
   Don't put this on the card face (card real estate is already tight in a 5-column
   narrow layout) — reserve it for the Drawer's metadata `dl`, as a new stat block below
   the existing one.

4. **Card-level micro-progress for sessions with known subagent/tool-call counts.**
   *Effort: low-medium.* CCK's thin progress bar + fraction ("1/4") on every task card
   is an effective at-a-glance completion signal. claudekanban's card currently shows
   only a status word. A rough equivalent — e.g. "3 subagents · 2 done" as small
   monospace text, or a 2px bar showing `childrenByParent` done/total ratio — would give
   the same value without needing new backend fields, since child session counts are
   already available via `groupSessions.ts`. *Payoff: medium* — most useful for parent
   sessions with several subagents; a no-op visual for simple single-session cards.

5. **Do NOT adopt CCK's multi-theme picker (19 editor themes) wholesale.** This is CCK's
   flashiest feature but it's a poor fit here: claudekanban is explicitly a single-purpose
   "graphite console" with a deliberately designed dark palette tied to specific status
   semantics (`board.css` header comment) — offering 19 arbitrary community themes would
   dilute that identity and multiply QA surface (every theme needs its own contrast/
   status-legibility check) for a feature whose main value in CCK is "match my editor,"
   which doesn't obviously matter for an ops console nobody stares at for hours the way
   they stare at their editor. If theming is wanted at all, the higher-value version is a
   **light-mode variant of the existing graphite palette** (claudekanban is currently
   dark-only, `color-scheme: dark` hardcoded in `board.css` line 93) — useful for
   screen-sharing/projector contexts and accessibility (`prefers-color-scheme: light`
   users), not a personal-preference theme gallery. *Effort: medium* (needs a parallel
   light token set plus contrast-checking every status color against a white/light
   background — several of the current colors, e.g. `--ck-queued` #6b7a99, are tuned for
   dark backgrounds and would likely fail contrast on light ones as-is).

6. **Storage/housekeeping inspector modal, reusing the Drawer's existing slide-over
   pattern rather than CCK's centered-modal Storage Manager.** *Effort: low* (mentioned
   as idea #4 in the architecture section — this is the concrete UI treatment). CCK's
   version (`shot-storage-manager.png`) is a fine reference for *content* (per-item size,
   "Clean Orphaned" bulk action) but its centered-modal chrome is inconsistent with
   claudekanban's existing single UI surface for "drill into detail" (the right-side
   Drawer). Reusing the Drawer component for this (a new `view=storage` mode) keeps the
   app's interaction vocabulary to one pattern instead of introducing a second modal
   system for a single feature.

Overall: CCK's strongest, most portable UI ideas are information-density techniques
(count badges, ambient status strip, repeat-call collapsing, icon-coded log entries,
the stat-bar-plus-grid pattern for numeric detail) rather than its visual style, which is
a fairly generic light developer-tool look. claudekanban's existing dark "graphite
console" identity, tree-connector subagent nesting, and reduced-motion-aware running-glow
animation are already more visually distinctive and better suited to its stated
process-monitor framing than anything in CCK's screenshots — the improvement path is
borrowing CCK's information-hierarchy discipline, not its aesthetic.

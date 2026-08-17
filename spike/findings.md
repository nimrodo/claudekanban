# Phase 0 Findings

Source captures: `spike/captures/cli-hooks.jsonl`, `spike/captures/agent-sdk.jsonl`.

## Hook events and payload fields (CLI hooks)

| Event | Present? | Key fields observed |
|---|---|---|
| SessionStart | yes | `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `source`, `model` |
| PostToolUse | yes | `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`, `hook_event_name`, `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, `duration_ms`, `agent_id`, `agent_type` |
| Stop | yes | `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `effort`, `hook_event_name`, `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons` |

No `PreToolUse`, `SubagentStop`, or `UserPromptSubmit` events appear anywhere in this capture
(only `Test`, `SessionStart`, `PostToolUse`, `Stop` were observed — `Test` is a synthetic
smoke-test payload, not a real Claude Code event, and is excluded from the design implications
below).

## Subagent linkage

- Does any payload carry a `subagent_type` or equivalent field? **Yes.** A `Task`-tool spawn
  (e.g. of the Explore agent) shows up as a single `PostToolUse` event with
  `tool_name: "Agent"` and `tool_input.subagent_type: "Explore"`. The subagent's full output,
  identity, and usage stats are nested inside that same event's `tool_response`:
  `tool_response.agentId` (e.g. `"abc94f1ee7a059ca9"`), `tool_response.agentType` (e.g.
  `"Explore"`), plus `tool_response.content`, `tool_response.totalDurationMs`,
  `tool_response.totalTokens`, `tool_response.usage`, etc. This one `PostToolUse` event is
  tagged with the **parent** session's `session_id` (`201f511d-ecda-...`) — verified directly
  against the raw capture (record 9 in `cli-hooks.jsonl`). There is no separate
  `SessionStart`/`Stop` pair anywhere in the file for the subagent — its `agentId` never
  appears as a top-level `session_id` on any other record.
- Does any payload carry a parent/session linkage field distinguishing subagent from main
  session? **Partially.** `PostToolUse` events also carry top-level `agent_id` / `agent_type`
  fields, distinct from the nested `tool_response.agentId`. These are `null` for ordinary
  tool calls made directly by the main session, but were observed **populated**
  (`agent_id: "a955b7ef70e01e08d"`, `agent_type: "general-purpose"`) on a run of `Bash`
  `PostToolUse` events that were themselves issued by a background subagent (a
  `run_in_background: true` Task spawn) — and those events still carry the **same
  `session_id`** as the parent session (`30f14dfd-...`), not a distinct one. So Claude Code
  does expose an agent identity tag on individual tool-call events made *by* a running
  background subagent, but it is never surfaced as its own `session_id`/`SessionStart`/`Stop`
  stream — everything is folded into the parent session's hook stream.
- Verdict for the `owner` column design (spec §Domain model): **Needs a real fallback design,
  and the underlying assumption in the spec conflicts with the captured behavior.** The spec
  (`docs/superpowers/specs/2026-08-07-operations-console-design.md`, Domain model section)
  assumes subagents are their own `Session` row, linked via `parent_session_id`, "populated
  from the hook payload" the way a normal session is (i.e. driven by its own
  `SessionStart`/`PostToolUse`/`Stop` stream). That is **not what happens**: a synchronous
  subagent spawn (the common case, e.g. Explore) never produces its own hook stream at all —
  it is entirely a nested value inside one `PostToolUse` event on the parent. A
  `parent_session_id`-linked `Session` row for that subagent would have to be synthesized by
  the ingest layer *from* that single `PostToolUse` event (using `tool_response.agentId` as
  the synthetic child session id and `tool_input.subagent_type` as `owner`), not populated
  from an independent event stream the way the spec implies. This is a real design conflict
  that needs resolving before Phase 1 ingest logic is written — flagging it rather than
  silently reinterpreting the spec.
- **Task title field (found during Phase 1 live testing):** the same `PostToolUse.tool_input`
  that carries `subagent_type` also carries a `description` field — a short, human-written
  summary of what the subagent was asked to do (e.g. `"Find TODO occurrences"`), confirmed live
  in `spike/captures/agent-sdk.jsonl`. This is a free, already-available field for labeling
  subagent cards with what they're actually doing, distinct from `owner` (which only names the
  subagent *type*, e.g. `"Explore"`). No equivalent field exists for the **main** session: no
  `UserPromptSubmit` event (or any other event carrying the user's initial prompt) has ever been
  observed in a capture — `SessionStart` carries only `session_id`/`cwd`/`model`/`source`. A
  main-session task title would require either a dedicated retest for a `UserPromptSubmit` hook
  (unconfirmed whether Claude Code exposes one) or reading the transcript file at
  `transcript_path`, which is a larger, unvalidated change — not a simple payload-field read.

## Stop payload / recap

- Field carrying the final assistant message: **`last_assistant_message`** (top-level string
  on the `Stop` event, e.g. `"What would you like me to have the Explore agent look for in the
  codebase?"`).
- Verdict for the `recap` column design: **Usable as-is.** `Stop.last_assistant_message` maps
  directly onto the spec's `recap` column (populated "from the raw `Stop` hook payload's final
  message") with no adjustment needed — the field already contains exactly that, verbatim, as
  a plain string.

## Resume mechanics

- Command tested: none — **not tested in this spike, still open.** The capture file contains
  no data on `claude --resume` or any equivalent resume invocation.
- Observed behavior: n/a — not exercised in this capture.
- Verdict for the v2 "resume" intervention design: **Unconfirmed — remains an open question**
  until a dedicated resume test is run and captured.

## Review-state signal

**Resolved in a follow-up spike** (`spike/captures/review-state.jsonl`, after the original Phase 0
captures found nothing). The original CLI-hooks/Agent-SDK captures only wired `SessionStart`,
`PostToolUse`, and `Stop` — they never captured `Notification` or `PermissionRequest`, which is
why no review-state signal showed up there. A dedicated follow-up (docs research against
`https://code.claude.com/docs/en/hooks`, then a live capture on Claude Code 2.1.226) confirms two
real signals:

- **`PermissionRequest`** — fires when a tool call needs a permission decision, *before* the
  on-screen prompt appears. Confirmed live payload (record 4 of `review-state.jsonl`):
  ```json
  {
    "session_id": "ac05c769-...",
    "cwd": "/Users/nimrodo/workspace/scratch",
    "permission_mode": "default",
    "hook_event_name": "PermissionRequest",
    "tool_name": "Bash",
    "tool_input": {"command": "rm nimrod.txt", "description": "Remove nimrod.txt"},
    "permission_suggestions": [
      {"type": "addDirectories", "directories": ["/Users/nimrodo/workspace/scratch"], "destination": "session"},
      {"type": "setMode", "mode": "acceptEdits", "destination": "session"}
    ]
  }
  ```
  This is the direct `running → waiting` (approval-needed) signal the original spec's state
  machine wanted from `PreToolUse` (which was never observed at all — see above). `PreToolUse`
  should be considered superseded by `PermissionRequest` for this purpose.

- **`Notification` with `notification_type: "idle_prompt"`** — fires when Claude finishes a turn
  and is waiting on the user, unrelated to permissions. Confirmed live payload (records 2, 3, 5
  of `review-state.jsonl`):
  ```json
  {
    "session_id": "...", "cwd": "...", "prompt_id": "...",
    "hook_event_name": "Notification",
    "message": "Claude is waiting for your input",
    "notification_type": "idle_prompt"
  }
  ```
  Docs also list a `notification_type: "permission_prompt"` value, but it was **not observed** in
  this capture — the same real permission prompt that produced the `PermissionRequest` event above
  did not also produce a `Notification` with type `permission_prompt`. Only `idle_prompt` fired via
  `Notification` in this version (2.1.226). Do not assume `Notification`/`permission_prompt` is
  reliable without a dedicated retest; `PermissionRequest` is the confirmed, direct signal.

**Verdict for the state machine:** `PermissionRequest` maps directly to `running → waiting`
(supersedes the spec's unobserved `PreToolUse`-based transition). `idle_prompt` maps to a
session being caught up / awaiting user input generally — plausible as an additional `running →
waiting` trigger distinct from permission-gating (e.g. Claude asking a clarifying question), worth
folding into Phase 1's design rather than treated as `review`. No signal was found (or should be
expected) for a distinct `review` state beyond `waiting` — `review` still has no confirmed hook
source and remains a heuristic/manual-toggle question for Phase 1, but `waiting` itself is now
fully resolved.

## CLI hooks vs. Agent SDK — ingestion decision

- **CLI-hooks capture (`spike/captures/cli-hooks.jsonl`):** exposes `SessionStart`,
  `PostToolUse`, and `Stop` — all three fired reliably. A working `recap` source exists
  (`Stop.last_assistant_message`), and subagent spawns are detectable via `PostToolUse` with
  `tool_name: "Agent"`/`"Task"` and `tool_input.subagent_type`. Subagent identity/output is
  nested inside that same `PostToolUse` event's `tool_response` (`tool_response.agentId`,
  `tool_response.content`, usage stats), tagged with the **parent's** `session_id` — subagents
  never get their own `SessionStart`/`Stop` stream.

- **Agent SDK capture (`spike/captures/agent-sdk.jsonl`, 18 records):** native hook callbacks
  were registered for `SessionStart`, `PostToolUse`, and `Stop` (verified correct registration
  per the brief), plus every streamed SDK message was captured as `sdk_message`. Only
  `PostToolUse` (4) and `Stop` (1) actually fired; **`SessionStart` did not fire at all**,
  despite identical, correctly-wired registration — a real SDK behavioral gap, not a script
  bug (confirmed in `task-4-report.md` and by its absence in the raw capture — `grep -c
  '"hookEventName":"SessionStart"'` on the file returns 0). This directly breaks the `recap`
  design's counterpart need for session-start metadata and would need a workaround if the SDK
  path were adopted.

  For subagent linkage, the raw capture (records 3, 6, and 14) shows the same fundamental shape
  as CLI hooks: the `Task` tool-use (record 3, `sdk_message`) carries
  `input.subagent_type: "Explore"`; the subagent's own tool calls (e.g. record 6's `Grep`
  `PostToolUse`) have their `sdk_message` counterparts (records 5 and 8) carrying
  `parent_tool_use_id` pointing back at the `Task` call — the `PostToolUse` hook payload itself
  carries no such field — but the `PostToolUse` record's top-level `session_id`
  (`146e88d8-...`) is identical to the **parent** session's — not a
  distinct id. The final `PostToolUse` for the `Task` itself (record 14) nests the subagent's
  full output under `tool_response.agentId` (`"a1b4636"`) and `tool_response.content`, exactly
  mirroring the CLI-hooks shape (`tool_response.agentId`/`tool_response.content` there too). The
  one addition the SDK stream offers is `parent_tool_use_id` threaded through every
  `sdk_message`, which is a slightly more explicit call-graph pointer than CLI hooks'
  `agent_id`/`agent_type` fields — but it does not solve the core problem: no independent
  session-scoped stream for the subagent, in either integration path.

- **Decision: Keep CLI hooks.**

- **Why:** The Agent SDK capture does not deliver a decisive win on the one problem it was
  hoped to solve — subagent linkage is nested inside the parent's `PostToolUse` event under
  the same `session_id` in both captures, so switching would not simplify the `parent_session_id`
  design conflict already flagged above. The SDK path also introduces a new regression
  (`SessionStart` not firing) and a real scope narrowing: Agent-SDK ingestion only observes
  sessions claudekanban itself launches as a library host, whereas CLI hooks passively observe
  any session a developer starts independently in their own terminal — which is the core
  product requirement (design spec's Problem framing: "running several Claude Code
  sessions/subagents in parallel"). Since CLI hooks already deliver `SessionStart`/
  `PostToolUse`/`Stop` reliably and the subagent-nesting limitation is equally present in both
  paths, there is no offsetting benefit large enough to justify losing passive-observer scope.

## Subagent running-state signal (found during Phase 2 live testing follow-up)

The official hooks docs (`https://code.claude.com/docs/en/hooks`, fetched 2026-08-09) document
`SubagentStart`/`SubagentStop` hook events, which the original Phase 0 spike never tested for
(no `SubagentStop` — and `SubagentStart` isn't even mentioned above — ever appeared in either
capture, because neither was wired into `~/.claude/settings.json` at the time). Re-verified live
in this installed Claude Code version rather than trusting the docs alone, per this project's
standing rule (see the `permission_prompt` caveat above).

- **Do `SubagentStart`/`SubagentStop` actually fire? Yes, confirmed live**, with matcher `"*"`
  wired for both. Capture: `spike/captures/subagent-lifecycle.jsonl`.

- **`SubagentStart` payload** (record 2 in the capture): `session_id` (the **parent's** own
  `session_id`, not a distinct id — same nesting pattern as everything else subagent-related in
  this project), `transcript_path`, `cwd` (the parent's cwd), `prompt_id`, `agent_id`,
  `agent_type` (e.g. `"Explore"`), `hook_event_name`. **No title/description field** — same gap
  as before; `title` still has to come from the parent's own `PostToolUse.tool_input.description`
  (Phase 2's existing design), merged in by matching id once that event arrives.

- **`SubagentStop` payload for a genuine subagent** (record 4): same fields as `SubagentStart`
  plus `permission_mode`, `effort`, `stop_hook_active`, `agent_transcript_path`,
  `last_assistant_message` (the subagent's own final report text), `background_tasks`,
  `session_crons`.

- **Correlation: confirmed reliable.** `SubagentStart.agent_id` (`a6c9862bb7993e785`) matches
  the corresponding `SubagentStop.agent_id` for the same subagent, and both match
  `tool_response.agentId` on the parent's eventual `PostToolUse` for that `Task` call — verified
  by cross-checking against claudekanban's own running backend during this same test, which
  independently synthesized a child `Session` row with `id: "a6c9862bb7993e785"` from
  `PostToolUse` at the same time. All three signals share one id scheme; `agent_id` is a safe
  primary key across `SubagentStart`/`SubagentStop`/`PostToolUse`.

- **Timing: confirmed meaningful.** `SubagentStart` fired at `13:41:29.758Z`; the matching
  `SubagentStop` fired at `13:41:46.993Z` — roughly 17 seconds of real work in between. A
  `running` status driven by `SubagentStart` would be a real, observable state, not
  as-immediate as the current `PostToolUse`-only synthesis.

- **Gotcha found, not documented anywhere: `SubagentStop` also fires with `agent_type: ""`
  (empty) for events that are not a real Task-tool subagent at all** — they appear to be a
  session's own turn-end signal when *that session itself* is running as a background job
  nested under an outer Claude Code process (this project's own dev session, running as a
  background job per its own system prompt, produced exactly this shape: `agent_id` present,
  `agent_type: ""`, `last_assistant_message` matching the session's own reply, not a subagent's).
  **Any ingest built on `SubagentStart`/`SubagentStop` must filter on `agent_type` being
  non-empty (or match `agent_id` against a previously-seen `SubagentStart`) before treating the
  event as a real child-subagent lifecycle signal** — otherwise a background-job session's own
  ordinary turn-ends get misread as phantom subagent events.

- **Verdict:** usable. `SubagentStart` → create the child `Session` row immediately with
  `status: "running"`, `owner: agent_type`, `id: agent_id`, `parentSessionId` = the event's own
  `session_id`. `SubagentStop` → update that same row to `done`/`failed` (need to determine the
  failure signal — not directly present as a boolean in this payload; worth checking whether
  `tool_response.error` on the parent's `PostToolUse`, already used today, remains the source of
  truth for failure, since `SubagentStop` itself carries no obvious success/failure field).
  `title` continues to arrive later via the parent's `PostToolUse.tool_input.description`,
  merged into the existing row by `agent_id` instead of creating a new row (current behavior).
  This resolves the "known UX gap" flagged in the Phase 1 plan's subagent-synthesis decision —
  subagent cards can now show a real `queued`/`running` frame instead of popping in already done.

## TodoWrite payload shape (spiked for the Task-entity backlog item, 2026-08-16)

Source capture: `spike/captures/todowrite.jsonl` (untracked/gitignored like other capture
files — commit with `git add -f` if kept, per this doc's existing convention). Spiked against
the currently installed Claude Code CLI (`2.1.233`), headless (`-p`) mode, using the standard
listener/hook-script harness from Task 1–2 of the Phase 0 plan, wired via a scratch
`--settings` file (not the user's real `~/.claude/settings.json`) rather than the manual
merge-and-revert step the original plan used — same underlying mechanism, just non-interactive.

- **Question asked:** does a live session emit `PostToolUse` events with `tool_name:
  "TodoWrite"` (or equivalent) when explicitly instructed to track multi-step work via a todo
  list, the way `docs/roadmap.md`'s "Task entity" backlog item and its spec
  (`.scratch/session-task-checklist/spec.md`) assume?

- **Test 1:** ran `claude -p` with a prompt explicitly instructing the session to create three
  files one at a time and "use your todo list tool" to track pending/in_progress/completed for
  each step, with `PostToolUse`/`Stop` hooks wired to the capture listener. Result: **no
  `TodoWrite` (or any todo/task-tracking) tool call appears anywhere in the capture.** Only
  `ToolSearch` (twice) and `Bash` (three times, one `touch` per file) fired as `PostToolUse`
  events. The `ToolSearch` calls (record 0: query `"select:TodoWrite"`, 0 matches out of 105
  deferred tools; record 1: query `"todo list task tracking"`, top matches were unrelated —
  `CronList`, `TaskOutput`, `TaskStop`, various MCP list tools, no `TodoWrite`) show the model
  actively looking for a todo-tracking tool and not finding one. It then fabricated a *textual*
  todo list in its final `Stop.last_assistant_message` ("**Final todo list:** 1. [completed]
  Create a.txt …") purely as prose, not as any tool call — nothing about that text reaches a
  hook payload as structured data.

- **Test 2 (direct confirmation):** asked the same session setup, in a fresh session, "Do you
  have a tool named TodoWrite or any built-in task/todo tracking tool available to you right
  now?" — response: *"No, I do not have a tool named TodoWrite — it's not in my available tool
  list, and ToolSearch confirms no such deferred tool exists either."* Consistent with Test 1.

- **Verdict for the Task-entity feature
  (`docs/roadmap.md` item 2, `.scratch/session-task-checklist/spec.md`): the feature's core
  data-source assumption does not hold in this installed environment.** There is no `TodoWrite`
  tool call to capture via `PostToolUse` — not because the payload shape differs from
  expectation (the original open question), but because **the tool itself is absent** from this
  Claude Code installation's tool set, confirmed via `ToolSearch` returning zero matches out of
  105 deferred tools and the model's own direct confirmation. This mirrors what this same
  session observed independently in its own (non-spike) conversation: a `ToolSearch` for
  `"select:TodoWrite,TaskCreate"` also returned no matches there.

- **Retest in interactive mode (2026-08-16, same day):** the headless-only caveat above was
  closed by re-running both tests in a real interactive session, driven via `tmux send-keys`/
  `capture-pane` against `claude` (no `-p`) with the same scratch `--settings` hook wiring
  (`spike/captures/todowrite-interactive.jsonl`). Same result: asked directly, the session
  answered *"No — I don't have a TodoWrite or built-in task/todo tracking tool available."*;
  given the same three-file, explicit-todo-tracking prompt as Test 1, it responded *"I don't
  have a todo list tool available in this session, so I can't track these steps with one. I'll
  create the files directly instead,"* then did so via three `Bash` `touch` calls — the capture
  file confirms only `tool_name: "Bash"` fired (3 calls), no `TodoWrite`. **Confirmed absent in
  both headless and interactive mode on this installation (Claude Code `2.1.233`).** Still not
  proof it's absent from every Claude Code distribution/config/version — only this one, tested
  two ways — but the headless-vs-interactive variable specifically is now ruled out as the
  explanation.

- **Retest against an older published version (2.1.204), same day:** installed
  `@anthropic-ai/claude-code@2.1.204` fresh via `npm install` into a scratch directory (isolated
  from the machine's global `claude` symlink, which points at `2.1.233`), ran its `install.cjs`
  postinstall to fetch the native binary, and asked it the same direct question in headless mode.
  Answer: **"No."** Same result as `2.1.233` in both modes above. **The CLI version is ruled out
  as the explanation** — this isn't a recently-removed-feature regression between these two
  releases.

- **What could not be ruled out, and why:** every test above ran against this machine's real,
  logged-in Claude Code account/config layer — `--settings <scratch-file>` *merges* additional
  hooks on top of `~/.claude/settings.json`, it does not replace it, and that file wires in
  several plugins (`superpowers`, `playwright`, `frontend-design`, etc.) and a third-party
  "Boost" integration (`~/.claude/hooks/boost-hook-claude.sh`, referenced from
  `~/.claude/settings.json`'s `PostToolUse`/`PreToolUse`/`Stop` hooks) alongside this project's
  own `hooks/forward.sh`. This session's own tool set (`105 total_deferred_tools`, `ToolSearch`,
  a long list of Gmail/Calendar/Drive/Trello/Playwright MCP tools) is clearly this
  account-specific configuration, not a stock Claude Code tool set — so it remains an open
  possibility that `TodoWrite` is present in a genuinely vanilla, unconfigured Claude Code
  install and only absent *here* because of this account/plugin/Boost layer.
  Two attempts to isolate that layer both hit a hard wall rather than a negative result:
  `--bare` mode (which explicitly skips hooks and plugin sync) requires `ANTHROPIC_API_KEY`
  authentication and refuses OAuth/keychain login — no API key is set in this environment: not
  a decisive test, just an unavailable one. Overriding `$HOME` to an empty directory (to make
  `~/.claude/settings.json` resolve to a non-existent, plugin-free path) also isolates the login
  state itself, since Claude Code's auth is stored under `$HOME/.claude`, not the OS keychain
  independently of it — the session came up logged out ("Not logged in · Please run /login")
  rather than logged in and clean. Neither path was pursued further (would require either
  supplying an API key or a fresh interactive login, both decisions for the project owner, not
  something to do unilaterally).

- **Correction, same day, after the user pointed at
  `https://code.claude.com/docs/en/agent-sdk/todo-tracking`:** the account/Boost/plugin-layer
  explanation above was speculation that turned out to be unnecessary — the docs give the real
  answer, confirmed live below. **On Opus 4.8, Sonnet 5, Fable 5, Mythos 5, and later versions
  of those families (which includes the model this entire investigation ran on), none of
  `TodoWrite`, `TaskCreate`, `TaskGet`, `TaskUpdate`, `TaskList` are available by default at
  all** — every test above ran without opting in, so absence was the documented, expected
  behavior, nothing account-specific. The opt-in is `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` in the
  session's environment (or naming a tool explicitly in `allowedTools`/`tools`).

- **Live re-verification with the opt-in set:** reran the exact three-file/todo-tracking prompt
  from Test 1, this time with `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` set in the subprocess
  environment (`spike/captures/todowrite-optin.jsonl`). Result: **`TaskCreate`/`TaskUpdate`
  fired for real** (not legacy `TodoWrite` — matches the docs' statement that Task tools are the
  default once task-tracking is enabled at all, unless `CLAUDE_CODE_ENABLE_TASKS=0` is also set
  to force the legacy tool). Confirmed live payload shapes:
  - `TaskCreate.tool_input`: `{ subject: string, description: string, activeForm: string }` —
    one call per new task (record 1: `{"subject":"Create a.txt","description":"Create empty
    file a.txt in current directory","activeForm":"Creating a.txt"}`).
  - `TaskUpdate.tool_input`: `{ taskId: string, status: "in_progress" | "completed" | ... }` —
    one call per status change; `taskId` observed as a simple sequential string (`"1"`, `"2"`,
    `"3"`), not a UUID, scoped to the session (matches the docs' note that the assigned ID
    "comes back in the matching `tool_result`", not chosen by the model).
  - Confirms the **delta model**, not a full-snapshot rewrite: 3× `TaskCreate` (one per file)
    followed by 6× `TaskUpdate` (in_progress then completed, per file) — this directly resolves
    the open question flagged in `.scratch/session-task-checklist/spec.md`'s "Out of Scope"
    section about whether the payload would be delta- or snapshot-based. It's delta-based. A
    `taskSynthesis.ts`-style module for this data source needs to accumulate/patch a per-task-id
    map (per the docs' own "Migrate to Task tools" guidance), not replace a session's task list
    wholesale on each call, as the original spec assumed for `TodoWrite`.

- **Practical limitation this doesn't remove:** the tools are still opt-in, off by default, for
  the exact model family in use. claudekanban's hooks passively observe real developer sessions
  started independently in their own terminal (the whole reason CLI hooks were chosen over the
  Agent SDK — see "Decision: Keep CLI hooks" above) — a typical developer session will not have
  `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` set unless they've deliberately configured it, so in practice
  this signal will be **absent for most real sessions**, not just theoretically possible to be
  absent. Any feature built on this data source needs to degrade gracefully (render nothing) for
  the common case where these tools never fire, the same way the current-activity indicator
  spec (`.scratch/session-current-activity/spec.md`) already does for sessions with no events of
  a given type.

- **Implication:** the original `TodoWrite`-checklist premise was wrong about the *tool name and
  payload model* (should have targeted `TaskCreate`/`TaskUpdate`, delta-based, not `TodoWrite`,
  snapshot-based) but was **not wrong that the underlying capability exists** — it does, gated
  behind an opt-in env var most real sessions won't set. This reopens whether
  `.scratch/session-task-checklist/spec.md` should be revived (retargeted at Task tools) as a
  progressive enhancement layered on top of the current-activity indicator, rather than staying
  `wontfix` — a decision for the project owner, not resolved unilaterally here.

## UserPromptSubmit payload shape (re-spiked for main-session title resolution, 2026-08-17)

Source capture: `spike/captures/user-prompt-submit.jsonl` (untracked/gitignored like other
capture files). Spiked against the currently installed Claude Code CLI (`2.1.233`), headless
(`-p`) mode, using the same scratch-`--settings` harness as the `TodoWrite` re-spike above
(temporary hook script at `spike/hooks/user-prompt-submit.sh`, forwarding to the standard
listener on `127.0.0.1:8787`).

- **Question asked:** does `UserPromptSubmit` fire on this installed CLI version, and if so,
  what field carries the user's prompt text? This directly **supersedes** the original Phase 0
  finding above ("Hook events and payload fields") that "no ... `UserPromptSubmit` events
  appear anywhere in this capture" — that finding was never pinned to a CLI version or tested
  as a targeted question, only observed as absent from an unrelated general capture, so per
  this doc's own re-test discipline (see the `SubagentStart`/`SubagentStop` and `TodoWrite`
  sections above) it needed live re-verification before being trusted as still true.

- **Test 1 (single-line prompt):** ran `claude -p "Fix the login bug in the auth module"` with
  only a `UserPromptSubmit` hook wired via scratch settings. Result: **the event fires.**
  Captured payload:
  ```json
  {
    "session_id": "80534d53-d0b6-43cd-bd1f-7ec2e64eb793",
    "transcript_path": "/Users/nimrodo/.claude/projects/-Users-nimrodo-workspace-claudekanban/80534d53-d0b6-43cd-bd1f-7ec2e64eb793.jsonl",
    "cwd": "/Users/nimrodo/workspace/claudekanban",
    "prompt_id": "2a597fb2-828a-4827-874e-e62c129ee064",
    "permission_mode": "default",
    "hook_event_name": "UserPromptSubmit",
    "prompt": "Fix the login bug in the auth module"
  }
  ```

- **Test 2 (multiline prompt):** ran `claude -p` with a prompt containing `\n\n` and a `- `
  bullet line, same hook wiring. Result: the prompt text arrives with raw `\n` characters
  inside the JSON string value, not split into multiple events or otherwise encoded:
  ```json
  "prompt": "Fix the login bug\n\nHere is more context about the issue:\n- it fails on line 42"
  ```

- **Verdict — docs disagreed with the live payload on the field name.** The official hooks
  docs (`https://code.claude.com/docs/en/hooks`, fetched the same day) describe this event's
  prompt-text field as **`user_input`**. The live capture shows the actual field is **`prompt`**
  — `user_input` does not appear anywhere in the payload. This is exactly the scenario this
  project's spike-first discipline exists to catch: the docs were wrong (or describe a
  different/future version) for this specific field name, even though everything else about
  the event (name, firing behavior, other fields — `session_id`, `transcript_path`, `cwd`,
  `prompt_id`, `permission_mode`) matched the docs. **Any implementation must read
  `payload.prompt`, not `payload.user_input`.**

- **Practical implication for main-session title resolution:** `UserPromptSubmit` is confirmed
  live and usable — no transcript-file-parsing fallback is needed. `payload.prompt` carries the
  raw first-line-extractable prompt text directly, newlines intact for first-line splitting.

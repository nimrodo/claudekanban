# Phase 0 Findings

Source captures: `spike/captures/cli-hooks.jsonl`. (`spike/captures/agent-sdk.jsonl` does not
exist yet — Task 4, the Agent SDK spike, has not been run. The comparison section below is
left pending until that capture exists.)

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
  against the raw capture (record index 8 in `cli-hooks.jsonl`). There is no separate
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

## CLI hooks vs. Agent SDK — ingestion decision

Not yet compared — Task 4 (Agent SDK spike) has not been run. This section will be completed
after Task 4.

- CLI-hooks capture: exposes `SessionStart`, `PostToolUse`, and `Stop` events with rich
  per-tool-call payloads including a working `recap` source (`Stop.last_assistant_message`)
  and a way to detect subagent spawns (`PostToolUse` with `tool_name: "Agent"`), but folds all
  subagent activity into the parent session's event stream rather than giving subagents their
  own session-scoped hook stream.
- Agent SDK capture: not yet available.
- **Decision:** Pending Task 4.
- **Why:** Pending Task 4.

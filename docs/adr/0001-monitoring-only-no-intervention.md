# Monitoring-only in the web app; intervention deferred to a future VSCode extension

claudekanban's web app only observes Claude Code sessions — it never acts on them. No
`POST /intervene` endpoint, no session-side polling hook, no UI controls that reach into
a running session (stop it, inject a message, remotely approve a permission prompt,
retry, or resume). This was a live decision, not an oversight: the `intervention` table
in `src/store/schema.sql` already anticipated five intervention types
(`cancel`/`guidance`/`approval_request`/`retry`/`resume`) from the original design spec,
and one of them (`cancel`) was investigated live and found technically feasible — a
same-machine backend can correlate a session's `cwd`/`started_at` against `ps aux`,
recover a candidate process's cwd via `lsof -a -p <pid> -d cwd`, and send a real `kill`
signal. It was rejected anyway, because it would be the first time claudekanban writes
back into a session instead of only reading from it — a real shift away from the passive,
install-anywhere observation this project already chose once before (see
`spike/findings.md`, "Decision: Keep CLI hooks").

The table stays in the schema, unmodified, as deferred scaffolding: a future *real*
(non-demo) VSCode extension — see `docs/roadmap.md` item 5 — would make `cancel` and
`guidance` reliable via `vscode.Terminal`'s `.processId` and `.sendText()`, for sessions
running in a VSCode-managed terminal, in a way the standalone web app never can.

## Considered Options

- **`cancel`** — confirmed technically feasible in the web app today (`ps`/`lsof`
  correlation + `kill`), but heuristic (ambiguous when two sessions share a cwd) and
  only reaches top-level sessions (subagents share their parent's OS process, per
  `spike/findings.md`'s "Subagent linkage" findings — there's no separate PID to kill).
- **`approval_request`** — plausible only if Claude Code's `PermissionRequest` hook will
  block waiting for a remote answer; unconfirmed either way, not investigated further.
- **`guidance`** — no general mechanism in the web app; the only working technique found
  was driving a `tmux`-hosted session via `tmux send-keys`, which only helps for that
  narrow case.
- **`retry`/`resume`** — both depend on `claude --resume`, which `spike/findings.md`
  already flags as untested and fully open.

None of these were rejected for being infeasible across the board — `cancel` works
today, and `cancel`/`guidance` would work well in a VSCode host. They were rejected for
the web app specifically, on identity grounds: "just a monitoring app" was the deciding
line, not a technical dead end.

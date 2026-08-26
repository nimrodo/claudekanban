# claudekanban

A real-time kanban-style console for observing Claude Code sessions and their subagents.

## Language

**Title**:
A session's card-headline label, derived once from the first `UserPromptSubmit` event's prompt text (first line, untruncated in storage) and never overwritten afterward, even across later unrelated prompts in the same session. Distinct from **Task** (see below) — a title identifies *what a session's card is labeled*, not *tracked progress within it*.
_Avoid_: Name, label, headline

**Task**:
A future, separate entity (planned, not yet built) representing one item in a session's opt-in `TaskCreate`/`TaskUpdate` checklist. A session may have both a Title and a set of Tasks simultaneously — they are independent concepts that happen to both render on the same card.
_Avoid_: Todo, checklist item

**Standalone server**:
The Express/SQLite backend process started and stopped directly by the user (`npm run dev:server`, or a built binary run manually). Its port and DB path are fixed or user-supplied via env vars, and its lifecycle is independent of any editor.
_Avoid_: The server, backend (when the distinction from Managed server matters)

**Managed server**:
The same Express/SQLite backend process, but started and stopped by the VSCode extension instead of the user — spawned on "Open Board", killed on extension deactivation or window close. Bound to one ephemeral port and one workspace; never shared across workspaces/windows. Its DB path defaults to a location scoped to that workspace under the extension's own storage, distinct from any Standalone server's DB file in the same directory, but is user-configurable to point at the same file if shared history across both modes is wanted.
_Avoid_: Extension server, embedded server

**Board**:
The existing React frontend UI. Unchanged in meaning by the extension work — a Board instance, wherever it's rendered (browser tab or VSCode Webview panel), is scoped only by which server it's pointed at, never by an independent filter. One Managed server ⇒ one workspace's sessions ⇒ one Board's worth of visible data.
_Avoid_: Dashboard, console (when referring to the frontend specifically, to avoid drift from this repo's own top-level description)

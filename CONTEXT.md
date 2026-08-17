# claudekanban

A real-time kanban-style console for observing Claude Code sessions and their subagents.

## Language

**Title**:
A session's card-headline label, derived once from the first `UserPromptSubmit` event's prompt text (first line, untruncated in storage) and never overwritten afterward, even across later unrelated prompts in the same session. Distinct from **Task** (see below) — a title identifies *what a session's card is labeled*, not *tracked progress within it*.
_Avoid_: Name, label, headline

**Task**:
A future, separate entity (planned, not yet built) representing one item in a session's opt-in `TaskCreate`/`TaskUpdate` checklist. A session may have both a Title and a set of Tasks simultaneously — they are independent concepts that happen to both render on the same card.
_Avoid_: Todo, checklist item

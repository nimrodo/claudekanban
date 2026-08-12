# claudekanban

A real-time kanban-style console for observing Claude Code sessions. Claude
Code hooks forward hook payloads to a local Express backend, which persists
them to SQLite and pushes live updates to a React board over SSE.

## How it works

```
Claude Code hook event → hooks/on-*.sh (curl POST to /ingest)
  → backend ingest/domain synthesis → SQLite
  → SSE broadcast → React board (live update)
```

## Setup

```bash
npm install
npm run dev:server    # backend, http://localhost:4317 (CLAUDEKANBAN_PORT)
npm run dev:frontend  # Vite dev server for the board UI
```

To actually see data, wire the scripts in `hooks/` into a Claude Code
`settings.json` (project or user-level) so hook events get forwarded to the
backend:

```bash
npm run hooks:install            # prompts for user-level vs. project-level
npm run hooks:install -- --user  # or --project, non-interactively
npm run hooks:install -- --dry-run   # preview without writing
npm run hooks:install -- --remove    # cleanly uninstall
```

This merges the 7 claudekanban hook entries into the target `settings.json`
without touching any other hooks already registered there, backing up the
file to `settings.json.bak` before writing.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev:server` | Run the backend (tsx watch) |
| `npm run dev:frontend` | Run the Vite dev server for the board UI |
| `npm run build` | Typecheck (`tsc -p tsconfig.json`) then `vite build` |
| `npm test` | Run the full vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npx vitest run <file>` | Run a single test file |
| `npx vitest run -t "<name>"` | Run a single test by name |
| `bash hooks/hooks.test.sh` | Hook smoke test — spins up a mock server on port 4317 and verifies every script in `hooks/` forwards stdin correctly |

## Architecture

Sessions and their subagents are tracked in a single SQLite table with two
lifecycles (top-level session vs. nested subagent), synthesized from hook
payloads by pure domain functions and pushed to the frontend over SSE. See
[`CLAUDE.md`](./CLAUDE.md) for the full data-flow and domain-model
breakdown, and `docs/superpowers/specs/2026-08-07-operations-console-design.md`
for the living design spec.

## Status

Active, spike-driven development — see `docs/superpowers/` for the
brainstorm → spec → grilling → plan → execution workflow this project
follows, and `spike/findings.md` for confirmed Claude Code hook payload
behavior. Not a polished 1.0.

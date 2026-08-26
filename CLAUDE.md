# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

claudekanban is a real-time kanban-style console for observing Claude Code sessions. Claude Code hooks (`hooks/*.sh`) forward hook payloads via `curl` to a local Express backend, which persists them to SQLite and pushes live updates to a React frontend over SSE.

## Commands

- `npm run dev:server` — run the backend (tsx watch) on `CLAUDEKANBAN_PORT` (default 4317)
- `npm run dev:frontend` — run the Vite dev server for the board UI
- `npm run build` — typecheck (`tsc -p tsconfig.json`) then `vite build`
- `npm test` — run the full vitest suite once
- `npm run test:watch` — vitest in watch mode
- Single test file: `npx vitest run src/domain/subagentSynthesis.test.ts`
- Single test by name: `npx vitest run -t "test name substring"`
- Hook smoke test: `bash hooks/hooks.test.sh` — spins up a mock server on port 4317 and verifies every script in `hooks/` forwards stdin correctly. If it fails with "did not forward payload", check `lsof -i :4317` for a stray `dev:server` process already bound to that port.
- `npm run hooks:install` — merges the 8 claudekanban hook entries (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SubagentStart`, `SubagentStop`, `Notification`, `PermissionRequest`) into a Claude Code `settings.json`, without touching any other hooks already registered there. Flags: `--user` / `--project` / `--path <file>` to pick the target non-interactively, `--dry-run` to preview, `--remove` to uninstall, `--yes` to skip the confirm prompt (required if stdin isn't a TTY). Logic lives in `scripts/install-hooks-lib.ts` (pure, unit-tested — `scripts/install-hooks-lib.test.ts`) with a thin CLI wrapper in `scripts/install-hooks.ts`; typechecked separately via `npx tsc -p tsconfig.scripts.json` since it's outside `src/`'s `rootDir`.

## Architecture

**Data flow:** Claude Code hook event → `hooks/on-*.sh` (curl POST of stdin JSON to `/ingest`) → `src/ingest/ingest.ts` (`createIngestHandler`) → domain synthesis functions in `src/domain/` → `src/store/sessionStore.ts` / `eventStore.ts` (better-sqlite3, schema in `src/store/schema.sql`) → `src/domain/changeEmitter.ts` emits `session-changed` → `src/stream/broadcaster.ts` pushes over the `/stream` SSE endpoint → frontend `useLiveState`/`useSessionDetail` hooks refetch via `src/api/routes.ts` (`GET /api/state`, `GET /api/sessions/:id`).

**Sessions vs. subagents — one table, two lifecycles.** Both live in the same `Session` row shape (`src/store/sessionStore.ts`). A top-level session is created/updated by `SessionStart`/`Stop` hooks. A subagent ("child" session, `parentSessionId` set) has its own live lifecycle as of the `subagent-live-status` work:
- `SubagentStart` → `synthesizeSubagentStart` creates a `running` row keyed by `agent_id` (never overwrites an existing row — duplicate/late delivery is a no-op, not a clobber).
- `SubagentStop` → `synthesizeSubagentStop` transitions that row to `done` (never regresses an already-`failed` row).
- The parent's `PostToolUse` for the same call still carries the only source of the subagent's title (`tool_input.description`) and failure signal (`tool_response.error`); `mergeSubagentTitle` merges those into the existing row once it's found by `agent_id`. If no row exists yet when `PostToolUse` arrives (e.g. `SubagentStart` hook not installed), `synthesizeSubagentSession` falls back to full synthesis from that single event.
- `SubagentStop` events with an empty `agent_type` are a false-positive pattern (the parent session's own turn-end when it runs as a background job) and must be filtered, not treated as a real subagent stop.

Ingest wiring for all of this lives in `src/ingest/ingest.ts`; the domain logic (pure functions, no I/O) lives in `src/domain/subagentSynthesis.ts` and is unit-tested directly.

**Frontend:** `Board.tsx` renders top-level session cards (`SessionCard.tsx`) with nested child (subagent) cards, styled by `data-status` in `board.css` reusing the `--ck-running`/`--ck-done`/`--ck-failed` tokens. Clicking a card opens `Drawer.tsx` (detail view: timeline built by `eventSummary.ts` from raw events, via `useSessionDetail`). `Transport.ts` / `HttpSseTransport.ts` is the frontend's only interface to the backend — swap implementations there for testing.

**Spike-first workflow:** Before trusting an undocumented or newly-documented Claude Code hook behavior, this project verifies it live rather than trusting docs — see `spike/findings.md` for confirmed hook payload shapes and gotchas (e.g. `Notification`'s `permission_prompt` type never actually fires in some installed versions; `SubagentStop` fires with empty `agent_type` for background-job sessions). Check there before assuming a hook field exists.

## Design docs

Feature work follows brainstorm → spec → grilling → plan → subagent-driven execution, tracked under `docs/superpowers/`. `docs/superpowers/specs/2026-08-07-operations-console-design.md` is the living domain model / state machine spec — update it when a synthesis rule changes, not just the code.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `nimrodo/claudekanban`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical role strings (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

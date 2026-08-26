# VSCode extension spawns the standalone server as a child process, not in-process

The VSCode extension (Managed server, see `CONTEXT.md`) runs the existing Express/SQLite
backend by spawning it as a child Node process, rather than importing and running it
directly inside the extension host. This was chosen over in-process execution because
`better-sqlite3` is a native N-API addon distributed as prebuilt binaries keyed to Node's
ABI version; VSCode's extension host runs on Electron's bundled Node, whose ABI differs
from a standalone Node install, so in-process execution would require rebuilding/rebundling
`better-sqlite3` per target platform as part of extension packaging (e.g. via
`electron-rebuild`). Spawning the existing server as a child process — using the same
Node binary and package the Standalone server already uses — sidesteps that ABI mismatch
entirely and requires zero changes to backend code.

This also directly serves the requirement to keep the Standalone server working
unmodified alongside the extension: the Managed server *is* the Standalone server's code,
launched differently, not a fork of it.

## Considered Options

- **In-process** (import `src/server.ts` directly into the extension host): rejected due
  to the `better-sqlite3` ABI mismatch above.
- **Pure-JS/WASM SQLite swap** (e.g. `sql.js`) for the extension build only: rejected —
  would mean two divergent storage implementations to maintain, contradicting the
  max-shared-code goal.

## Consequences

- The extension depends on a `node` binary being resolvable at runtime to spawn the
  child process (same assumption the CLI scripts already make).
- Managed and Standalone servers are two different *lifecycles* over the same code, not
  two codebases — see `CONTEXT.md`'s Standalone server / Managed server distinction.
- This is observation-only scope, consistent with ADR-0001: this extension does not
  pick up the `cancel`/`guidance` intervention capability ADR-0001 deferred to "a future
  real VSCode extension" — that remains open for a later iteration, not this one.

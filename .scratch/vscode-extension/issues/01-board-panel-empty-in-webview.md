Status: resolved

# Board panel shows no session data inside the VSCode Webview

## Summary

After wiring up the VSCode extension (Open Board command, Managed server child process, hooks install), the Board panel rendered but showed no sessions — even when the Managed server's `/api/state` endpoint, checked directly via `curl`, returned real session data forwarded by hooks running in a real workspace (`MongoKeeperPy`).

## Root causes found (two independent bugs, both fixed)

1. **CSP blocked the inline base-URL script.** `extension/boardPanel.ts`'s `buildHtml()` set `script-src ${cspSource}` with no `'unsafe-inline'` or nonce, but the HTML also embeds an inline `<script>` block that sets `window.__CLAUDEKANBAN_BASE_URL__`. The CSP silently blocked that inline script, so the global was never set, and `main.tsx` fell back to an empty base URL — every `fetch`/`EventSource` call resolved against the `vscode-webview://...` origin itself instead of the managed server. Symptom: an `EventSource` error on `/stream` with no status code and no message.

   Fixed in commit `69bccb2` — switched to a per-render nonce shared by the inline script and the asset `<script>` tags (`script-src 'nonce-${nonce}'`).

2. **No CORS headers.** `src/server.ts` never set any CORS headers, since the Standalone flow only ever goes through Vite's same-origin dev proxy. The Webview is a genuinely cross-origin context (`vscode-webview://...` vs `http://localhost:{port}`), so once bug #1 was fixed, the browser's CORS policy silently blocked the `fetch`/`EventSource` responses anyway.

   Fixed in commit `676cf1c` — added `src/corsMiddleware.ts` (`allowAllOrigins`) applied to all routes in `server.ts`. Low-risk since the server only ever binds to localhost and is never exposed to the network; both request types this app makes (`fetch` GET, `EventSource`) are CORS-simple requests, so no preflight/`OPTIONS` handling was needed.

Two earlier bugs in the same debugging session, already fixed before these:
- `process.execPath` inside the extension host is Electron, not plain Node — spawning the managed server needed `ELECTRON_RUN_AS_NODE=1` (commit `5ceba83`).
- `context.storageUri`'s directory isn't pre-created by VSCode — `better-sqlite3` needs the parent directory to exist (commit `a495891`).
- Hook scripts run in a separate terminal process with no way to learn the Managed server's OS-assigned ephemeral port — added a `.claude/claudekanban-port` file the extension writes and the hooks read as a fallback (commit `a009a85`).

## What's still needed

Manual verification in the Extension Development Host: rebuild (F5), reopen the Board, and confirm session cards from a real workspace now render live. This was in progress when the session was interrupted to file this ticket — needs a human to complete the check (can't be done AFK since it requires interacting with VSCode's UI).

## Why `ready-for-human` and not `ready-for-agent`

Verification requires manual interaction with the VSCode Extension Development Host (pressing F5, watching a panel render, reading dev tools output) — not something a headless agent can do.

## Comments

Confirmed fixed: after rebuilding (F5) and reopening the Board, session cards from the real workspace render live in the Webview.

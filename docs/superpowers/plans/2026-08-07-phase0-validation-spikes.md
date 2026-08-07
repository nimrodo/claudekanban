# Phase 0 Validation Spikes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Answer the open questions that gate every later phase of claudekanban — what Claude Code hook payloads actually contain, whether subagent identity/parent linkage is exposed, how `claude --resume` behaves, and whether the Claude Agent SDK's native hooks beat CLI hooks for ingestion — by capturing real payloads from a real session, not guessing.

**Architecture:** Two throwaway, dependency-free spike harnesses that each capture raw JSON to a file for inspection: (1) a plain Node `http` listener fed by Claude Code CLI hook scripts, and (2) a small Agent SDK script that launches a session and logs its native hook callbacks. No database, no framework — this phase produces a findings document, not shippable code.

**Tech Stack:** Node.js (built-in `http`/`fs` only, no npm dependencies) for the CLI-hook listener; `@anthropic-ai/claude-agent-sdk` for the Agent SDK spike (installed only for that one script).

## Global Constraints

- This is throwaway exploration code per the design spec (`docs/superpowers/specs/2026-08-07-operations-console-design.md`, Phase 0) — no tests-as-regression-suite requirement; "verification" in each task is manual inspection of captured output, not an assertion suite.
- All captured payloads go to `spike/captures/` as newline-delimited JSON (one JSON object per line) so they're diffable and greppable.
- Do not delete or overwrite `spike/captures/*.jsonl` files between tasks — later tasks (and the findings doc) read earlier captures.
- `spike/` is scaffolding for this plan only — nothing in it is imported by Phase 1 code. Do not add it to any future `package.json` `main`/exports.

---

### Task 1: Scaffold the spike directory and capture listener

**Files:**
- Create: `spike/listener.js`
- Create: `spike/captures/.gitkeep`
- Create: `.gitignore`

**Interfaces:**
- Produces: an HTTP server listening on `http://127.0.0.1:8787/hook` that accepts `POST` with a JSON body and appends `{receivedAt: <ISO8601>, headers: <object>, body: <parsed JSON>}\n` to `spike/captures/<capture-file>.jsonl`, where `<capture-file>` is given by the `CAPTURE_FILE` env var (default `cli-hooks`). Responds `200 {"ok": true}` on success, `400 {"ok": false, "error": <string>}` on invalid JSON.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
spike/captures/*.jsonl
!spike/captures/.gitkeep
```

- [ ] **Step 2: Create `spike/captures/.gitkeep`**

Empty file — keeps the directory tracked in git while `.jsonl` capture files themselves stay untracked (they're raw session data, not something to commit).

```
```

- [ ] **Step 3: Write `spike/listener.js`**

```javascript
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8787;
const captureFile = process.env.CAPTURE_FILE || "cli-hooks";
const captureDir = path.join(__dirname, "captures");
const capturePath = path.join(captureDir, `${captureFile}.jsonl`);

fs.mkdirSync(captureDir, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/hook") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
    return;
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });

  req.on("end", () => {
    let body;
    try {
      body = raw.length > 0 ? JSON.parse(raw) : {};
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `invalid JSON: ${err.message}` }));
      return;
    }

    const record = {
      receivedAt: new Date().toISOString(),
      headers: req.headers,
      body,
    };
    fs.appendFileSync(capturePath, `${JSON.stringify(record)}\n`);

    console.log(`[listener] captured ${body.hook_event_name || body.event || "event"} -> ${capturePath}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[listener] listening on http://127.0.0.1:${PORT}/hook, writing to ${capturePath}`);
});
```

- [ ] **Step 4: Verify the listener runs and captures a manual request**

Run in one terminal:
```bash
node spike/listener.js
```

In a second terminal:
```bash
curl -s -X POST http://127.0.0.1:8787/hook -H "Content-Type: application/json" -d '{"hook_event_name":"Test","foo":"bar"}'
cat spike/captures/cli-hooks.jsonl
```

Expected: curl returns `{"ok":true}`, and `spike/captures/cli-hooks.jsonl` contains one line with `"body":{"hook_event_name":"Test","foo":"bar"}`. Stop the listener (Ctrl-C) before continuing.

- [ ] **Step 5: Commit**

```bash
git add spike/listener.js spike/captures/.gitkeep .gitignore
git commit -m "spike: add capture listener for hook payload inspection"
```

---

### Task 2: Wire Claude Code CLI hooks to the listener

**Files:**
- Create: `spike/hooks/session-start.sh`
- Create: `spike/hooks/post-tool-use.sh`
- Create: `spike/hooks/stop.sh`
- Create: `spike/claude-settings-snippet.json`

**Interfaces:**
- Consumes: the listener from Task 1 at `http://127.0.0.1:8787/hook`.
- Produces: three executable shell scripts, each reading the hook's JSON payload from stdin (per Claude Code's hook protocol — the hook receives the event JSON on stdin) and POSTing it verbatim to the listener; a settings snippet showing how to register them.

- [ ] **Step 1: Write `spike/hooks/session-start.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cat | curl -s -X POST http://127.0.0.1:8787/hook \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 2: Write `spike/hooks/post-tool-use.sh`** (identical body — separate file so each hook type is independently traceable in logs/permissions)

```bash
#!/usr/bin/env bash
set -euo pipefail
cat | curl -s -X POST http://127.0.0.1:8787/hook \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 3: Write `spike/hooks/stop.sh`** (identical body)

```bash
#!/usr/bin/env bash
set -euo pipefail
cat | curl -s -X POST http://127.0.0.1:8787/hook \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null
```

- [ ] **Step 4: Make all three scripts executable**

```bash
chmod +x spike/hooks/session-start.sh spike/hooks/post-tool-use.sh spike/hooks/stop.sh
```

- [ ] **Step 5: Write `spike/claude-settings-snippet.json`**

This is the hook registration block to add to `~/.claude/settings.json` (or the project's `.claude/settings.json`) for the duration of the spike — not applied automatically, copied in by hand in Task 3 so the real settings file is never touched by this plan.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/nimrodo/workspace/claudekanban/spike/hooks/session-start.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "/Users/nimrodo/workspace/claudekanban/spike/hooks/post-tool-use.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "/Users/nimrodo/workspace/claudekanban/spike/hooks/stop.sh" }
        ]
      }
    ]
  }
}
```

- [ ] **Step 6: Verify script syntax without a live session**

```bash
echo '{"hook_event_name":"PostToolUse","tool_name":"Read"}' | spike/hooks/post-tool-use.sh
```

Expected: no output, no error (curl target isn't running yet, so this will fail to connect — that's fine here; this step only confirms the script itself has no syntax errors). Run `bash -n spike/hooks/session-start.sh spike/hooks/post-tool-use.sh spike/hooks/stop.sh` and confirm no output (no syntax errors).

- [ ] **Step 7: Commit**

```bash
git add spike/hooks/ spike/claude-settings-snippet.json
git commit -m "spike: add hook scripts forwarding stdin payloads to listener"
```

---

### Task 3: Capture a real session's hook payloads, including a subagent spawn

**Files:**
- Modify: none (this task is a manual capture run against real Claude Code)
- Create: `spike/captures/cli-hooks.jsonl` (generated by running the listener + a real session — not hand-written)

**Interfaces:**
- Consumes: the listener (Task 1) and hook scripts (Task 2).
- Produces: `spike/captures/cli-hooks.jsonl` populated with real `SessionStart`, `PostToolUse`, and `Stop` payloads from a real Claude Code session that spawns at least one subagent via the `Task` tool.

- [ ] **Step 1: Merge the settings snippet into the active Claude Code settings**

Open `~/.claude/settings.json` (create it if absent) and merge in the `hooks` block from `spike/claude-settings-snippet.json`. If a `hooks` key already exists, merge at the event-name level rather than overwriting it — preserve any existing hooks.

- [ ] **Step 2: Start the listener**

```bash
CAPTURE_FILE=cli-hooks node spike/listener.js
```

Leave this running in its own terminal for the rest of this task.

- [ ] **Step 3: Run a real Claude Code session that spawns a subagent**

In a separate terminal, in any project directory, start `claude` and give it a prompt that forces at least one `Task` tool invocation — e.g.:

```
Use the Explore agent to find where the word "TODO" appears in this repository, then tell me what it found.
```

Let the session run to completion (`Stop` should fire). Watch the listener terminal — you should see log lines for `SessionStart`, multiple `PostToolUse`, and `Stop`.

- [ ] **Step 4: Verify captures landed**

```bash
wc -l spike/captures/cli-hooks.jsonl
grep -o '"hook_event_name":"[^"]*"' spike/captures/cli-hooks.jsonl | sort | uniq -c
```

Expected: at least one line each for `SessionStart`, `PostToolUse`, and `Stop`. If `Stop` is missing, the session didn't reach a natural end — re-run Step 3 and let it finish.

- [ ] **Step 5: Stop the listener and remove the spike hooks from settings**

Ctrl-C the listener. Revert `~/.claude/settings.json` to remove the spike `hooks` block added in Step 1 (or comment it out) so it doesn't fire on unrelated future sessions.

- [ ] **Step 6: Commit the capture**

```bash
git add -f spike/captures/cli-hooks.jsonl
git commit -m "spike: capture real CLI hook payloads including a subagent spawn"
```

(`-f` is required because `.gitignore` excludes `*.jsonl` by default — this one capture is committed deliberately as the evidence artifact this plan produces.)

---

### Task 4: Agent SDK side-by-side spike

**Files:**
- Create: `spike/package.json`
- Create: `spike/agent-sdk-spike.mjs`
- Create: `spike/captures/agent-sdk.jsonl` (generated by running the script — not hand-written)

**Interfaces:**
- Consumes: `@anthropic-ai/claude-agent-sdk` (TypeScript/JS package, installed locally in `spike/`).
- Produces: `spike/captures/agent-sdk.jsonl`, one JSON line per hook callback invocation, in the same `{receivedAt, body}` shape as Task 1's captures (so the two files are directly diffable), covering the same event types as Task 3's CLI-hook capture.

- [ ] **Step 1: Create `spike/package.json`**

```json
{
  "name": "claudekanban-spike",
  "private": true,
  "type": "module",
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0"
  }
}
```

- [ ] **Step 2: Install the dependency**

```bash
cd spike && npm install && cd ..
```

Verify: `spike/node_modules/@anthropic-ai/claude-agent-sdk` exists.

- [ ] **Step 3: Write `spike/agent-sdk-spike.mjs`**

```javascript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { appendFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const captureDir = path.join(__dirname, "captures");
const capturePath = path.join(captureDir, "agent-sdk.jsonl");
mkdirSync(captureDir, { recursive: true });

function capture(body) {
  appendFileSync(capturePath, `${JSON.stringify({ receivedAt: new Date().toISOString(), body })}\n`);
  console.log(`[agent-sdk-spike] captured ${body.hookEventName || body.type || "event"}`);
}

const hookCallback = (eventName) => async (input) => {
  capture({ hookEventName: eventName, input });
  return { continue: true };
};

const result = query({
  prompt:
    "Use the Explore agent to find where the word TODO appears in this repository, then tell me what it found.",
  options: {
    hooks: {
      SessionStart: [{ hooks: [hookCallback("SessionStart")] }],
      PostToolUse: [{ matcher: "*", hooks: [hookCallback("PostToolUse")] }],
      Stop: [{ hooks: [hookCallback("Stop")] }],
    },
  },
});

for await (const message of result) {
  capture({ hookEventName: "sdk_message", message });
}

console.log(`[agent-sdk-spike] done, captures at ${capturePath}`);
```

- [ ] **Step 4: Run the spike script from a directory containing at least one file with the word TODO in it**

```bash
node spike/agent-sdk-spike.mjs
```

Let it run to completion.

- [ ] **Step 5: Verify captures landed**

```bash
wc -l spike/captures/agent-sdk.jsonl
grep -o '"hookEventName":"[^"]*"' spike/captures/agent-sdk.jsonl | sort | uniq -c
```

Expected: entries for `SessionStart`, `PostToolUse`, `Stop`, and `sdk_message`.

- [ ] **Step 6: Commit**

```bash
git add -f spike/package.json spike/agent-sdk-spike.mjs spike/captures/agent-sdk.jsonl
git commit -m "spike: capture Agent SDK native hook payloads for comparison"
```

(Do not commit `spike/node_modules/` — already excluded by `.gitignore`'s `node_modules/` entry from Task 1.)

---

### Task 5: Write the findings document and record the ingestion decision

**Files:**
- Create: `spike/findings.md`
- Modify: `docs/superpowers/specs/2026-08-07-operations-console-design.md` (Open Questions section)

**Interfaces:**
- Consumes: `spike/captures/cli-hooks.jsonl` and `spike/captures/agent-sdk.jsonl` from Tasks 3–4.
- Produces: `spike/findings.md`, the artifact the Phase 1 implementation plan will cite for exact field names, event names, and the CLI-hooks-vs-Agent-SDK decision.

- [ ] **Step 1: Extract the distinct payload shapes for inspection**

```bash
python3 -c "
import json
for name in ['cli-hooks', 'agent-sdk']:
    print(f'=== {name} ===')
    seen = set()
    with open(f'spike/captures/{name}.jsonl') as f:
        for line in f:
            rec = json.loads(line)
            body = rec['body']
            key = body.get('hook_event_name') or body.get('hookEventName') or body.get('type')
            if key not in seen:
                seen.add(key)
                print(f'--- {key} ---')
                print(json.dumps(body, indent=2)[:2000])
"
```

Read the output carefully — this is the raw material for the findings doc.

- [ ] **Step 2: Write `spike/findings.md`**

Fill in every `<...>` placeholder from the actual captured data inspected in Step 1 — do not leave any placeholder in the committed file.

```markdown
# Phase 0 Findings

Source captures: `spike/captures/cli-hooks.jsonl`, `spike/captures/agent-sdk.jsonl`.

## Hook events and payload fields (CLI hooks)

| Event | Present? | Key fields observed |
|---|---|---|
| SessionStart | <yes/no> | <field list, e.g. session_id, cwd, model> |
| PostToolUse | <yes/no> | <field list, e.g. session_id, tool_name, tool_input, tool_response> |
| Stop | <yes/no> | <field list — note whether a final-message / transcript field exists for `recap`> |

## Subagent linkage

- Does any payload carry a `subagent_type` or equivalent field? <yes/no, quote the field name and an example value>
- Does any payload carry a parent/session linkage field (e.g. a distinct session id for the subagent vs. the main session)? <yes/no, quote the field name>
- Verdict for the `owner` column design (spec §Domain model): <can be populated from subagent_type as designed / needs fallback because field X is absent>

## Stop payload / recap

- Field carrying the final assistant message, if any: <field name, or "none found">
- Verdict for the `recap` column design: <usable as-is / needs adjustment, and how>

## Resume mechanics

- Command tested: `claude --resume <session-id>` (or actual command used)
- Observed behavior: <what happened>
- Verdict for the v2 "resume" intervention design: <confirmed workable / needs redesign, and how>

## CLI hooks vs. Agent SDK — ingestion decision

- CLI-hooks capture: <summary of what it exposed vs. didn't>
- Agent SDK capture: <summary of what it exposed vs. didn't, especially subagent identity>
- **Decision:** <Keep CLI hooks / Switch to Agent SDK-launched sessions>
- **Why:** <one or two sentences tying the decision to the comparison above>
```

- [ ] **Step 3: Update the design spec's Open Questions section with the resolved answers**

In `docs/superpowers/specs/2026-08-07-operations-console-design.md`, under `## Open questions`, append a line under each of questions 1–4 (hook events/fields, resume mechanism, Agent identity, review-state signal) pointing to the resolution: `**Resolved (Phase 0):** see spike/findings.md — <one-line answer>`.

- [ ] **Step 4: Commit**

```bash
git add spike/findings.md docs/superpowers/specs/2026-08-07-operations-console-design.md
git commit -m "spike: record Phase 0 findings and resolve open questions"
```

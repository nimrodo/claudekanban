#!/usr/bin/env bash
set -euo pipefail
PORT="${CLAUDEKANBAN_PORT:-$(cat .claude/claudekanban-port 2>/dev/null || echo 4317)}"
cat | curl -s -X POST "http://127.0.0.1:${PORT}/ingest" \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null

#!/usr/bin/env bash
set -euo pipefail
cat | curl -s -X POST http://127.0.0.1:8787/hook \
  -H "Content-Type: application/json" \
  --data-binary @- \
  > /dev/null

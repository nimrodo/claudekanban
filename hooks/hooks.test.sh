#!/usr/bin/env bash
set -euo pipefail

TMP_LOG="$(mktemp)"
trap 'rm -f "$TMP_LOG"' EXIT

python3 -c "
import http.server, threading, sys, time
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers['Content-Length'])
        body = self.rfile.read(length)
        with open('$TMP_LOG', 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.end_headers()
    def log_message(self, *args):
        pass
server = http.server.HTTPServer(('127.0.0.1', 4317), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
time.sleep(10)
" &
LISTENER_PID=$!

# Poll for server readiness with timeout (up to 5 seconds)
for i in {1..50}; do
  if curl -s -o /dev/null http://127.0.0.1:4317/hook 2>/dev/null; then
    break
  fi
  sleep 0.1
done

for script in hooks/on-session-start.sh hooks/on-tool-use.sh hooks/on-stop.sh hooks/on-permission-request.sh hooks/on-notification.sh hooks/on-subagent-start.sh hooks/on-subagent-stop.sh; do
  echo '{"hook_event_name":"SessionStart","session_id":"smoke-test"}' | "$script"
  if ! grep -q "smoke-test" "$TMP_LOG"; then
    echo "FAIL: $script did not forward payload"
    kill "$LISTENER_PID" 2>/dev/null || true
    exit 1
  fi
  : > "$TMP_LOG"
done

kill "$LISTENER_PID" 2>/dev/null || true
echo "PASS: all hook scripts forward stdin correctly"

#!/usr/bin/env bash
# Stop local dev services started by scripts/dev-start.sh

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)
RUN_DIR="$ROOT/.run"

stop_pid() {
  local name="$1"; shift
  local pid_file="$RUN_DIR/${name}.pid"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file" 2>/dev/null || true)
    if [[ -n "$pid" ]]; then
      echo "Stopping $name (PID $pid)"
      kill "$pid" 2>/dev/null || true
      # Give it a moment, then force if needed
      sleep 0.5
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  else
    echo "$name not running (no PID file)"
  fi
}

stop_pid cloudflared
stop_pid frontend
stop_pid backend

echo "Cleaning old logs (optional)"
rm -f "$RUN_DIR"/*.log "$RUN_DIR"/tunnel.url 2>/dev/null || true

echo "Done."

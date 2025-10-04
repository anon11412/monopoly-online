#!/usr/bin/env bash
# Print the current Cloudflare tunnel URL created by scripts/dev-start.sh
# Usage:
#   scripts/dev-url.sh            -> prints URL if available, else non-zero exit
#   scripts/dev-url.sh --follow   -> waits until URL appears; tails log if needed

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)
RUN_DIR="$ROOT/.run"
LOG_FILE="$RUN_DIR/cloudflared.log"
URL_FILE="$RUN_DIR/tunnel.url"

extract_url() {
  if [[ -f "$URL_FILE" ]]; then
    awk 'NR==1{print; exit}' "$URL_FILE"
    return 0
  fi
  if [[ -f "$LOG_FILE" ]]; then
    grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" | head -n1 || true
  fi
}

follow=false
if [[ "${1:-}" == "--follow" || "${1:-}" == "-f" ]]; then
  follow=true
fi

if ! $follow; then
  url=$(extract_url || true)
  if [[ -n "${url:-}" ]]; then
    echo "$url"
    exit 0
  fi
  echo "No tunnel URL found. Try '--follow' or start the tunnel (make dev-up-local)." >&2
  exit 1
fi

# Follow mode: wait up to ~60s printing the URL when available; otherwise tail log
for i in {1..60}; do
  url=$(extract_url || true)
  if [[ -n "${url:-}" ]]; then
    echo "$url"
    exit 0
  fi
  sleep 0.5
done

echo "URL not found yet. Tailing log (Ctrl-C to stop)..." >&2
if [[ -f "$LOG_FILE" ]]; then
  tail -f "$LOG_FILE"
else
  echo "No log file: $LOG_FILE" >&2
  exit 1
fi

#!/usr/bin/env bash
# One-command local dev starter: backend (uvicorn), frontend (Vite), and Cloudflare quick tunnel
# - Writes PIDs/logs under .run/
# - Skips starting a service if it's already healthy
# - Prints the public tunnel URL when ready

set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)
RUN_DIR="$ROOT/.run"
mkdir -p "$RUN_DIR"

BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8000"
FRONTEND_HOST="0.0.0.0"  # listen on all for LAN if needed
FRONTEND_PORT="5173"
CLOUDFLARED_BIN="$ROOT/cloudflared"

log() { echo -e "[dev] $*"; }

is_backend_up() {
  curl -s -o /dev/null -w "%{http_code}" "http://${BACKEND_HOST}:${BACKEND_PORT}/healthz" | grep -q "^200$" || return 1
}

is_frontend_up() {
  # Check both 5173 and 5174 ports
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5173/" | grep -q "^200$"; then
    FRONTEND_PORT="5173"
    return 0
  elif curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:5174/" | grep -q "^200$"; then
    FRONTEND_PORT="5174"
    return 0
  fi
  return 1
}

is_proc_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid=$(cat "$pid_file" 2>/dev/null || true)
  [[ -n "${pid}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

start_backend() {
  if is_backend_up; then
    log "Backend already up at http://${BACKEND_HOST}:${BACKEND_PORT}"
    return 0
  fi
  log "Starting backend (uvicorn) ..."
  (
    cd "$ROOT/server"
    # Create venv if missing
    if [[ ! -d .venv ]]; then
      python3 -m venv .venv
    fi
    . .venv/bin/activate
    pip install --upgrade pip >/dev/null 2>&1 || true
    pip install -r requirements.txt uvicorn >/dev/null 2>&1
    ALLOWED_ORIGINS="http://127.0.0.1:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT}" \
      nohup .venv/bin/uvicorn main:asgi \
        --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload \
        > "$RUN_DIR/backend.log" 2>&1 & echo $! > "$RUN_DIR/backend.pid"
  )
  # Wait for health
  for i in {1..40}; do
    if is_backend_up; then
      log "Backend ready: http://${BACKEND_HOST}:${BACKEND_PORT}/healthz"
      return 0
    fi
    sleep 0.5
  done
  log "WARN: Backend didn't become healthy in time (still continuing)"
}

start_frontend() {
  if is_frontend_up; then
    log "Frontend already up at http://127.0.0.1:${FRONTEND_PORT}"
    return 0
  fi
  log "Starting frontend (Vite) ..."
  (
    cd "$ROOT/web"
    if [[ ! -d node_modules ]]; then
      npm install >/dev/null 2>&1
    fi
    nohup npm run dev -- --strictPort --host "${FRONTEND_HOST}" --port "${FRONTEND_PORT}" \
      > "$RUN_DIR/frontend.log" 2>&1 & echo $! > "$RUN_DIR/frontend.pid"
  )
  # Wait for dev server
  for i in {1..60}; do
    if is_frontend_up; then
      log "Frontend ready: http://127.0.0.1:${FRONTEND_PORT}"
      return 0
    fi
    sleep 0.5
  done
  log "WARN: Frontend didn't become reachable yet (still continuing)"
}

extract_tunnel_url() {
  # Grep the first trycloudflare URL in the log
  grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$RUN_DIR/cloudflared.log" | head -n1 || true
}

start_tunnel() {
  if [[ ! -x "$CLOUDFLARED_BIN" ]]; then
    log "cloudflared not found at $CLOUDFLARED_BIN — attempting auto-download (Linux only) ..."
    uname_s=$(uname -s || echo unknown)
    uname_m=$(uname -m || echo unknown)
    if [[ "$uname_s" == "Linux" ]]; then
      # Map common arch names
      case "$uname_m" in
        x86_64|amd64) arch="amd64" ;;
        aarch64|arm64) arch="arm64" ;;
        armv7l) arch="arm" ;;
        *) arch="amd64" ;;
      esac
      tmp="$(mktemp -d)"
      trap 'rm -rf "$tmp"' EXIT
      url="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}"
      log "Downloading: $url"
      if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$tmp/cloudflared"
      elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$tmp/cloudflared"
      else
        log "curl/wget not available; cannot download cloudflared automatically."
        return 1
      fi
      mv "$tmp/cloudflared" "$CLOUDFLARED_BIN"
      chmod +x "$CLOUDFLARED_BIN"
      log "cloudflared installed to $CLOUDFLARED_BIN"
    else
      log "Auto-download only implemented for Linux. Please install cloudflared manually."
      return 1
    fi
  fi

  if is_proc_alive "$RUN_DIR/cloudflared.pid"; then
    local url
    url=$(extract_tunnel_url)
    if [[ -n "$url" ]]; then
      log "Tunnel already running: $url"
      echo "$url" > "$RUN_DIR/tunnel.url"
      return 0
    fi
  fi

  log "Starting Cloudflare quick tunnel ..."
  # Start fresh tunnel
  nohup "$CLOUDFLARED_BIN" tunnel \
    --url "http://localhost:${FRONTEND_PORT}" \
    --protocol http2 \
    --edge-ip-version auto \
    --no-autoupdate \
    > "$RUN_DIR/cloudflared.log" 2>&1 & echo $! > "$RUN_DIR/cloudflared.pid"

  # Wait for URL to appear
  local url=""
  for i in {1..60}; do
    sleep 0.5
    url=$(extract_tunnel_url)
    if [[ -n "$url" ]]; then
      echo "$url" > "$RUN_DIR/tunnel.url"
      log "Tunnel ready: $url"
      echo "$url"
      return 0
    fi
  done
  log "WARN: Tunnel URL not detected yet; check $RUN_DIR/cloudflared.log"
}

print_summary() {
  echo
  echo "==== Dev environment ready ===="
  echo "Backend:  http://${BACKEND_HOST}:${BACKEND_PORT}/healthz"
  echo "Frontend: http://127.0.0.1:${FRONTEND_PORT} (Local)"
  if [[ -f "$RUN_DIR/tunnel.url" ]]; then
    echo "Public:   $(cat "$RUN_DIR/tunnel.url")"
  else
    echo "Public:   (tunnel pending; see $RUN_DIR/cloudflared.log)"
  fi
  echo "Logs in:  $RUN_DIR"
}

# Main
start_backend || true
start_frontend || true
start_tunnel || true
print_summary

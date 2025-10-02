# Monopoly Online — Dev & Deploy

## One-command Local Dev (with tunnel)

Run backend, frontend, and a public Cloudflare tunnel with one command:

- Prereq: If `./cloudflared` is missing, the start script will attempt to auto-download it on Linux. Otherwise, you can place the Cloudflare binary at project root as `./cloudflared` and make it executable (`chmod +x cloudflared`).
- Start everything:

  make dev-up-local

- Stop everything:

  make dev-down-local

Outputs:
- Backend at http://127.0.0.1:8000 (hot reload)
- Frontend at http://127.0.0.1:5173 (hot reload)
- Public URL printed from scripts (also saved to `.run/tunnel.url`)

Quick helper:

```bash
make dev-url        # print current URL if available
make dev-url ARGS=--follow  # wait until URL becomes available (optional)
```

Troubleshooting:
- If the public URL isn’t shown, check `.run/cloudflared.log`.
- If Vite warns about blocked host, `vite.config.ts` is already configured with `server.allowedHosts = true`.
- Logs and PID files live under `.run/`.

## Local Development (proxy-first)

- Backend (FastAPI + Socket.IO) on port 8000
```bash
pip install -r server/requirements.txt
PYTHONPATH=$(pwd) uvicorn server.main:asgi --reload --host 127.0.0.1 --port 8000
```

- Frontend (Vite) — uses Vite proxy to backend (no `VITE_BACKEND_URL`)
```bash
cd web
npm install
npm run dev
```

Validate locally:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8000/healthz
curl -s "http://127.0.0.1:8000/socket.io/?EIO=4&transport=polling" | head -c 60
```
Open http://127.0.0.1:5173 and press Connect.

Common fixes:
- If 8000 is busy: `fuser -k 8000/tcp || lsof -ti:8000 | xargs -r kill`
- Ensure `ALLOWED_ORIGINS` includes `http://127.0.0.1:5173,http://localhost:5173` for CORS (dev only).

### Docker Compose Dev

We also ship a docker-compose dev stack that runs both services. In this mode, the frontend proxies to the backend via the Docker network using the service name (`server-dev`). You don't need to set `VITE_BACKEND_URL`.

```bash
docker compose -f docker-compose.dev.yml up --build
```

Then open http://localhost:5173. The proxy is configured in `web/vite.config.ts` to reach `http://server-dev:8000` inside the network.

If you see "Failed to connect" in the main menu:
- Confirm http://localhost:5173/healthz returns `{ ok: true }` (proxied to backend)
- Confirm http://localhost:8000/healthz is reachable from your host
- Ensure CORS `ALLOWED_ORIGINS` includes your frontend origin

## Render Deployment

Single service using `server/Dockerfile` (builds web and serves static from backend):

- Service: Web Service (env: docker)
- Dockerfile path: `server/Dockerfile`
- Health check: `/healthz`
- Env vars:
  - `ALLOWED_ORIGINS=*` (or your domain)
  - `WORKERS=1`

Notes:
- Dockerfile builds `web` then copies to `/app/static`; FastAPI mounts it.
- Socket.IO is at `/socket.io/`; API endpoints include `/board_meta`, `/healthz`.

## Configuration

- Frontend (`web/src/config.ts`): default same-origin; dev uses Vite proxy (unset `VITE_BACKEND_URL`).
- Server: CORS via `ALLOWED_ORIGINS`; static mount if `/app/static` exists.

## Health Endpoints

- `GET /healthz` → `{ ok: true }`
- `GET /board_meta` → board tiles JSON

## Git Push

```bash
git add -A
git commit -m "Docs: proxy-first dev, Render notes, health checks"
git push origin main
```
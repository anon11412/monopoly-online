# Monopoly Online — Dev & Deploy

## Local Development (proxy-first)

- Backend (FastAPI + Socket.IO) on port 8000
```bash
pip install -r server/requirements.txt
PYTHONPATH=$(pwd) uvicorn server.main:asgi --reload --host 127.0.0.1 --port 8000
```

- Frontend (Vite) — uses Vite proxy to `127.0.0.1:8000` (no `VITE_BACKEND_URL`)
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
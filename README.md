# Monopoly Online — Deploy & Run

## Local Development

- Backend (FastAPI + Socket.IO):
```bash
/workspaces/monopoly-online/.venv/bin/uvicorn server.main:asgi --host 0.0.0.0 --port 8000
```
- Frontend (Vite):
```bash
cd web
npm run dev
```
Vite proxies socket.io and API to `127.0.0.1:8000`.

## Render Deployment

This repo includes a `render.yaml` using the server Dockerfile to build both web + server.

- Server builds the React app first and copies `web/dist` into `/app/static` for same-origin serving.
- App serves Socket.IO at `/socket.io/` and exposes `/board_meta` and `/healthz`.

Minimum settings:
- Service type: Web
- Environment: Docker
- Dockerfile path: `server/Dockerfile`
- Health check path: `/healthz` (or `/board_meta`)
- Env vars:
  - `ALLOWED_ORIGINS=*`
  - `WORKERS=1`

## Configuration

Frontend config (`web/src/config.ts`):
- `BACKEND_URL` is empty by default so the browser uses same-origin and Vite proxy in dev.
- `SOCKET_PATH` is `/socket.io/`.

Server:
- CORS allows `ALLOWED_ORIGINS` (default `*`).
- Static serving mounts at `/` if `/app/static` exists.

## Health Endpoints

- `/healthz` → `{ ok: true }`
- `/board_meta` → returns board tiles JSON

## Git Push

Typical flow:
```bash
git add -A
git commit -m "Prepare for Render: add /healthz, .dockerignore, dark-mode fixes"
git push origin main
```
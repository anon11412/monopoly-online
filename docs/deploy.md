# Deploying Monopoly Online

This guide deploys the app as a 3-service stack: server (FastAPI+socket.io), web (React static), and an Nginx reverse proxy handling a single origin with websocket upgrades.

## Prereqs
- Docker and Docker Compose installed
- A domain (optional but recommended). For HTTPS, place a TLS proxy (e.g., Caddy/Traefik/NGINX with certbot) in front of the provided proxy.

## Quick start (local single-host)

1. Build and run

```bash
docker compose build
docker compose up -d
```

2. Open http://localhost in your browser. The proxy serves the web UI and forwards `/socket.io/` and `/board_meta` to the server.

## Environment configuration

Server (FastAPI):
- `ALLOWED_ORIGINS`: CSV list of allowed origins for CORS (defaults to `*`). E.g., `https://yourdomain.com`.
- `HOST`, `PORT`, `WORKERS`: gunicorn/uvicorn configuration.

Web (Vite):
- `VITE_BACKEND_URL`: Leave empty for same-origin (recommended in prod via reverse proxy).

Proxy (Nginx):
- Routes:
  - `/` -> web static
  - `/socket.io/` -> server (websocket + polling)
  - `/board_meta` -> server

## Production tips
- Put TLS in front of the proxy (e.g., Caddy or NGINX with certbot) and terminate HTTPS there.
- Set `ALLOWED_ORIGINS` on the server to your domain (e.g., `https://yourdomain.com`).
- Consider setting `WORKERS` according to CPU (2-4 typically fine).
- For multiple instances or workers, use python-socketio’s Redis manager so rooms/events work cross-process.

## Scaling across instances (optional)
- Add Redis and configure Socket.IO server with a Redis manager (code change required).
- Persist game/lobby state in a database so restarts don’t drop games.

## Troubleshooting
- If sockets don’t connect, verify the reverse proxy `/socket.io/` block has Upgrade/Connection headers and the browser uses the same origin (no CORS).
- For mixed content issues, ensure everything is served over HTTPS.
- On blank screen, check `docker compose logs -f proxy` and `server` for errors.

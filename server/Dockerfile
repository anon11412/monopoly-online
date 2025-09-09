# Server Dockerfile
FROM node:20-alpine AS webbuild
WORKDIR /web
COPY web/package.json web/package-lock.json* web/pnpm-lock.yaml* web/yarn.lock* ./
RUN npm ci || npm i
COPY web/tsconfig*.json ./
COPY web/vite.config.ts ./
COPY web/eslint.config.js ./
COPY web/index.html ./
COPY web/public ./public
COPY web/src ./src
RUN npm run build

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
  && rm -rf /var/lib/apt/lists/*

# Install deps
COPY server/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy app
COPY server /app/server
# Copy built web to static dir for same-origin serving
COPY --from=webbuild /web/dist /app/static

# Expose ASGI port
EXPOSE 8000

# Default envs (can be overridden)
ENV WORKERS=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    ALLOWED_ORIGINS=* \
    SERVE_STATIC_DIR=/app/static

# Run with gunicorn and uvicorn workers
CMD ["bash", "-lc", "exec gunicorn server.main:asgi -k uvicorn.workers.UvicornWorker --bind ${HOST}:${PORT} --workers ${WORKERS} --timeout 120"]

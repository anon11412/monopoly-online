DEV_COMPOSE=docker-compose.dev.yml

.PHONY: dev dev-up dev-down dev-logs \
	dev-local dev-local-backend dev-local-frontend dev-local-stop

# Docker-based hot reload
dev: dev-up ## Build and start dev stack (backend + frontend) with hot reload

dev-up:
	docker compose -f $(DEV_COMPOSE) up --build

dev-down:
	docker compose -f $(DEV_COMPOSE) down --remove-orphans

dev-logs:
	docker compose -f $(DEV_COMPOSE) logs -f --tail=200

# Local (non-Docker) hot reload
dev-local-backend:
	cd server && \
	python3 -m venv .venv && . .venv/bin/activate && \
	pip install -r requirements.txt uvicorn && \
	ALLOWED_ORIGINS="http://127.0.0.1:5173,http://localhost:5173" nohup .venv/bin/uvicorn main:asgi --host 127.0.0.1 --port 8000 --reload > ../.backend.out 2>&1 & echo $$! > ../.backend.pid

dev-local-frontend:
	cd web && npm install && npm run dev -- --strictPort --host 127.0.0.1 --port 5173

dev-local: dev-local-backend dev-local-frontend ## Start uvicorn (background) and Vite (foreground)

dev-local-stop:
	@if [ -f .backend.pid ]; then \
		echo "Stopping backend PID $$(cat .backend.pid)"; \
		kill $$(cat .backend.pid) || true; \
		rm -f .backend.pid .backend.out; \
	else \
		echo "No .backend.pid file found"; \
	fi

.PHONY: dev-local-status
dev-local-status:
	@echo "Health:"
	@curl -fsS http://127.0.0.1:8000/healthz || true; echo
	@echo "Board Meta (first 200 bytes):"
	@curl -fsS http://127.0.0.1:8000/board_meta | head -c 200 || true; echo
	@echo "Socket.IO probe (polling):"
	@curl -isS "http://127.0.0.1:8000/socket.io/?EIO=4&transport=polling" | head -n 1 || true

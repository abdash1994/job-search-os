# ─── Job Search OS — Cross-platform Makefile ─────────────────────────────────
# Works on Mac, Linux, and Windows (Git Bash / WSL2)

.PHONY: help setup dev build scrape scrape-once proxy-refresh docker-up docker-down docker-logs clean

help:
	@echo ""
	@echo "  Job Search OS"
	@echo "  ─────────────────────────────────────"
	@echo "  make setup          First-time setup (installs all deps)"
	@echo "  make dev            Start web dashboard locally"
	@echo "  make scrape         Run scraper continuously (every 6h)"
	@echo "  make scrape-once    Run scraper once and exit"
	@echo "  make proxy-refresh  Refresh free proxy pool"
	@echo "  make docker-up      Start everything in Docker"
	@echo "  make docker-down    Stop Docker containers"
	@echo "  make docker-logs    Tail Docker logs"
	@echo "  make clean          Remove build artifacts"
	@echo ""

setup:
	@echo "Setting up web app..."
	cd apps/web && npm install
	@echo "Setting up Python scraper..."
	cd scraper && pip install -r requirements.txt
	@echo "Installing Playwright browsers..."
	cd scraper && playwright install chromium
	@echo ""
	@echo "✓ Setup complete. Copy .env.example to .env and fill in your Supabase keys."
	@echo ""

dev:
	cd apps/web && npm run dev

build:
	cd apps/web && npm run build

scrape:
	cd scraper && python main.py

scrape-once:
	cd scraper && python main.py --once

proxy-refresh:
	cd scraper && python -m proxy.fetcher

docker-up:
	docker compose up -d
	@echo "Dashboard: http://localhost:3000"

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

clean:
	rm -rf apps/web/.next apps/web/node_modules
	find scraper -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true

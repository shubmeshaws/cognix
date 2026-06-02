#!/usr/bin/env bash
# Restart KubeHealer local dev stack (run from repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Stopping existing dev servers on 3000 and 3001..."
for port in 3000 3001; do
  pid=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill $pid 2>/dev/null || true
    sleep 1
  fi
done

echo "Clearing stale Next.js cache..."
rm -rf "$ROOT/apps/web/.next"

echo "Starting Postgres + Redis (Docker)..."
if command -v docker-compose >/dev/null 2>&1; then
  docker-compose up -d postgres redis
elif docker compose version >/dev/null 2>&1; then
  docker compose up -d postgres redis
else
  echo "Docker Compose not found — ensure Postgres (5433) and Redis (6379) are already running."
fi

echo ""
echo "Start these in separate terminals:"
echo ""
echo "  # Agent (API :3001)"
echo "  cd $ROOT/apps/agent && pnpm dev"
echo ""
echo "  # Web (dashboard :3000)"
echo "  cd $ROOT/apps/web && pnpm dev   # http://127.0.0.1:3000"
echo ""
echo "Then open: http://localhost:3000/dashboard"

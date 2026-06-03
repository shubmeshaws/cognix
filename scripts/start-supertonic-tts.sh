#!/usr/bin/env bash
# Start local Supertonic 3 TTS server for Meshy (OpenAI-compatible on :7788).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/services/supertonic-tts"
PORT="${SUPERTONIC_TTS_PORT:-7788}"
HOST="${SUPERTONIC_TTS_HOST:-127.0.0.1}"

lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill -9 2>/dev/null || true

cd "$DIR"

if [ ! -d .venv ]; then
  echo "Creating Python venv and installing Supertonic..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

# shellcheck disable=SC1091
source .venv/bin/activate

export SUPERTONIC_CACHE_DIR="${SUPERTONIC_CACHE_DIR:-$DIR/.cache/supertonic3}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

echo "Supertonic 3 TTS → http://${HOST}:${PORT}"
echo "  Native:  http://${HOST}:${PORT}/v1/tts"
echo "  OpenAI:  http://${HOST}:${PORT}/v1/audio/speech"
echo "  Docs:    http://${HOST}:${PORT}/docs"
echo ""
echo "Meshy uses this via apps/web /api/tts (SUPERTONIC_TTS_URL in apps/web/.env)."

exec supertonic serve --host "$HOST" --port "$PORT"

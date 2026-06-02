#!/usr/bin/env bash
# Quick Puter.js connectivity check via the running agent.
set -euo pipefail

WEB="${WEB_URL:-http://127.0.0.1:3000}"
AGENT="${AGENT_URL:-http://127.0.0.1:3001}"
ORIGIN="${PUTER_APP_ORIGIN:-http://127.0.0.1:3000}"
MODEL="${PUTER_MODEL:-gpt-5-nano}"

echo "Fetching dev token from $WEB ..."
TOKEN=$(curl -sf "$WEB/api/dev/token" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

echo "Agent LLM config:"
curl -sf -H "Authorization: Bearer $TOKEN" "$AGENT/api/agent/llm-config" | python3 -m json.tool

echo ""
echo "Puter test (model=$MODEL, origin=$ORIGIN):"
curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$AGENT/api/agent/llm-config/test" \
  -d "{\"provider\":\"puter\",\"puterModel\":\"$MODEL\",\"puterAppOrigin\":\"$ORIGIN\"}" \
  | python3 -m json.tool

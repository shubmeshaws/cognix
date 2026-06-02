#!/bin/sh
set -eu

MODEL="${OLLAMA_MODEL:-llama3.1:8b}"
HOST="${OLLAMA_HOST:-http://ollama:11434}"

echo "Pulling Ollama model ${MODEL} from ${HOST}..."
OLLAMA_HOST="${HOST}" ollama pull "${MODEL}"
echo "Model ${MODEL} ready."

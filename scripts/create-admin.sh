#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/../apps/agent"

pnpm exec tsx --env-file=.env scripts/create-admin.ts "$@"

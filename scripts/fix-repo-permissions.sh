#!/usr/bin/env bash
#
# Fix EACCES on node_modules (root-owned files from sudo pnpm/npm or sudo corepack use in the repo).
#
# Usage:
#   chmod +x scripts/fix-repo-permissions.sh
#   ./scripts/fix-repo-permissions.sh
#   ./scripts/fix-repo-permissions.sh /home/ubuntu/cognix ubuntu
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${1:-$SCRIPT_DIR/..}" && pwd)"
RUN_USER="${2:-${SUDO_USER:-$USER}}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!>\033[0m %s\n' "$*"; }

if [[ "$(id -u)" -eq 0 ]]; then
  echo "Run as your normal user (e.g. ubuntu), not root. This script uses sudo when needed."
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required."
  exit 1
fi

RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
[[ -n "$RUN_HOME" ]] || RUN_HOME="$(eval echo "~$RUN_USER")"

log "Repo: $REPO_ROOT"
log "User: $RUN_USER ($RUN_HOME)"

log "Fixing ownership on repo (sudo chown -R)…"
sudo chown -R "$RUN_USER:$RUN_USER" "$REPO_ROOT"

log "Removing node_modules (always sudo — fixes root-owned .bin)…"
if [[ -d "$REPO_ROOT/node_modules" ]]; then
  sudo rm -rf "$REPO_ROOT/node_modules"
  log "Removed node_modules"
fi

for dir in \
  "$RUN_HOME/.local/share/pnpm" \
  "$RUN_HOME/.cache/node" \
  "$RUN_HOME/.npm" \
  "$REPO_ROOT/.pnpm-store"; do
  if [[ -d "$dir" ]]; then
    warn "chown $dir"
    sudo chown -R "$RUN_USER:$RUN_USER" "$dir"
  fi
done

log "Checking for files not owned by $RUN_USER…"
remaining="$(find "$REPO_ROOT" ! -user "$RUN_USER" 2>/dev/null | head -20 || true)"
if [[ -n "$remaining" ]]; then
  warn "Foreign ownership (first 20):"
  echo "$remaining"
  sudo chown -R "$RUN_USER:$RUN_USER" "$REPO_ROOT"
else
  log "All files under repo owned by $RUN_USER"
fi

log "Done. Next:"
echo "  cd $REPO_ROOT"
echo "  pnpm -v    # expect 9.15.0"
echo "  pnpm install   # as $RUN_USER only — never sudo pnpm or sudo corepack use in the repo"

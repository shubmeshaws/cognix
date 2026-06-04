#!/usr/bin/env bash
#
# Cognix / KubeHealer — Ubuntu 24.04+ bootstrap
#
# Installs system dependencies, Docker, Node.js 20, pnpm, optional kubectl,
# starts Postgres/Redis/Ollama via Docker Compose, installs Node deps, and
# applies the database schema.
#
# Usage (from repo root after clone, or let the script clone for you):
#   chmod +x scripts/setup-ubuntu.sh
#   ./scripts/setup-ubuntu.sh              # local dev stack (default)
#   ./scripts/setup-ubuntu.sh --mode docker   # full stack in Docker
#   ./scripts/setup-ubuntu.sh --deps-only     # install tools only
#   ./scripts/setup-ubuntu.sh --skip-ollama
#   ./scripts/setup-ubuntu.sh --help
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="dev"          # dev | docker | deps-only
SKIP_OLLAMA=false
CLONE_URL="https://github.com/shubmeshaws/cognix.git"
INSTALL_KUBECTL=true
ASSUME_YES=false
TARGET_DIR=""

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!>\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mERR>\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
Cognix setup for Ubuntu 24.04+

Options:
  --mode MODE        dev (default) | docker | deps-only
  --skip-ollama      Do not start or pull Ollama (use cloud LLMs in Settings)
  --no-kubectl       Skip kubectl install
  --clone URL        Clone repo to ~/cognix if not already inside the repo
  --dir PATH         Use PATH as repo root (default: auto-detect or ~/cognix)
  -y, --yes          Non-interactive (apt -y, accept defaults)
  -h, --help         Show this help

Modes:
  dev        Install deps + Docker infra (postgres, redis, ollama) + pnpm + db schema.
             You start agent/web manually (see final instructions).
  docker     Install deps + build and run full stack via docker compose up -d --build.
  deps-only  Install Git, Docker, Node 20, pnpm, kubectl only — no services.

After dev mode:
  Terminal 1:  pnpm dev:agent
  Terminal 2:  pnpm dev:web
  Browser:     http://localhost:3000

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:?}"; shift 2 ;;
    --skip-ollama) SKIP_OLLAMA=true; shift ;;
    --no-kubectl) INSTALL_KUBECTL=false; shift ;;
    --clone) CLONE_URL="${2:?}"; shift 2 ;;
    --dir) TARGET_DIR="${2:?}"; shift 2 ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

case "$MODE" in
  dev|docker|deps-only) ;;
  *) die "Invalid --mode: $MODE (use dev, docker, or deps-only)" ;;
esac

# Real user when invoked with sudo
if [[ -n "${SUDO_USER:-}" ]]; then
  RUN_USER="$SUDO_USER"
  RUN_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
else
  RUN_USER="${USER}"
  RUN_HOME="${HOME}"
fi

APT_OPTS=()
[[ "$ASSUME_YES" == true ]] && APT_OPTS+=(-y)

require_root_for_apt() {
  if [[ "$(id -u)" -ne 0 ]] && ! command -v sudo >/dev/null 2>&1; then
    die "Re-run with sudo or as root to install system packages."
  fi
}

run_apt() {
  require_root_for_apt
  if [[ "$(id -u)" -eq 0 ]]; then
    apt-get "$@"
  else
    sudo apt-get "$@"
  fi
}

check_os() {
  if [[ ! -f /etc/os-release ]]; then
    die "Cannot detect OS. This script targets Ubuntu 24.04+."
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    warn "Not Ubuntu (ID=$ID). Continuing anyway — adjust if packages fail."
  elif [[ "${VERSION_ID:-}" != "24.04" && "${VERSION_ID:-}" != "24.10" && "${VERSION_ID:-}" != "25.04" ]]; then
    if [[ "${VERSION_ID:-}" == "22.04" ]]; then
      warn "Ubuntu 22.04 detected. Script targets 24.04+ but 22.04 usually works."
    else
      warn "Ubuntu $VERSION_ID detected. Tested on 24.04+."
    fi
  fi
  log "OS: ${PRETTY_NAME:-unknown}"
}

install_system_packages() {
  log "Installing base packages (git, curl, openssl, build tools)…"
  run_apt update "${APT_OPTS[@]}"
  run_apt install "${APT_OPTS[@]}" \
    ca-certificates \
    curl \
    gnupg \
    git \
    openssl \
    make \
    lsb-release \
    build-essential
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed: $(docker --version)"
  else
    log "Installing Docker…"
    require_root_for_apt
    curl -fsSL https://get.docker.com | \
      if [[ "$(id -u)" -eq 0 ]]; then sh; else sudo sh; fi
  fi

  if command -v docker compose version >/dev/null 2>&1; then
    log "Docker Compose: $(docker compose version --short 2>/dev/null || docker compose version)"
  elif command -v docker-compose >/dev/null 2>&1; then
    log "Docker Compose (legacy): $(docker-compose --version)"
  else
    die "Docker Compose not found after Docker install."
  fi

  if [[ "$(id -u)" -eq 0 ]]; then
    usermod -aG docker "$RUN_USER" 2>/dev/null || true
  else
    sudo usermod -aG docker "$RUN_USER" 2>/dev/null || true
  fi

  if ! groups "$RUN_USER" | grep -q '\bdocker\b'; then
    warn "User $RUN_USER was added to group 'docker'. Log out and back in (or run: newgrp docker)."
  fi
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  elif [[ "$(id -u)" -ne 0 ]] && sudo docker info >/dev/null 2>&1; then
    sudo docker "$@"
  else
    die "Docker daemon not reachable. Log out/in after install, or run: sudo systemctl start docker"
  fi
}

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker_cmd compose "$@"
  else
    if [[ "$(id -u)" -eq 0 ]]; then
      docker-compose "$@"
    else
      sudo docker-compose "$@"
    fi
  fi
}

run_with_elevation() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

node_is_system_wide() {
  local nodepath
  nodepath="$(command -v node 2>/dev/null || true)"
  [[ -n "$nodepath" && "$nodepath" == /usr/* ]]
}

enable_corepack_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    local pv
    pv="$(pnpm -v 2>/dev/null || true)"
    if [[ "$pv" == 9.* ]]; then
      log "pnpm already installed: $pv"
      return 0
    fi
    warn "pnpm $pv found; installing pnpm@9.15.0"
  fi

  if node_is_system_wide; then
    log "System-wide Node.js (/usr) — enabling Corepack with sudo (avoids EACCES)…"
    if ! run_with_elevation corepack enable; then
      warn "corepack enable failed; trying npm -g…"
      run_with_elevation npm install -g pnpm@9.15.0 || die "Could not install pnpm. Run: sudo npm install -g pnpm@9.15.0"
      log "pnpm $(pnpm -v)"
      return 0
    fi
    run_with_elevation corepack prepare pnpm@9.15.0 --activate
  else
    log "Enabling Corepack and pnpm 9.15.0…"
    corepack enable
    corepack prepare pnpm@9.15.0 --activate
  fi

  command -v pnpm >/dev/null 2>&1 || die "pnpm not found. Run: sudo corepack enable && sudo corepack prepare pnpm@9.15.0 --activate"
  log "pnpm $(pnpm -v)"
}

install_node_pnpm() {
  if command -v node >/dev/null 2>&1; then
    local major
    major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    if [[ "$major" -ge 20 ]]; then
      log "Node.js already installed: $(node --version)"
    else
      warn "Node $(node --version) is older than 20 — installing Node 20…"
      install_node_20
    fi
  else
    install_node_20
  fi

  if [[ "$(id -u)" -eq 0 ]]; then
    die "Run the remainder of this script as a normal user (not root). Example: ./scripts/setup-ubuntu.sh"
  fi

  enable_corepack_pnpm
}

install_node_20() {
  log "Installing Node.js 20 (NodeSource)…"
  require_root_for_apt
  local setup="/tmp/nodesource_setup.sh"
  curl -fsSL https://deb.nodesource.com/setup_20.x -o "$setup"
  if [[ "$(id -u)" -eq 0 ]]; then
    bash "$setup"
    apt-get install "${APT_OPTS[@]}" -y nodejs
  else
    sudo bash "$setup"
    sudo apt-get install "${APT_OPTS[@]}" -y nodejs
  fi
  rm -f "$setup"
  log "Node.js $(node --version)"
}

install_kubectl() {
  [[ "$INSTALL_KUBECTL" == true ]] || return 0
  if command -v kubectl >/dev/null 2>&1; then
    log "kubectl already installed: $(kubectl version --client -o yaml 2>/dev/null | head -1 || kubectl version --client)"
    return 0
  fi
  log "Installing kubectl…"
  require_root_for_apt
  run_apt install "${APT_OPTS[@]}" -y apt-transport-https
  local keyring=/etc/apt/keyrings/kubernetes-apt-keyring.gpg
  if [[ "$(id -u)" -eq 0 ]]; then
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key \
      | gpg --dearmor -o "$keyring"
    echo 'deb [signed-by='"$keyring"'] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' \
      > /etc/apt/sources.list.d/kubernetes.list
    apt-get update "${APT_OPTS[@]}"
    apt-get install "${APT_OPTS[@]}" -y kubectl
  else
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.31/deb/Release.key \
      | sudo gpg --dearmor -o "$keyring"
    echo 'deb [signed-by='"$keyring"'] https://pkgs.k8s.io/core:/stable:/v1.31/deb/ /' \
      | sudo tee /etc/apt/sources.list.d/kubernetes.list >/dev/null
    sudo apt-get update "${APT_OPTS[@]}"
    sudo apt-get install "${APT_OPTS[@]}" -y kubectl
  fi
  log "kubectl $(kubectl version --client --short 2>/dev/null || echo installed)"
}

resolve_repo_root() {
  if [[ -n "$TARGET_DIR" ]]; then
    REPO_ROOT="$(cd "$TARGET_DIR" && pwd)"
  elif [[ -f "$REPO_ROOT/package.json" && -f "$REPO_ROOT/docker-compose.yml" ]]; then
    : # already in repo
  elif [[ -f "$RUN_HOME/cognix/package.json" && -f "$RUN_HOME/cognix/docker-compose.yml" ]]; then
    REPO_ROOT="$RUN_HOME/cognix"
  elif [[ "$CLONE_URL" != "skip" ]]; then
    local dest="$RUN_HOME/cognix"
    if [[ ! -d "$dest/.git" ]]; then
      log "Cloning $CLONE_URL → $dest"
      git clone "$CLONE_URL" "$dest"
    else
      log "Repo exists at $dest — pulling latest"
      git -C "$dest" pull --ff-only || warn "git pull failed; using existing tree"
    fi
    REPO_ROOT="$dest"
  else
    die "Not inside Cognix repo. Clone first or pass --dir /path/to/cognix"
  fi
  log "Repo root: $REPO_ROOT"
}

generate_secret() {
  openssl rand -base64 32 | tr -d '\n'
}

write_env_if_missing() {
  local dest="$1" example="$2" label="$3"
  if [[ -f "$dest" ]]; then
    log "$label already exists — skipping ($dest)"
    return 0
  fi
  if [[ ! -f "$example" ]]; then
    warn "Missing example file: $example"
    return 1
  fi
  cp "$example" "$dest"
  log "Created $dest from example"
}

configure_env_files() {
  local jwt agent_env="$REPO_ROOT/apps/agent/.env" web_env="$REPO_ROOT/apps/web/.env"
  local root_env="$REPO_ROOT/.env" root_web="$REPO_ROOT/.env.web"

  write_env_if_missing "$agent_env" "$REPO_ROOT/apps/agent/.env.example" "apps/agent/.env"
  write_env_if_missing "$web_env" "$REPO_ROOT/apps/web/.env.example" "apps/web/.env"

  if [[ "$MODE" == "docker" ]]; then
    write_env_if_missing "$root_env" "$REPO_ROOT/.env.example" ".env"
    write_env_if_missing "$root_web" "$REPO_ROOT/.env.web.example" ".env.web"
  fi

  if [[ -f "$agent_env" ]] && grep -q 'change-me-to-a-random-string' "$agent_env" 2>/dev/null; then
    jwt="$(generate_secret)"
    log "Setting JWT_SECRET in apps/agent/.env"
    if [[ "$(uname)" == Darwin ]]; then
      sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$agent_env"
    else
      sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$agent_env"
    fi
    if [[ -f "$web_env" ]]; then
      if [[ "$(uname)" == Darwin ]]; then
        sed -i '' "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$web_env"
      else
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$web_env"
      fi
    fi
    if [[ -f "$root_env" ]]; then
      sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$root_env" 2>/dev/null || true
    fi
    if [[ -f "$root_web" ]]; then
      sed -i "s/JWT_SECRET=.*/JWT_SECRET=$jwt/" "$root_web" 2>/dev/null || true
      local nauth
      nauth="$(generate_secret)"
      if grep -q 'NEXTAUTH_SECRET=' "$root_web" 2>/dev/null; then
        sed -i "s/NEXTAUTH_SECRET=.*/NEXTAUTH_SECRET=$nauth/" "$root_web" 2>/dev/null || true
      fi
    fi
  fi

  chmod +x "$REPO_ROOT/scripts/ollama-pull.sh" 2>/dev/null || true
}

start_infra_services() {
  cd "$REPO_ROOT"
  log "Starting Postgres and Redis…"
  compose_cmd up -d postgres redis

  log "Waiting for Postgres to become healthy…"
  local i
  for i in $(seq 1 60); do
    if compose_cmd ps postgres 2>/dev/null | grep -q '(healthy)'; then
      log "Postgres is healthy"
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      die "Postgres did not become healthy in time. Check: docker compose logs postgres"
    fi
    sleep 2
  done

  if [[ "$SKIP_OLLAMA" == true ]]; then
    warn "Skipping Ollama (--skip-ollama). Configure OpenAI/Claude in Settings → Agent."
    return 0
  fi

  log "Starting Ollama (first start may take a minute)…"
  compose_cmd up -d ollama
  log "Pulling default model (llama3.1:8b) — this can take several minutes…"
  compose_cmd up ollama-pull || warn "ollama-pull failed; pull manually: docker compose up ollama-pull"
}

install_node_dependencies() {
  cd "$REPO_ROOT"
  log "Installing pnpm dependencies…"
  pnpm install
  log "Building shared package…"
  pnpm --filter @kubehealer/shared build
}

push_database_schema() {
  cd "$REPO_ROOT"
  log "Applying database schema (db:push)…"
  make db:push
}

start_docker_stack() {
  cd "$REPO_ROOT"
  configure_env_files
  log "Building and starting full Docker stack…"
  compose_cmd up -d --build
  log "Waiting for agent health…"
  local i
  for i in $(seq 1 90); do
    if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
      log "Agent is healthy"
      break
    fi
    if [[ "$i" -eq 90 ]]; then
      warn "Agent health check timed out. Run: docker compose logs agent"
    fi
    sleep 3
  done
}

print_summary() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost')"
  cat <<EOF

$(printf '\033[1;32m✓ Cognix setup complete\033[0m')

Repo:     $REPO_ROOT
Mode:     $MODE

Services:
  Postgres   localhost:5433  (user/pass/db: cognix/cognix/cognix)
  Redis      localhost:6379
EOF
  if [[ "$SKIP_OLLAMA" != true ]]; then
    echo "  Ollama     http://localhost:11434"
  fi
  cat <<EOF

Env files:
  apps/agent/.env   — DATABASE_URL, JWT_SECRET, OLLAMA_URL
  apps/web/.env     — NEXT_PUBLIC_API_URL, JWT_SECRET

EOF
  case "$MODE" in
    dev)
      cat <<EOF
Start the app (two terminals):

  cd $REPO_ROOT && pnpm dev:agent
  cd $REPO_ROOT && pnpm dev:web

Open:  http://localhost:3000
       http://${ip}:3000  (from another machine on the LAN)

Optional:
  ./scripts/start-supertonic-tts.sh   — Meshy voice (port 7788)
  pnpm --filter @kubehealer/agent create-admin   — create admin user (if auth enabled)

Docs:  $REPO_ROOT/docs/SETUP.md
EOF
      ;;
    docker)
      cat <<EOF
Docker stack is running:

  Web:    http://localhost:3000  (http://${ip}:3000)
  Agent:  http://localhost:3001/health

Logs:   cd $REPO_ROOT && docker compose logs -f

Docs:   $REPO_ROOT/docs/SETUP.md
EOF
      ;;
    deps-only)
      cat <<EOF
Dependencies installed. Next:

  cd $REPO_ROOT
  ./scripts/setup-ubuntu.sh --mode dev
  # or
  ./scripts/setup-ubuntu.sh --mode docker

Docs: $REPO_ROOT/docs/SETUP.md
EOF
      ;;
  esac
}

main() {
  if [[ "$(id -u)" -eq 0 ]]; then
    warn "Do not run the full script as root. Use: ./scripts/setup-ubuntu.sh (sudo is used only where needed)."
    die "Re-run as your normal user, e.g. ubuntu@your-server"
  fi

  log "Cognix Ubuntu setup (mode=$MODE)"
  check_os
  install_system_packages
  install_docker
  install_node_pnpm
  install_kubectl

  if [[ "$MODE" == "deps-only" ]]; then
    resolve_repo_root 2>/dev/null || REPO_ROOT="${TARGET_DIR:-$REPO_ROOT}"
    print_summary
    exit 0
  fi

  resolve_repo_root
  configure_env_files

  if [[ "$MODE" == "docker" ]]; then
    start_docker_stack
    print_summary
    exit 0
  fi

  # dev mode
  start_infra_services
  install_node_dependencies
  push_database_schema
  print_summary
}

main "$@"

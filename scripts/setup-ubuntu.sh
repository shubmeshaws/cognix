#!/usr/bin/env bash
#
# Cognix / KubeHealer — Ubuntu 24.04+ bootstrap
#
# Bootstrap: system deps, Docker, Node 20, pnpm, Postgres/Redis/Ollama, schema push, build.
# Does not keep the app running — use systemd or PM2 (see docs/HOSTING.md and final script output).
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

MODE="dev"          # dev | production | docker | deps-only
SKIP_OLLAMA=false
START_APPS=false
DEV_AUTH_OFF=false
INSTALL_NGINX=false
DOMAIN=""
API_DOMAIN=""
WEB_PORT=3000
AGENT_PORT=3001
CREATE_ADMIN=false
ADMIN_EMAIL=""
ADMIN_NAME=""
ADMIN_USERNAME=""
CLONE_URL="https://github.com/shubmeshaws/cognix.git"
INSTALL_KUBECTL=true
ASSUME_YES=false
TARGET_DIR=""
LOG_DIR_NAME=".kubehealer"
DEPLOY_DIR_NAME=".kubehealer/deploy"
SERVER_PRIVATE_IP=""
SERVER_PUBLIC_IP=""

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!>\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31mERR>\033[0m %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

usage() {
  cat <<'EOF'
Cognix setup for Ubuntu 24.04+

Options:
  --mode MODE        dev (default) | production | docker | deps-only
  --skip-ollama      Do not start or pull Ollama (use cloud LLMs in Settings)
  --start            Start agent/web in background (dev only; use PM2/systemd for hosting)
  --dev-auth-off     Skip login: set NEXT_PUBLIC_AUTH_DISABLED=true (dashboard only, no setup wizard)
  --with-nginx       apt install nginx (configure using generated files + docs/HOSTING.md)
  --domain HOST      App hostname for env + deploy configs (e.g. app.example.com)
  --api-domain HOST  API hostname (default: api.<domain> or api.CHANGE_ME.example.com)
  --no-kubectl       Skip kubectl install
  --create-admin     Create initial admin (requires --admin-email and --admin-name)
  --admin-email E    Admin email for --create-admin
  --admin-name N     Admin display name for --create-admin
  --admin-username U Optional admin username
  --clone URL        Clone repo to ~/cognix if not already inside the repo
  --dir PATH         Use PATH as repo root (default: auto-detect or ~/cognix)
  -y, --yes          Non-interactive (apt -y, accept defaults)
  -h, --help         Show this help

Modes:
  dev          Infra + pnpm + DB schema. App start: --start or PM2/systemd (see HOSTING.md).
  production   Same as dev + pnpm build + hosting deploy files + production env hints.
  docker       Infra + schema, then docker compose up -d --build.
  deps-only    Tools only (git, docker, node, pnpm, kubectl).

After setup: env files printed and saved to SETUP_COPY_PASTE.txt.
Hosting (Nginx, SSL, systemd/PM2): docs/HOSTING.md

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:?}"; shift 2 ;;
    --skip-ollama) SKIP_OLLAMA=true; shift ;;
    --start) START_APPS=true; shift ;;
    --dev-auth-off) DEV_AUTH_OFF=true; shift ;;
    --with-nginx) INSTALL_NGINX=true; shift ;;
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    --api-domain) API_DOMAIN="${2:?}"; shift 2 ;;
    --no-kubectl) INSTALL_KUBECTL=false; shift ;;
    --create-admin) CREATE_ADMIN=true; shift ;;
    --admin-email) ADMIN_EMAIL="${2:?}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:?}"; shift 2 ;;
    --admin-username) ADMIN_USERNAME="${2:?}"; shift 2 ;;
    --clone) CLONE_URL="${2:?}"; shift 2 ;;
    --dir) TARGET_DIR="${2:?}"; shift 2 ;;
    -y|--yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

case "$MODE" in
  dev|production|docker|deps-only) ;;
  *) die "Invalid --mode: $MODE (use dev, production, docker, or deps-only)" ;;
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

sed_inplace() {
  if [[ "$(uname)" == Darwin ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

env_file_get() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return 0
  fi
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- || true
}

env_needs_secret() {
  local value="$1"
  [[ -z "$value" || "$value" == *change-me* ]]
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

  if [[ "$MODE" == "dev" && -f "$agent_env" ]]; then
    if grep -qE '^ALLOW_LOCAL_KUBECONFIG=' "$agent_env"; then
      sed_inplace 's/^ALLOW_LOCAL_KUBECONFIG=.*/ALLOW_LOCAL_KUBECONFIG=true/' "$agent_env"
    fi
  fi

  local need_jwt=false
  local f
  for f in "$agent_env" "$web_env" "$root_env" "$root_web"; do
    [[ -f "$f" ]] || continue
    if env_needs_secret "$(env_file_get "$f" JWT_SECRET)"; then
      need_jwt=true
      break
    fi
  done

  if [[ "$need_jwt" == true ]]; then
    jwt="$(generate_secret)"
    log "Generated JWT_SECRET (saved into env files)"
    for f in "$agent_env" "$web_env" "$root_env" "$root_web"; do
      [[ -f "$f" ]] || continue
      if grep -qE '^JWT_SECRET=' "$f" 2>/dev/null; then
        sed_inplace "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" "$f"
      fi
    done
  fi

  if [[ -f "$root_web" ]]; then
    local nauth
    nauth="$(env_file_get "$root_web" NEXTAUTH_SECRET)"
    if env_needs_secret "$nauth"; then
      nauth="$(generate_secret)"
      if grep -qE '^NEXTAUTH_SECRET=' "$root_web" 2>/dev/null; then
        sed_inplace "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nauth}|" "$root_web"
      else
        echo "NEXTAUTH_SECRET=${nauth}" >>"$root_web"
      fi
      log "Generated NEXTAUTH_SECRET in .env.web"
    fi
  fi

  chmod +x "$REPO_ROOT/scripts/ollama-pull.sh" 2>/dev/null || true
  ensure_web_auth_env
  patch_env_for_hosting
}

resolve_server_ips() {
  SERVER_PRIVATE_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo '127.0.0.1')"
  SERVER_PUBLIC_IP=""
  if command -v curl >/dev/null 2>&1; then
    SERVER_PUBLIC_IP="$(
      curl -sf --connect-timeout 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true
    )"
    if [[ -z "$SERVER_PUBLIC_IP" ]]; then
      SERVER_PUBLIC_IP="$(
        curl -sf --connect-timeout 3 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true
      )"
    fi
  fi
  if [[ -z "$SERVER_PUBLIC_IP" ]]; then
    SERVER_PUBLIC_IP="$SERVER_PRIVATE_IP"
  fi
}

ip_is_private() {
  local ip="$1"
  [[ "$ip" =~ ^127\. ]] && return 0
  [[ "$ip" =~ ^10\. ]] && return 0
  [[ "$ip" =~ ^192\.168\. ]] && return 0
  [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] && return 0
  return 1
}

# Point web env at EC2 public IP so browser + NextAuth work from your laptop.
patch_web_env_for_public_access() {
  local web_env="$REPO_ROOT/apps/web/.env"
  local ip="$SERVER_PUBLIC_IP"
  [[ -f "$web_env" ]] || return 0
  [[ -n "$DOMAIN" ]] && return 0
  [[ "$DEV_AUTH_OFF" == true ]] && return 0
  ip_is_private "$ip" && return 0

  local api_url="http://${ip}:${AGENT_PORT}"
  local app_url="http://${ip}:${WEB_PORT}"
  log "Using EC2 public IP in apps/web/.env: ${ip}"

  if grep -qE '^NEXT_PUBLIC_API_URL=' "$web_env" 2>/dev/null; then
    sed_inplace "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${api_url}|" "$web_env"
  else
    echo "NEXT_PUBLIC_API_URL=${api_url}" >>"$web_env"
  fi
  if grep -qE '^NEXT_PUBLIC_APP_URL=' "$web_env" 2>/dev/null; then
    sed_inplace "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${app_url}|" "$web_env"
  else
    echo "NEXT_PUBLIC_APP_URL=${app_url}" >>"$web_env"
  fi
  if grep -qE '^NEXTAUTH_URL=' "$web_env" 2>/dev/null; then
    sed_inplace "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${app_url}|" "$web_env"
  fi
}

# Full first-run flow (/, /setup, /login, admin creds) needs auth enabled + NextAuth secrets.
ensure_web_auth_env() {
  resolve_server_ips
  local web_env="$REPO_ROOT/apps/web/.env"
  [[ -f "$web_env" ]] || return 0

  local nauth app_url
  app_url="http://localhost:${WEB_PORT}"

  if [[ "$DEV_AUTH_OFF" == true ]]; then
    log "Dev auth-off: NEXT_PUBLIC_AUTH_DISABLED=true (skips setup wizard and login)"
    if grep -qE '^NEXT_PUBLIC_AUTH_DISABLED=' "$web_env" 2>/dev/null; then
      sed_inplace 's/^NEXT_PUBLIC_AUTH_DISABLED=.*/NEXT_PUBLIC_AUTH_DISABLED=true/' "$web_env"
    else
      echo "NEXT_PUBLIC_AUTH_DISABLED=true" >>"$web_env"
    fi
    return 0
  fi

  log "Auth enabled for setup wizard + login (use --dev-auth-off to skip)"
  if grep -qE '^NEXT_PUBLIC_AUTH_DISABLED=' "$web_env" 2>/dev/null; then
    sed_inplace 's/^NEXT_PUBLIC_AUTH_DISABLED=.*/NEXT_PUBLIC_AUTH_DISABLED=false/' "$web_env"
  else
    echo "NEXT_PUBLIC_AUTH_DISABLED=false" >>"$web_env"
  fi

  if [[ -n "$DOMAIN" ]]; then
    app_url="https://${HOSTING_APP_DOMAIN}"
  fi

  nauth="$(env_file_get "$web_env" NEXTAUTH_SECRET)"
  if env_needs_secret "$nauth"; then
    nauth="$(generate_secret)"
    if grep -qE '^NEXTAUTH_SECRET=' "$web_env" 2>/dev/null; then
      sed_inplace "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${nauth}|" "$web_env"
    else
      echo "NEXTAUTH_SECRET=${nauth}" >>"$web_env"
    fi
    log "Generated NEXTAUTH_SECRET in apps/web/.env"
  fi

  if grep -qE '^NEXTAUTH_URL=' "$web_env" 2>/dev/null; then
    sed_inplace "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${app_url}|" "$web_env"
  else
    echo "NEXTAUTH_URL=${app_url}" >>"$web_env"
  fi

  patch_web_env_for_public_access
  ensure_agent_internal_url
}

ensure_agent_internal_url() {
  local web_env="$REPO_ROOT/apps/web/.env"
  [[ -f "$web_env" ]] || return 0
  if grep -qE '^AGENT_INTERNAL_URL=' "$web_env" 2>/dev/null; then
    sed_inplace 's|^AGENT_INTERNAL_URL=.*|AGENT_INTERNAL_URL=http://127.0.0.1:'"${AGENT_PORT}"'|' "$web_env"
  else
    echo "AGENT_INTERNAL_URL=http://127.0.0.1:${AGENT_PORT}" >>"$web_env"
  fi
}

resolve_hosting_domains() {
  HOSTING_APP_DOMAIN="${DOMAIN:-app.CHANGE_ME.example.com}"
  if [[ -n "$API_DOMAIN" ]]; then
    HOSTING_API_DOMAIN="$API_DOMAIN"
  elif [[ -n "$DOMAIN" ]]; then
    if [[ "$DOMAIN" == app.* ]]; then
      HOSTING_API_DOMAIN="api.${DOMAIN#app.}"
    else
      HOSTING_API_DOMAIN="api.${DOMAIN}"
    fi
  else
    HOSTING_API_DOMAIN="api.CHANGE_ME.example.com"
  fi
}

patch_env_for_hosting() {
  resolve_hosting_domains
  local agent_env="$REPO_ROOT/apps/agent/.env"
  local web_env="$REPO_ROOT/apps/web/.env"
  local nauth

  if [[ -f "$agent_env" ]]; then
    if grep -qE '^AGENT_HOST=' "$agent_env" 2>/dev/null; then
      sed_inplace 's/^AGENT_HOST=.*/AGENT_HOST=127.0.0.1/' "$agent_env"
    else
      echo "AGENT_HOST=127.0.0.1" >>"$agent_env"
    fi
  fi

  [[ -n "$DOMAIN" ]] || return 0

  log "Patching web env for hosting ($HOSTING_APP_DOMAIN / $HOSTING_API_DOMAIN)…"
  [[ -f "$web_env" ]] || return 0

  local api_url="https://${HOSTING_API_DOMAIN}"
  local app_url="https://${HOSTING_APP_DOMAIN}"

  if grep -qE '^NEXT_PUBLIC_API_URL=' "$web_env"; then
    sed_inplace "s|^NEXT_PUBLIC_API_URL=.*|NEXT_PUBLIC_API_URL=${api_url}|" "$web_env"
  else
    echo "NEXT_PUBLIC_API_URL=${api_url}" >>"$web_env"
  fi
  if grep -qE '^NEXT_PUBLIC_APP_URL=' "$web_env"; then
    sed_inplace "s|^NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=${app_url}|" "$web_env"
  else
    echo "NEXT_PUBLIC_APP_URL=${app_url}" >>"$web_env"
  fi
  # Auth flags/secrets handled in ensure_web_auth_env (also runs for --domain)
}

install_nginx_if_requested() {
  [[ "$INSTALL_NGINX" == true ]] || return 0
  log "Installing nginx…"
  run_apt install "${APT_OPTS[@]}" nginx
}

substitute_template() {
  local src="$1" dest="$2"
  local next_bin="$REPO_ROOT/node_modules/.bin/next"
  [[ -x "$next_bin" ]] || next_bin="$(command -v next 2>/dev/null || echo "$REPO_ROOT/node_modules/.bin/next")"
  mkdir -p "$(dirname "$dest")"
  sed \
    -e "s|CHANGE_ME_REPO|${REPO_ROOT}|g" \
    -e "s|CHANGE_ME_USER|${RUN_USER}|g" \
    -e "s|CHANGE_ME_APP_DOMAIN|${HOSTING_APP_DOMAIN}|g" \
    -e "s|CHANGE_ME_API_DOMAIN|${HOSTING_API_DOMAIN}|g" \
    -e "s|CHANGE_ME_WEB_PORT|${WEB_PORT}|g" \
    -e "s|CHANGE_ME_AGENT_PORT|${AGENT_PORT}|g" \
    -e "s|CHANGE_ME_NEXT_BIN|${next_bin}|g" \
    "$src" >"$dest"
}

generate_deploy_configs() {
  resolve_hosting_domains
  local deploy="$REPO_ROOT/$DEPLOY_DIR_NAME"
  local tpl="$REPO_ROOT/deploy/templates"
  log "Generating hosting configs → $deploy/"
  mkdir -p "$deploy/nginx" "$deploy/systemd"
  substitute_template "$tpl/nginx/cognix.conf.template" "$deploy/nginx/cognix.conf"
  substitute_template "$tpl/systemd/cognix-agent.service.template" "$deploy/systemd/cognix-agent.service"
  substitute_template "$tpl/systemd/cognix-web.service.template" "$deploy/systemd/cognix-web.service"
  substitute_template "$tpl/pm2/ecosystem.config.cjs.template" "$deploy/ecosystem.config.cjs"
}

build_production_apps() {
  [[ "$MODE" == "production" ]] || return 0
  cd "$REPO_ROOT"
  log "Building production artifacts (pnpm build)…"
  pnpm build
}

# ANSI colors for required-env output (terminal only; file stays plain).
ENV_C_RESET=$'\033[0m'
ENV_C_BOLD_CYAN=$'\033[1;36m'
ENV_C_BOLD_YELLOW=$'\033[1;33m'
ENV_C_GREEN=$'\033[0;32m'
ENV_C_DIM=$'\033[2m'
ENV_C_BOLD=$'\033[1m'
ENV_C_BOLD_MAGENTA=$'\033[1;35m'
ENV_C_BOLD_GREEN=$'\033[1;32m'
ENV_C_BOLD_BLUE=$'\033[1;34m'
ENV_C_YELLOW=$'\033[0;33m'

env_output_use_color() {
  [[ -t 1 ]]
}

# Print one required KEY=value (actual value from disk).
env_print_kv() {
  local key="$1" value="$2" use_color="$3"
  [[ -n "$value" ]] || return 0
  if [[ "$use_color" == true ]]; then
    printf '  %s%s%s%s=%s%s%s\n' \
      "$ENV_C_BOLD_YELLOW" "$key" "$ENV_C_RESET" \
      "$ENV_C_GREEN" "$value" "$ENV_C_RESET"
  else
    printf '%s=%s\n' "$key" "$value"
  fi
}

# Section banner for an env file.
env_print_section() {
  local label="$1" file="$2" use_color="$3"
  if [[ "$use_color" == true ]]; then
    printf '\n%s┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
    printf '%s┃  %s%s%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_BOLD" "$label" "$ENV_C_RESET"
    printf '%s┃  %s%s%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_DIM" "$file" "$ENV_C_RESET"
    printf '%s┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
  else
    printf '\n# %s\n# %s\n' "$label" "$file"
  fi
}

# Required keys for apps/agent/.env (optional keys on disk are omitted).
agent_required_keys() {
  local file="$1"
  printf '%s\n' DATABASE_URL JWT_SECRET OLLAMA_URL
  if [[ -f "$file" ]] && grep -qE '^AGENT_HOST=' "$file" 2>/dev/null; then
    printf '%s\n' AGENT_HOST
  fi
}

# Required keys for apps/web/.env (depends on auth mode).
web_required_keys() {
  local file="$1"
  local auth_disabled
  auth_disabled="$(env_file_get "$file" NEXT_PUBLIC_AUTH_DISABLED)"
  if [[ "$auth_disabled" == "true" ]]; then
    printf '%s\n' NEXT_PUBLIC_API_URL JWT_SECRET NEXT_PUBLIC_AUTH_DISABLED
  else
    printf '%s\n' \
      NEXT_PUBLIC_AUTH_DISABLED NEXT_PUBLIC_API_URL JWT_SECRET \
      NEXT_PUBLIC_APP_URL NEXTAUTH_SECRET NEXTAUTH_URL
  fi
}

docker_agent_required_keys() {
  printf '%s\n' DATABASE_URL JWT_SECRET OLLAMA_URL
}

docker_web_required_keys() {
  printf '%s\n' \
    NEXT_PUBLIC_API_URL NEXT_PUBLIC_APP_URL JWT_SECRET NEXTAUTH_SECRET NEXTAUTH_URL
}

# Emit required variables for one env file.
emit_required_env_block() {
  local file="$1" label="$2" use_color="$3" keys_fn="$4"
  local key value
  env_print_section "$label" "$file" "$use_color"
  if [[ ! -f "$file" ]]; then
    if [[ "$use_color" == true ]]; then
      printf '  %s(not created — run setup or copy from .env.example)%s\n' "$ENV_C_DIM" "$ENV_C_RESET"
    else
      echo "# (not created)"
    fi
    return 0
  fi
  while IFS= read -r key; do
    [[ -n "$key" ]] || continue
    value="$(env_file_get "$file" "$key")"
    env_print_kv "$key" "$value" "$use_color"
  done < <("$keys_fn" "$file")
}

emit_server_and_auth_block() {
  local use_color="$1"
  local web_env="$REPO_ROOT/apps/web/.env"
  local agent_env="$REPO_ROOT/apps/agent/.env"
  local pub="$SERVER_PUBLIC_IP" priv="$SERVER_PRIVATE_IP"
  local key value

  resolve_server_ips

  if [[ "$use_color" == true ]]; then
    printf '\n%s╔══════════════════════════════════════════════════════════════════╗%s\n' "$ENV_C_BOLD_GREEN" "$ENV_C_RESET"
    printf '%s║  EC2 / SERVER ACCESS + AUTH (use these URLs from your browser)   ║%s\n' "$ENV_C_BOLD_GREEN" "$ENV_C_RESET"
    printf '%s╚══════════════════════════════════════════════════════════════════╝%s\n' "$ENV_C_BOLD_GREEN" "$ENV_C_RESET"
    printf '  %sPublic IP:%s   %s%s%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_BOLD" "$pub" "$ENV_C_RESET"
    printf '  %sPrivate IP:%s %s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$priv"
    if [[ "$pub" != "$priv" ]]; then
      printf '  %sSetup:%s      %shttp://%s:%s/setup%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_GREEN" "$pub" "$WEB_PORT" "$ENV_C_RESET"
      printf '  %sLogin:%s      %shttp://%s:%s/login%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_GREEN" "$pub" "$WEB_PORT" "$ENV_C_RESET"
      printf '  %sAPI health:%s %shttp://%s:%s/health%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_GREEN" "$pub" "$AGENT_PORT" "$ENV_C_RESET"
    fi
    printf '\n  %sAuth — apps/web/.env (required for setup wizard + login):%s\n' "$ENV_C_BOLD_YELLOW" "$ENV_C_RESET"
  else
    echo ""
    echo "================================================================================"
    echo "EC2 / SERVER ACCESS + AUTH"
    echo "================================================================================"
    echo "Public IP:   $pub"
    echo "Private IP:  $priv"
    if [[ "$pub" != "$priv" ]]; then
      echo "Setup:       http://${pub}:${WEB_PORT}/setup"
      echo "Login:       http://${pub}:${WEB_PORT}/login"
      echo "API health:  http://${pub}:${AGENT_PORT}/health"
    fi
    echo ""
    echo "# Auth — apps/web/.env (setup wizard + login)"
  fi

  if [[ -f "$web_env" ]]; then
    while IFS= read -r key; do
      [[ -n "$key" ]] || continue
      value="$(env_file_get "$web_env" "$key")"
      env_print_kv "$key" "$value" "$use_color"
    done < <(web_required_keys "$web_env")
    if [[ "$use_color" == true ]]; then
      printf '\n  %sAgent — apps/agent/.env (JWT must match web):%s\n' "$ENV_C_BOLD_YELLOW" "$ENV_C_RESET"
    else
      echo ""
      echo "# Agent — apps/agent/.env (JWT must match web)"
    fi
    value="$(env_file_get "$agent_env" JWT_SECRET)"
    env_print_kv "JWT_SECRET" "$value" "$use_color"
  elif [[ "$use_color" == true ]]; then
    printf '  %s(apps/web/.env not found)%s\n' "$ENV_C_DIM" "$ENV_C_RESET"
  else
    echo "# (apps/web/.env not found)"
  fi

  if [[ "$DEV_AUTH_OFF" == true && "$use_color" == true ]]; then
    printf '\n  %sNote:%s --dev-auth-off skips login; set NEXT_PUBLIC_AUTH_DISABLED=false for full /setup flow.%s\n' \
      "$ENV_C_YELLOW" "$ENV_C_RESET" "$ENV_C_RESET"
  elif [[ "$DEV_AUTH_OFF" == true ]]; then
    echo "# Note: --dev-auth-off skips login; set NEXT_PUBLIC_AUTH_DISABLED=false for /setup flow."
  fi
}

emit_all_required_env() {
  local use_color="$1"
  local agent_env="$REPO_ROOT/apps/agent/.env"
  local web_env="$REPO_ROOT/apps/web/.env"
  local root_env="$REPO_ROOT/.env"
  local root_web="$REPO_ROOT/.env.web"

  resolve_server_ips
  emit_server_and_auth_block "$use_color"

  if [[ "$use_color" == true ]]; then
    printf '\n%s╔══════════════════════════════════════════════════════════════════╗%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
    printf '%s║  ALL REQUIRED ENV (on disk — agent + web)                        ║%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
    printf '%s╚══════════════════════════════════════════════════════════════════╝%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
  else
    echo ""
    echo "================================================================================"
    echo "ALL REQUIRED ENV (on disk — agent + web)"
    echo "================================================================================"
  fi

  if [[ "$MODE" == "dev" || "$MODE" == "production" ]]; then
    emit_required_env_block "$agent_env" "Agent API" "$use_color" agent_required_keys
    emit_required_env_block "$web_env" "Web UI" "$use_color" web_required_keys
  elif [[ "$MODE" == "docker" ]]; then
    emit_required_env_block "$root_env" "Docker — Agent" "$use_color" docker_agent_required_keys
    emit_required_env_block "$root_web" "Docker — Web" "$use_color" docker_web_required_keys
  elif [[ "$MODE" == "deps-only" ]]; then
    [[ -f "$agent_env" ]] && emit_required_env_block "$agent_env" "Agent API" "$use_color" agent_required_keys
    [[ -f "$web_env" ]] && emit_required_env_block "$web_env" "Web UI" "$use_color" web_required_keys
  fi

  if [[ "$use_color" == true ]]; then
    printf '\n%s  (Optional: LLM keys, SSO, TTS — see .env.example if needed.)%s\n' "$ENV_C_DIM" "$ENV_C_RESET"
  else
    echo ""
    echo "# Optional: LLM keys, SSO, TTS — see .env.example"
  fi
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
  log "Applying database schema (drizzle push)…"
  pnpm --filter @kubehealer/agent db:push
}

wait_for_http() {
  local url="$1" label="$2" max_attempts="${3:-90}"
  local i
  for i in $(seq 1 "$max_attempts"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      log "$label is ready ($url)"
      return 0
    fi
    if [[ "$i" -eq "$max_attempts" ]]; then
      warn "$label not ready at $url (check logs under $REPO_ROOT/$LOG_DIR_NAME/logs/)"
      return 1
    fi
    sleep 2
  done
}

create_admin_user() {
  [[ "$CREATE_ADMIN" == true ]] || return 0
  if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_NAME" ]]; then
    die "--create-admin requires --admin-email and --admin-name"
  fi
  cd "$REPO_ROOT"
  log "Creating admin user ($ADMIN_EMAIL)…"
  local args=(--email "$ADMIN_EMAIL" --name "$ADMIN_NAME")
  [[ -n "$ADMIN_USERNAME" ]] && args+=(--username "$ADMIN_USERNAME")
  pnpm --filter @kubehealer/agent create-admin -- "${args[@]}"
}

start_dev_apps() {
  [[ "$START_APPS" == true ]] || return 0
  local log_dir="$REPO_ROOT/$LOG_DIR_NAME/logs"
  local agent_pid="$REPO_ROOT/$LOG_DIR_NAME/agent.pid"
  local web_pid="$REPO_ROOT/$LOG_DIR_NAME/web.pid"
  local pid
  mkdir -p "$log_dir"
  cd "$REPO_ROOT"

  if [[ -f "$agent_pid" ]]; then
    pid="$(cat "$agent_pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      warn "Agent already running (pid $pid)"
    else
      rm -f "$agent_pid"
    fi
  fi
  if [[ ! -f "$agent_pid" ]]; then
    log "Starting agent (background)…"
    nohup pnpm dev:agent >>"$log_dir/agent.log" 2>&1 &
    echo $! >"$agent_pid"
  fi

  if [[ -f "$web_pid" ]]; then
    pid="$(cat "$web_pid" 2>/dev/null || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      warn "Web already running (pid $pid)"
    else
      rm -f "$web_pid"
    fi
  fi
  if [[ ! -f "$web_pid" ]]; then
    log "Starting web (background)…"
    nohup pnpm dev:web >>"$log_dir/web.log" 2>&1 &
    echo $! >"$web_pid"
  fi

  wait_for_http "http://localhost:3001/health" "Agent" 90 || true
  wait_for_http "http://localhost:3000/" "Web UI" 120 || true
}

start_docker_stack() {
  cd "$REPO_ROOT"
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

hosting_domain_is_placeholder() {
  [[ "$HOSTING_APP_DOMAIN" == *CHANGE_ME* || "$HOSTING_API_DOMAIN" == *CHANGE_ME* ]]
}

# Section title for next-steps output (color or plain).
steps_print_banner() {
  local title="$1" use_color="$2"
  if [[ "$use_color" == true ]]; then
    printf '\n%s╔══════════════════════════════════════════════════════════════════╗%s\n' "$ENV_C_BOLD" "$ENV_C_RESET"
    printf '%s║  %-64s║%s\n' "$ENV_C_BOLD" "$title" "$ENV_C_RESET"
    printf '%s╚══════════════════════════════════════════════════════════════════╝%s\n' "$ENV_C_BOLD" "$ENV_C_RESET"
  else
    printf '\n================================================================================\n'
    printf '  %s\n' "$title"
    printf '================================================================================\n'
  fi
}

steps_print_heading() {
  local label="$1" color="$2" use_color="$3"
  if [[ "$use_color" == true ]]; then
    printf '\n%s▶ %s%s\n' "$color" "$label" "$ENV_C_RESET"
  else
    printf '\n--- %s ---\n' "$label"
  fi
}

print_setup_context() {
  local use_color="$1"
  resolve_server_ips
  resolve_hosting_domains
  steps_print_banner "SETUP SUMMARY" "$use_color"
  if [[ "$use_color" == true ]]; then
    printf '  %sMode:%s          %s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$MODE"
    printf '  %sRepo:%s          %s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$REPO_ROOT"
    printf '  %sPublic IP:%s     %s%s%s  (open in browser)\n' \
      "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_BOLD" "$SERVER_PUBLIC_IP" "$ENV_C_RESET"
    printf '  %sPrivate IP:%s   %s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$SERVER_PRIVATE_IP"
    if [[ -n "$DOMAIN" ]]; then
      printf '  %sApp domain:%s    https://%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$HOSTING_APP_DOMAIN"
      printf '  %sAPI domain:%s    https://%s\n' "$ENV_C_DIM" "$ENV_C_RESET" "$HOSTING_API_DOMAIN"
    else
      printf '  %sDomain:%s         %s(not passed — use --domain for production HTTPS)%s\n' \
        "$ENV_C_DIM" "$ENV_C_RESET" "$ENV_C_YELLOW" "$ENV_C_RESET"
    fi
    printf '  %sFull guide:%s     %s/docs/HOSTING.md\n' "$ENV_C_DIM" "$ENV_C_RESET" "$REPO_ROOT"
  else
    printf 'Mode:       %s\n' "$MODE"
    printf 'Repo:       %s\n' "$REPO_ROOT"
    printf 'Public IP:  %s\n' "$SERVER_PUBLIC_IP"
    printf 'Private IP: %s\n' "$SERVER_PRIVATE_IP"
    if [[ -n "$DOMAIN" ]]; then
      printf 'App domain: https://%s\n' "$HOSTING_APP_DOMAIN"
      printf 'API domain: https://%s\n' "$HOSTING_API_DOMAIN"
    else
      printf 'Domain:     (not set — add --domain app.yourdomain.com for production)\n'
    fi
    printf 'Guide:      docs/HOSTING.md\n'
  fi
}

print_development_steps() {
  local ip="$1" use_color="$2"
  steps_print_heading "DEVELOPMENT — local testing (hot reload, no Nginx)" "$ENV_C_BOLD_BLUE" "$use_color"
  cat <<EOF
When to use: Quick coding with hot reload. Default install uses full setup at /
             (wizard + login). Use --dev-auth-off only to skip straight to dashboard.

1) Env files (you already copied these):
   ${REPO_ROOT}/apps/agent/.env
   ${REPO_ROOT}/apps/web/.env

2) Infra (already started by setup):
   cd ${REPO_ROOT}
   docker compose ps          # postgres, redis, ollama should be Up

3) Start app — pick ONE:

   Option A — two terminals (recommended for dev):
   cd ${REPO_ROOT} && pnpm dev:agent
   cd ${REPO_ROOT} && pnpm dev:web

   Option B — background (quick smoke test):
   cd ${REPO_ROOT} && ./scripts/setup-ubuntu.sh --start -y

4) Open first-run setup (auth on by default):
   http://127.0.0.1:${WEB_PORT}/setup
   http://${ip}:${WEB_PORT}/setup
   Flow: welcome → Check DB → Create schema → /login → generate admin creds → sign in
   (If you see "Dev mode (auth off)", set NEXT_PUBLIC_AUTH_DISABLED=false in apps/web/.env and restart web.)

5) EC2 cannot connect from internet?
   ss -tlnp | grep -E ':${WEB_PORT}|:${AGENT_PORT}'   # must show 0.0.0.0 not 127.0.0.1
   sudo ufw status                                   # allow ${WEB_PORT}/${AGENT_PORT} if active
   AWS Security Group → Inbound: TCP ${WEB_PORT}, ${AGENT_PORT} from your IP (or 0.0.0.0/0 for lab)

6) Verify:
   curl -s http://127.0.0.1:${AGENT_PORT}/health
   curl -s -o /dev/null -w "web HTTP %%{http_code}\n" http://127.0.0.1:${WEB_PORT}/

7) Admin user (only if auth is enabled in apps/web/.env):
   cd ${REPO_ROOT}
   pnpm --filter @kubehealer/agent create-admin -- \\
     --email you@example.com --name "Your Name"
EOF
}

print_production_steps() {
  local use_color="$1"
  local deploy="$REPO_ROOT/$DEPLOY_DIR_NAME"
  resolve_hosting_domains
  steps_print_heading "PRODUCTION — public HTTPS (systemd or PM2 + Nginx + SSL)" "$ENV_C_BOLD_GREEN" "$use_color"
  if hosting_domain_is_placeholder; then
    if [[ "$use_color" == true ]]; then
      printf '\n  %s⚠  No real domain was set. Re-run setup to generate correct Nginx/env:%s\n' "$ENV_C_YELLOW" "$ENV_C_RESET"
      printf '     %s./scripts/setup-ubuntu.sh --mode production -y --domain app.YOURDOMAIN.com%s\n\n' "$ENV_C_DIM" "$ENV_C_RESET"
    else
      printf '\nWARNING: No real domain. Re-run:\n'
      printf '  ./scripts/setup-ubuntu.sh --mode production -y --domain app.YOURDOMAIN.com\n\n'
    fi
  fi
  cat <<EOF
When to use: Real users on the internet with https://app.yourdomain.com

0) Checklist before you start:
   [ ] DNS A records: app.yourdomain.com and api.yourdomain.com → server IP
   [ ] Env files use https:// API URL and JWT_SECRET matches in agent + web
   [ ] NEXT_PUBLIC_AUTH_DISABLED=false (or removed) in apps/web/.env
   [ ] NEXTAUTH_URL / NEXT_PUBLIC_APP_URL = your public app URL

1) Regenerate deploy configs with your real domain (if you still see CHANGE_ME):
   cd ${REPO_ROOT}
   ./scripts/setup-ubuntu.sh --mode production -y --domain app.yourdomain.com

2) Build production bundles:
   cd ${REPO_ROOT}
   pnpm build

3) Start app — pick systemd OR PM2 (not pnpm dev):

   systemd:
   sudo cp ${deploy}/systemd/cognix-agent.service /etc/systemd/system/
   sudo cp ${deploy}/systemd/cognix-web.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable cognix-agent cognix-web
   sudo systemctl start cognix-agent cognix-web
   sudo systemctl status cognix-agent cognix-web

   PM2:
   cd ${REPO_ROOT}
   sudo npm install -g pm2
   pm2 start ${deploy}/ecosystem.config.cjs
   pm2 save && pm2 startup

4) Nginx reverse proxy:
   sudo apt install -y nginx
   sudo cp ${deploy}/nginx/cognix.conf /etc/nginx/sites-available/cognix
   sudo ln -sf /etc/nginx/sites-available/cognix /etc/nginx/sites-enabled/
   # Inside /etc/nginx/nginx.conf → http { } add if missing:
   #   map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
   sudo nginx -t && sudo systemctl reload nginx

5) SSL (Let's Encrypt) — replace domains and email:
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d ${HOSTING_APP_DOMAIN} -d ${HOSTING_API_DOMAIN} \\
     --email YOUR_EMAIL@example.com --agree-tos --redirect
   sudo certbot renew --dry-run

6) Create admin (first login):
   cd ${REPO_ROOT}
   pnpm --filter @kubehealer/agent create-admin -- \\
     --email you@example.com --name "Your Name"

7) Open:
   https://${HOSTING_APP_DOMAIN}

8) Verify locally then publicly:
   curl -s http://127.0.0.1:${AGENT_PORT}/health
   curl -s https://${HOSTING_API_DOMAIN}/health
   curl -s -o /dev/null -w "web HTTP %%{http_code}\n" https://${HOSTING_APP_DOMAIN}/

Deploy files: ${deploy}/
EOF
}

print_docker_steps() {
  local ip="$1" use_color="$2"
  steps_print_heading "DOCKER MODE — full stack in containers" "$ENV_C_BOLD_MAGENTA" "$use_color"
  cat <<EOF
When to use: Prefer docker compose for app + infra (less PM2/systemd).

1) Env files:
   ${REPO_ROOT}/.env
   ${REPO_ROOT}/.env.web

2) Stack (setup already ran compose up):
   cd ${REPO_ROOT}
   docker compose ps
   docker compose logs -f agent

3) Optional Nginx + SSL in front of ports 3000 / 3001 (see PRODUCTION steps 4–5).
   Set NEXT_PUBLIC_API_URL to your public API URL in .env.web

4) Open:
   http://${ip}:3000
   http://127.0.0.1:3000
EOF
}

print_which_path_hint() {
  local use_color="$1"
  if [[ "$use_color" == true ]]; then
    printf '\n%s┌─ Which path should I follow? ─────────────────────────────────────%s\n' "$ENV_C_BOLD_CYAN" "$ENV_C_RESET"
  else
    printf '\n--- Which path should I follow? ---\n'
  fi
  case "$MODE" in
    dev)
      if [[ "$use_color" == true ]]; then
        printf '  %s► Follow DEVELOPMENT above%s for local work on this server.\n' "$ENV_C_BOLD_BLUE" "$ENV_C_RESET"
        printf '  %s  Follow PRODUCTION above%s when you have a real domain and HTTPS.\n' "$ENV_C_DIM" "$ENV_C_RESET"
      else
        echo "  → Follow DEVELOPMENT above for local work."
        echo "  → Follow PRODUCTION above when you have a real domain and HTTPS."
      fi
      ;;
    production)
      if [[ "$use_color" == true ]]; then
        printf '  %s► Follow PRODUCTION above%s (build is already done).\n' "$ENV_C_BOLD_GREEN" "$ENV_C_RESET"
        printf '  %s  Use DEVELOPMENT only%s for quick debugging with hot reload.\n' "$ENV_C_DIM" "$ENV_C_RESET"
      else
        echo "  → Follow PRODUCTION above (build already done)."
        echo "  → Use DEVELOPMENT only for quick debugging with hot reload."
      fi
      ;;
    docker)
      if [[ "$use_color" == true ]]; then
        printf '  %s► Follow DOCKER MODE above.%s\n' "$ENV_C_BOLD_MAGENTA" "$ENV_C_RESET"
      else
        echo "  → Follow DOCKER MODE above."
      fi
      ;;
  esac
}

print_next_steps() {
  local use_color="${1:-false}"
  resolve_server_ips

  steps_print_banner "WHAT TO DO NEXT" "$use_color"
  print_setup_context "$use_color"

  if [[ "$MODE" == "docker" ]]; then
    print_docker_steps "$SERVER_PUBLIC_IP" "$use_color"
    print_production_steps "$use_color"
  else
    print_development_steps "$SERVER_PUBLIC_IP" "$use_color"
    print_production_steps "$use_color"
  fi

  print_which_path_hint "$use_color"
}

print_env_files() {
  local out_file="$REPO_ROOT/SETUP_COPY_PASTE.txt"
  local use_color=false
  env_output_use_color && use_color=true
  resolve_server_ips

  {
    emit_all_required_env false
    if [[ "$MODE" != "deps-only" ]]; then
      print_next_steps false
    fi
    echo ""
    echo "================================================================================"
  } >"$out_file"

  emit_all_required_env "$use_color"

  if [[ "$MODE" != "deps-only" ]]; then
    print_next_steps "$use_color"
    echo ""
    echo "================================================================================"
  fi

  echo ""
  log "Required env + dev/production steps saved to: $out_file"
  log "Hosting guide: $REPO_ROOT/docs/HOSTING.md"
}

print_summary() {
  local deploy="$REPO_ROOT/$DEPLOY_DIR_NAME"
  resolve_server_ips
  resolve_hosting_domains
  printf '\n\033[1;32m✓ Cognix setup complete\033[0m\n\n'
  echo "Repo:       $REPO_ROOT"
  echo "Mode:       $MODE"
  echo "Public IP:  $SERVER_PUBLIC_IP"
  echo "Private IP: $SERVER_PRIVATE_IP"
  echo "Setup URL:  http://${SERVER_PUBLIC_IP}:${WEB_PORT}/setup"
  echo "Guide:      docs/HOSTING.md"
  if [[ "$MODE" != "deps-only" ]]; then
    echo "Deploy:     $deploy/"
    echo "Output:     SETUP_COPY_PASTE.txt"
  fi
  if [[ "$MODE" == "dev" ]]; then
    echo "Next:       Follow DEVELOPMENT in output below (or SETUP_COPY_PASTE.txt)"
  elif [[ "$MODE" == "production" ]]; then
    echo "Next:       Follow PRODUCTION in output below"
    [[ -z "$DOMAIN" ]] && warn "Re-run with: --domain app.yourdomain.com"
  elif [[ "$MODE" == "docker" ]]; then
    echo "Next:       Follow DOCKER MODE in output below"
  fi
  if [[ "$MODE" == "dev" || "$MODE" == "production" ]]; then
    echo "On server:  http://127.0.0.1:${WEB_PORT}/setup  agent http://127.0.0.1:${AGENT_PORT}/health"
    if [[ -n "$DOMAIN" ]]; then
      echo "HTTPS:      https://${HOSTING_APP_DOMAIN}  api https://${HOSTING_API_DOMAIN}"
    fi
  elif [[ "$MODE" == "docker" ]]; then
    echo "Web UI:     http://${SERVER_PUBLIC_IP}:${WEB_PORT}"
    echo "Agent:      http://${SERVER_PUBLIC_IP}:${AGENT_PORT}/health"
  fi
  if [[ "$START_APPS" == true ]]; then
    echo "Logs:     $REPO_ROOT/$LOG_DIR_NAME/logs/  (--start was used)"
  fi
  print_env_files
}

main() {
  if [[ "$(id -u)" -eq 0 ]]; then
    warn "Do not run the full script as root. Use: ./scripts/setup-ubuntu.sh (sudo is used only where needed)."
    die "Re-run as your normal user, e.g. ubuntu@your-server"
  fi

  log "Cognix Ubuntu setup (mode=$MODE)"
  check_os
  install_system_packages
  install_nginx_if_requested
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
    start_infra_services
    install_node_dependencies
    push_database_schema
    build_production_apps
    generate_deploy_configs
    create_admin_user
    start_docker_stack
    print_summary
    exit 0
  fi

  # dev | production
  start_infra_services
  install_node_dependencies
  push_database_schema
  build_production_apps
  generate_deploy_configs
  create_admin_user
  start_dev_apps
  print_summary
}

main "$@"

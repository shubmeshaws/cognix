<p align="center">
  <img src="docs/assets/cognix-logo.svg?sanitize=true" alt="Cognix" height="88" />
</p>

<h1 align="center">Kubernetes Healing Agent</h1>

<p align="center">
  AI-assisted Kubernetes pod healing — watch unhealthy pods, diagnose with LLM, and heal automatically from a friendly dashboard with <strong>Meshy</strong> (AI copilot).
</p>

<p align="center">
  📖 <a href="docs/SETUP.md"><strong>Full setup guide</strong></a> (EC2, Docker, Kubernetes) — step-by-step for beginners, env file reference, copy-paste commands
</p>

## Application

![Cognix dashboard homepage](docs/assets/homepage.png)

---

## Prerequisites

Before you start, install:

| Tool | Version | Purpose |
|------|---------|---------|
| [Git](https://git-scm.com/downloads) | any recent | Clone the repository |
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Run Postgres, Ollama, agent, and web |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ | Included with Docker Desktop |

**Optional** (local dev without Docker images): [Node.js 20+](https://nodejs.org/), [pnpm 9+](https://pnpm.io/installation), [kubectl](https://kubernetes.io/docs/tasks/tools/)

Generate a shared secret (used in both agent and web env files):

```bash
openssl rand -base64 32
```

Copy the output — you will paste it as `JWT_SECRET` below.

---

## Quick start (Docker)

This is the fastest way to run the full stack on your laptop or a single server.

### Step 1 — Clone the repository

```bash
git clone https://github.com/shubmeshaws/rezolv.git
cd rezolv
chmod +x scripts/ollama-pull.sh
```

### Step 2 — Create the agent env file

Docker Compose reads **`.env`** at the repo root for the **agent** container.

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
DATABASE_URL=postgresql://kubehealer:kubehealer@postgres:5432/kubehealer
JWT_SECRET=paste-your-openssl-secret-here-min-32-chars
OLLAMA_URL=http://ollama:11434
```

| Key | What it does |
|-----|----------------|
| `DATABASE_URL` | PostgreSQL connection (matches the `postgres` service in Docker Compose). |
| `JWT_SECRET` | Signs API tokens. **Must match** the same value in `.env.web`. |
| `OLLAMA_URL` | Local LLM for Meshy AI. Use `http://ollama:11434` inside Docker. |

### Step 3 — Create the web env file

Docker Compose reads **`.env.web`** for the **web** dashboard container.

```bash
cp .env.web.example .env.web
```

For **local testing** on your machine, edit `.env.web`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=same-secret-as-in-dot-env
NEXTAUTH_SECRET=another-openssl-random-string
NEXTAUTH_URL=http://localhost:3000
```

> **Important:** `JWT_SECRET` must be **identical** in `.env` and `.env.web`.

For production behind a domain, replace `localhost` with your public URLs (e.g. `https://api.yourdomain.com` and `https://app.yourdomain.com`).

### Step 4 — Start all services

```bash
docker compose up -d --build
```

Or use the Makefile shortcut:

```bash
make dev
```

**First run:** Docker builds images and Ollama pulls the default model (`llama3.1:8b`). This can take **5–15 minutes** depending on your network.

Check that containers are healthy:

```bash
docker compose ps
```

All services should show `running` (or `healthy` where applicable).

### Step 5 — Verify the stack

```bash
# Agent health
curl -s http://localhost:3001/health

# Web responds (expect HTTP 200 or 307)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

| Service | URL | Notes |
|---------|-----|-------|
| **Web dashboard** | http://localhost:3000 | Main UI — pods, heals, Meshy, settings |
| **Agent API** | http://localhost:3001/health | Backend health check |
| **PostgreSQL** | `localhost:5433` | User / password / database: `kubehealer` |
| **Ollama** | http://localhost:11434 | Local LLM (optional if you use OpenAI/Claude in Settings) |

> Postgres is exposed on host port **5433** (not 5432) to avoid conflicts with a local Postgres install.

### Step 6 — Open the dashboard

1. Open **http://localhost:3000** in your browser.
2. Log in (if auth is enabled) or proceed if you configured `NEXT_PUBLIC_AUTH_DISABLED=true` for local dev via `pnpm dev:web`.

### Step 7 — First-time setup in the UI

Complete these steps in order:

1. **Setup** (sidebar) — run health checks; fix any red items (database, agent, Ollama).
2. **Settings → Agent** — choose LLM provider (Ollama / OpenAI / Claude), click **Test**, then **Apply to agent**.
3. **Clusters** — upload a kubeconfig or connect your cluster.
4. **Overview** — confirm pods and metrics appear.
5. **Meshy** (optional) — ask a test question about your cluster.

Most configuration (LLM keys, Teams webhooks, heal rules) lives in the **dashboard Settings**, not in `.env` files.

### Step 8 — Useful Docker commands

```bash
docker compose logs -f agent     # Follow agent logs
docker compose logs -f web       # Follow web logs
docker compose logs -f ollama    # Ollama / model pull logs
docker compose restart agent     # Restart agent after env changes
docker compose down              # Stop all containers
docker compose down -v           # Stop and delete volumes (destructive — wipes DB)
make logs                        # Shortcut: agent logs
```

---

## Other install methods

| Method | Best for | Guide |
|--------|----------|-------|
| **Cloud server (EC2 / VPS)** | Production on a VM | [Setup §1 — EC2 / VPS](docs/SETUP.md#1-setup-on-a-server-ec2--vps) |
| **Docker Compose** | Local or single-server (above) | [Setup §2 — Docker](docs/SETUP.md#2-setup-with-docker) |
| **Kubernetes (Helm)** | Teams already on K8s | [Setup §3 — Helm](docs/SETUP.md#3-setup-on-kubernetes-helm) · [helm/kubehealer](helm/kubehealer) |

### Helm (Kubernetes) — quick outline

1. Build and push agent + web images to your container registry.
2. Copy `helm/kubehealer/values.yaml` → `my-values.yaml` and set `jwtSecret`, image repos, and ingress hosts.
3. Install:

```bash
helm upgrade --install kubehealer ./helm/kubehealer \
  -f helm/kubehealer/my-values.yaml \
  -n kubehealer --create-namespace
```

4. Verify: `kubectl get pods -n kubehealer` — then configure LLM and clusters in the UI.

Full Helm steps: [docs/SETUP.md §3](docs/SETUP.md#3-setup-on-kubernetes-helm) and [helm/kubehealer/README.md](helm/kubehealer/README.md).

---

## Environment files

| File | Used when | Required keys |
|------|-----------|---------------|
| `.env` | Docker Compose — **agent** | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| `.env.web` | Docker Compose — **web** | `NEXT_PUBLIC_API_URL`, `JWT_SECRET`, `NEXTAUTH_*` |
| `apps/agent/.env` | Local dev — `pnpm dev:agent` | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| `apps/web/.env` | Local dev — `pnpm dev:web` | `NEXT_PUBLIC_API_URL`, `JWT_SECRET` |

### What each key means

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL address (user, password, host, database). |
| `JWT_SECRET` | Secret for signing tokens — **same value in agent and web**. Min 32 random characters. |
| `OLLAMA_URL` | Ollama endpoint for local AI (`http://localhost:11434` or `http://ollama:11434` in Docker). |
| `NEXT_PUBLIC_API_URL` | URL the browser uses to reach the agent API. |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Web login (Docker/production with auth enabled). |
| `NEXT_PUBLIC_AUTH_DISABLED` | Set `true` only for **local dev** to skip login. |
| `ALLOW_LOCAL_KUBECONFIG` | Set `true` on dev agent to import `~/.kube/config`. |

### Configure in the UI (not `.env`)

- LLM provider chain, API keys, Ollama model → **Settings → Agent**
- Microsoft Teams webhook → **Settings → Integrations**
- Cluster connection → **Clusters**
- Heal rules → **Rules**

Settings persist on the agent under `.kubehealer/` (Docker volume in Compose).

Full reference: [Env file guide](docs/SETUP.md#environment-files--which-file-which-keys).

---

## Local development

Run agent and web on your host with hot reload; use Docker only for Postgres and Ollama.

### Step 1 — Install dependencies

```bash
pnpm install
pnpm --filter @kubehealer/shared build
```

### Step 2 — Create env files

```bash
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
```

Edit **`apps/agent/.env`**:

```env
DATABASE_URL=postgresql://kubehealer:kubehealer@localhost:5433/kubehealer
JWT_SECRET=your-shared-secret-min-32-chars
OLLAMA_URL=http://localhost:11434
ALLOW_LOCAL_KUBECONFIG=true
```

Edit **`apps/web/.env`**:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=your-shared-secret-min-32-chars
NEXT_PUBLIC_AUTH_DISABLED=true
```

### Step 3 — Start infrastructure

```bash
docker compose up -d postgres ollama ollama-pull
```

Wait for Ollama to finish pulling the model (`docker compose logs -f ollama-pull`).

### Step 4 — Apply database schema

```bash
pnpm db:push
```

### Step 5 — Start dev servers

In separate terminals:

```bash
pnpm dev:agent   # http://localhost:3001
pnpm dev:web       # http://localhost:3000
```

Open **http://localhost:3000** and complete [first-time UI setup](#step-7--first-time-setup-in-the-ui) above.

---

## Makefile shortcuts

| Target | Command | Description |
|--------|---------|-------------|
| `make dev` | `docker compose up --build` | Full stack in Docker |
| `make agent` | Agent hot reload | Local dev agent |
| `make web` | Next.js dev server | Local dev web |
| `make db:push` | Push DB schema | After schema changes |
| `make logs` | Follow agent logs | Docker agent container |

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| Web cannot reach agent | Confirm `NEXT_PUBLIC_API_URL=http://localhost:3001` in `.env.web` or `apps/web/.env`. |
| Login / auth errors | Ensure `JWT_SECRET` matches in agent and web env files. |
| Meshy / LLM fails | **Settings → Agent** → pick installed Ollama model → **Test** → **Apply**. Check `docker compose logs ollama`. |
| No pods on Overview | **Clusters** → upload kubeconfig; agent needs cluster access. |
| Postgres connection refused | Run `docker compose up -d postgres`; use port **5433** on the host. |
| Port already in use | Stop conflicting services on 3000, 3001, 5433, or 11434. |

More help: [docs/SETUP.md — Troubleshooting](docs/SETUP.md).

---

## Project structure

| Path | Description |
|------|-------------|
| `apps/web` | Next.js dashboard |
| `apps/agent` | Fastify agent + cluster watcher |
| `packages/shared` | Shared types |
| `helm/kubehealer` | Kubernetes Helm chart |
| `docs/SETUP.md` | Complete installation guide (EC2, Docker, Helm) |

---

## Links

- [Complete setup guide](docs/SETUP.md) — EC2, Docker, Kubernetes, env reference
- [Helm chart README](helm/kubehealer/README.md)
- [Ollama](https://ollama.com/) · [Docker](https://docs.docker.com/get-docker/) · [Helm](https://helm.sh/)

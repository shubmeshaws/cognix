# Cognix — complete setup guide

This guide walks you through installing Cognix from zero. It is written for **beginners** and **operators** alike.

**Choose your path:**

| Method | Best for | Difficulty |
|--------|----------|------------|
| [1. Server (EC2 / VPS)](#1-setup-on-a-server-ec2--vps) | Production on a cloud VM | Medium |
| [2. Docker](#2-setup-with-docker) | Fastest full stack on one machine | Easy |
| [3. Kubernetes (Helm)](#3-setup-on-kubernetes-helm) | Teams already on K8s | Advanced |

---

## What you are installing

Cognix has two main parts:

```mermaid
flowchart LR
  subgraph browser [Your browser]
    Web[Web dashboard<br/>port 3000]
  end
  subgraph backend [Backend]
    Agent[Agent API<br/>port 3001]
    DB[(PostgreSQL)]
    Ollama[Ollama LLM<br/>optional]
  end
  subgraph cluster [Your cluster]
    K8s[Kubernetes API]
  end
  Web --> Agent
  Agent --> DB
  Agent --> Ollama
  Agent --> K8s
```

- **Web** — the dashboard (pods, heals, Meshy AI chat, settings).
- **Agent** — watches your cluster, runs diagnoses, applies heals.
- **PostgreSQL** — stores clusters, heal history, and settings.
- **Ollama** (optional) — local AI for Meshy; you can use OpenAI/Claude/Puter from the UI instead.

After install, open **Setup** in the sidebar to verify each dependency.

---

## Environment files — which file, which keys?

Cognix uses **four** env files depending on how you run it. **Only edit the files for your chosen method.**

### Quick reference

| File | Used when | Required keys |
|------|-----------|---------------|
| [`apps/agent/.env`](../apps/agent/.env) | Local dev — `pnpm dev:agent` | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| [`apps/web/.env`](../apps/web/.env) | Local dev — `pnpm dev:web` | `NEXT_PUBLIC_API_URL`, `JWT_SECRET` |
| [`.env`](../.env) | Docker Compose — **agent** container | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| [`.env.web`](../.env.web) | Docker Compose — **web** container | `NEXT_PUBLIC_API_URL`, `JWT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |

### What each key means (plain English)

| Key | What it does |
|-----|----------------|
| `DATABASE_URL` | Address of PostgreSQL (username, password, host, database name). |
| `JWT_SECRET` | Secret password used to sign login tokens. **Must be at least 32 random characters.** Use the **same value** in agent and web. |
| `OLLAMA_URL` | Where Ollama listens (local AI). Default: `http://localhost:11434` or `http://ollama:11434` in Docker. |
| `NEXT_PUBLIC_API_URL` | URL your browser uses to reach the agent (e.g. `http://localhost:3001` or `https://api.yourdomain.com`). |
| `NEXTAUTH_SECRET` | Secret for web login (Docker/production with auth enabled). |
| `NEXTAUTH_URL` | Public URL of the web app (e.g. `https://app.yourdomain.com`). |
| `NEXT_PUBLIC_AUTH_DISABLED` | Set to `true` **only for local dev** to skip login. |
| `ALLOW_LOCAL_KUBECONFIG` | Set to `true` on dev agent to import `~/.kube/config`. |

### What you do **not** put in `.env` (use the dashboard instead)

Configure these in **Settings** after first login — no env keys needed:

- LLM provider chain, API keys, Ollama model → **Settings → Agent → Apply**
- Microsoft Teams webhook → **Settings → Integrations**
- Cluster connection → **Clusters** page
- Heal rules → **Rules** pages

Settings are saved on the agent host (persisted volume in Docker/K8s when configured).

---

## Prerequisites (all methods)

### Software

| Tool | Version | Why |
|------|---------|-----|
| [Git](https://git-scm.com/downloads) | any recent | Clone the repository |
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Database, Ollama, or full stack |
| [Node.js](https://nodejs.org/) | 20+ | Only for local dev without Docker images |
| [pnpm](https://pnpm.io/installation) | 9+ | Only for local dev |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | 1.28+ | Connect clusters; required for Helm path |
| [Helm](https://helm.sh/docs/intro/install/) | 3.12+ | Kubernetes install only |

### Install Git & Docker

<details>
<summary><strong>macOS</strong></summary>

```bash
# Git (Xcode Command Line Tools)
xcode-select --install

# Docker Desktop
# Download: https://docs.docker.com/desktop/setup/install/mac-install/
```

</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

**Ubuntu 24.04+ (automated):** run the bootstrap script from the repo (or let it clone into `~/cognix`):

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
chmod +x scripts/setup-ubuntu.sh
./scripts/setup-ubuntu.sh              # local dev: Docker infra + pnpm + DB schema
# ./scripts/setup-ubuntu.sh --mode docker   # full stack in containers
# ./scripts/setup-ubuntu.sh --deps-only     # install tools only
# ./scripts/setup-ubuntu.sh --help
```

Manual install:

```bash
sudo apt update
sudo apt install -y git ca-certificates curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# Log out and back in for docker group
```

</details>

<details>
<summary><strong>Windows</strong></summary>

1. Install [Git for Windows](https://git-scm.com/download/win)
2. Install [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/)
3. Use **PowerShell** or **Git Bash** for commands below

</details>

### Generate a secure `JWT_SECRET`

Use the same secret in agent and web env files:

```bash
openssl rand -base64 32
```

Copy the output — you will paste it into your env files.

---

## 1. Setup on a server (EC2 / VPS)

Use this for a **single cloud server** (AWS EC2, DigitalOcean Droplet, etc.) running Docker.

### Step 1 — Create the server

**AWS EC2 (example)**

1. Launch an instance: **Ubuntu 22.04**, type **t3.large** or bigger (Ollama needs RAM).
2. Security group — allow inbound:
   - `22` (SSH)
   - `80` / `443` (web, if using a reverse proxy)
   - `3000` / `3001` (only for testing; lock down in production)
3. Attach a volume ≥ **50 GB** if you run Ollama locally.

**Links:** [AWS EC2 docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html)

### Step 2 — SSH into the server

```bash
ssh -i your-key.pem ubuntu@YOUR_SERVER_IP
```

### Step 3 — Install Docker (Linux)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
exit
# SSH in again
```

### Step 4 — Clone Cognix

```bash
git clone https://github.com/shubmeshaws/cognix.git
cd cognix
```

Replace the URL with your actual repository remote.

### Step 5 — Create env files

**Agent (`.env` in repo root):**

```bash
cp .env.example .env
nano .env
```

Set:

```env
DATABASE_URL=postgresql://cognix:cognix@postgres:5432/cognix
JWT_SECRET=paste-your-openssl-secret-here-min-32-chars
OLLAMA_URL=http://ollama:11434
```

**Web (`.env.web`):**

```bash
cp .env.web.example .env.web
nano .env.web
```

Set (replace `YOUR_DOMAIN` with your public hostname or IP):

```env
NEXT_PUBLIC_API_URL=https://api.YOUR_DOMAIN
JWT_SECRET=same-secret-as-agent
NEXTAUTH_SECRET=another-openssl-random-string
NEXTAUTH_URL=https://app.YOUR_DOMAIN
```

> **Important:** `JWT_SECRET` must match between `.env` and `.env.web`.

### Step 6 — Start the stack

```bash
chmod +x scripts/ollama-pull.sh
docker compose up -d --build
```

Wait 2–5 minutes for Ollama to pull the model on first run.

Check status:

```bash
docker compose ps
curl -s http://localhost:3001/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
```

### Step 7 — Open the dashboard

- Web: `http://YOUR_SERVER_IP:3000` (or your domain behind nginx/Caddy)
- Create/login via configured auth provider, or temporarily set `NEXT_PUBLIC_AUTH_DISABLED=true` in `.env.web` **only for testing**

### Step 8 — Configure in the UI

1. **Setup** (sidebar) — run health checks.
2. **Settings → Agent** — pick LLM provider (Ollama / OpenAI / Claude), click **Test**, then **Apply**.
3. **Clusters** — upload kubeconfig or connect in-cluster agent.
4. **Meshy** — ask a test question about your cluster.

### Step 9 — Production hardening (recommended)

- Put **nginx** or **Caddy** in front with TLS ([Let's Encrypt](https://letsencrypt.org/)).
- Do **not** expose ports 3000/3001 publicly; use 443 only.
- Remove `NEXT_PUBLIC_AUTH_DISABLED`.
- Configure Google or email login in `.env.web` (see [apps/web/.env.example](../apps/web/.env.example)).
- Back up the `postgres_data` Docker volume.

### Optional — run without Ollama on the server

Use OpenAI/Claude from Settings instead:

1. Remove or stop the `ollama` service in `docker-compose.yml`, or set `OLLAMA_URL` to an external Ollama host.
2. In **Settings → Agent**, set provider chain to OpenAI or Anthropic and add your API key in the UI.

---

## 2. Setup with Docker

Best for **local machine** or **single-server** install using only Docker Compose.

### Architecture

```mermaid
flowchart TB
  subgraph compose [docker compose]
    PG[postgres:5433]
    OL[ollama:11434]
    AG[agent:3001]
    WB[web:3000]
  end
  Browser --> WB
  WB --> AG
  AG --> PG
  AG --> OL
```

### Step 1 — Clone and prepare

```bash
git clone https://github.com/shubmeshaws/cognix.git
cd cognix
chmod +x scripts/ollama-pull.sh
```

### Step 2 — Agent env (repo root `.env`)

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://cognix:cognix@postgres:5432/cognix
JWT_SECRET=your-secret-at-least-32-characters-long
OLLAMA_URL=http://ollama:11434
```

### Step 3 — Web env (`.env.web`)

```bash
cp .env.web.example .env.web
```

For **local testing**:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=your-secret-at-least-32-characters-long
NEXTAUTH_SECRET=your-secret-at-least-32-characters-long
NEXTAUTH_URL=http://localhost:3000
```

For **local dev without login**, use [`apps/web/.env`](../apps/web/.env) pattern with `pnpm dev:web` instead (see [Local development](#local-development-optional) below).

### Step 4 — Start everything

```bash
docker compose up -d --build
```

Or:

```bash
make dev
```

### Step 5 — Verify

| Service | URL | Default credentials |
|---------|-----|---------------------|
| Web dashboard | http://localhost:3000 | See auth settings |
| Agent API | http://localhost:3001/health | — |
| PostgreSQL | localhost:**5433** | user/pass/db: `cognix` |
| Ollama | http://localhost:11434 | — |

> Postgres is mapped to host port **5433** (not 5432) to avoid conflicts.

### Step 6 — First-time UI setup

1. Open http://localhost:3000
2. Sidebar → **Setup** — confirm checks pass
3. **Settings → Agent** — configure LLM → **Apply to agent**
4. **Clusters** — connect your cluster
5. **Overview** — confirm pods appear

### Screenshots (add your own under `docs/assets/`)

When you add `docs/assets/dashboard-overview.png`, it will render here:

![Dashboard overview](./assets/dashboard-overview.png)

*(Placeholder — see [docs/assets/README.md](./assets/README.md) to add screenshots.)*

### Useful commands

```bash
docker compose logs -f agent    # agent logs
docker compose logs -f web      # web logs
docker compose down             # stop all
docker compose down -v          # stop and delete data (destructive)
make logs                       # shortcut for agent logs
```

---

## 3. Setup on Kubernetes (Helm)

Deploy Cognix into a cluster using the chart in [`helm/cognix`](../helm/cognix).

### Prerequisites

- Kubernetes 1.28+
- `kubectl` configured for your cluster
- [Helm 3](https://helm.sh/docs/intro/install/)
- Container images built and pushed to a registry your cluster can pull

### Step 1 — Build and push images

From the repo root (replace `YOUR_REGISTRY`):

```bash
docker build -t YOUR_REGISTRY/cognix-agent:latest -f apps/agent/Dockerfile .
docker build -t YOUR_REGISTRY/cognix-web:latest -f apps/web/Dockerfile .
docker push YOUR_REGISTRY/cognix-agent:latest
docker push YOUR_REGISTRY/cognix-web:latest
```

### Step 2 — Create a values file

```bash
cp helm/cognix/values.yaml helm/cognix/my-values.yaml
```

Edit `my-values.yaml` — minimum changes:

```yaml
jwtSecret: "your-openssl-secret-min-32-chars"

agent:
  image:
    repository: YOUR_REGISTRY/cognix-agent
    tag: latest

web:
  image:
    repository: YOUR_REGISTRY/cognix-web
    tag: latest
  env:
    nextPublicApiUrl: "https://api.cognix.example.com"
    nextAuthUrl: "https://cognix.example.com"

ingress:
  enabled: true
  hosts:
    web: cognix.example.com
    api: api.cognix.example.com

postgresql:
  enabled: true   # set false if you use RDS / external Postgres
```

### Step 3 — Install with Helm

```bash
helm upgrade --install cognix ./helm/cognix \
  -f helm/cognix/my-values.yaml \
  -n cognix --create-namespace
```

### Step 4 — Verify pods

```bash
kubectl get pods -n cognix
kubectl get ingress -n cognix
```

Wait until agent and web pods are `Running`.

### Step 5 — Configure DNS & TLS

Point your DNS records to the ingress load balancer:

- `cognix.example.com` → web ingress
- `api.cognix.example.com` → agent ingress

Use [cert-manager](https://cert-manager.io/) or your cloud LB for HTTPS.

### Step 6 — Post-install (UI)

1. Open the web URL from ingress.
2. **Settings → Agent** — LLM provider → **Apply**.
3. **Clusters** — register this cluster (in-cluster SA or kubeconfig secret).

### Ollama on Kubernetes

Default chart values disable bundled Ollama. Options:

| Option | How |
|--------|-----|
| External Ollama | Set `agent.env.ollamaUrl` to your Ollama service URL |
| OpenAI / Claude | Leave Ollama empty; configure in Settings UI |
| In-cluster Ollama | Deploy [Ollama Helm chart](https://ollama.ai/blog/ollama-is-now-available-as-an-official-docker-image) separately and point `ollamaUrl` |

### Upgrade / uninstall

```bash
helm upgrade cognix ./helm/cognix -f helm/cognix/my-values.yaml -n cognix
helm uninstall cognix -n cognix
```

See [`helm/cognix/README.md`](../helm/cognix/README.md) for all values.

---

## Local development (optional)

For engineers changing code (not required for Docker/server install).

### Env files

**`apps/agent/.env`:**

```env
DATABASE_URL=postgresql://cognix:cognix@localhost:5433/cognix
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
OLLAMA_URL=http://localhost:11434
ALLOW_LOCAL_KUBECONFIG=true
```

**`apps/web/.env`:**

```env
NEXT_PUBLIC_AUTH_DISABLED=true
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=change-me-to-a-random-string-at-least-32-chars
```

### Commands

```bash
pnpm install
cd packages/shared && pnpm build

# Terminal 1 — infra only
docker compose up -d postgres ollama ollama-pull

# Terminal 2 — agent
pnpm dev:agent

# Terminal 3 — web
pnpm dev:web
```

Push DB schema once:

```bash
make db:push
```

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Agent won't start | `DATABASE_URL` correct? Postgres running? `JWT_SECRET` ≥ 32 chars? |
| Web can't reach agent | `NEXT_PUBLIC_API_URL` must match where agent is reachable **from the browser** |
| Meshy LLM errors | **Setup** page → Ollama / LLM check; **Settings → Agent → Apply** |
| Login fails | `JWT_SECRET` same in agent + web; `NEXTAUTH_URL` matches browser URL |
| No pods shown | **Clusters** — cluster connected? Agent logs: `docker compose logs agent` |
| Ollama model missing | Run `docker compose run --rm ollama-pull` or `ollama pull llama3.2:1b` |

---

## Links

- [Docker Compose docs](https://docs.docker.com/compose/)
- [Ollama](https://ollama.com/)
- [Helm documentation](https://helm.sh/docs/)
- [Kubernetes kubectl install](https://kubernetes.io/docs/tasks/tools/)
- [pnpm installation](https://pnpm.io/installation)

---

## Summary checklist

- [ ] Chose install path: **Server**, **Docker**, or **Kubernetes**
- [ ] Created the correct env file(s) with `JWT_SECRET` (and matching secret in web)
- [ ] Started services (`docker compose up` or `helm install`)
- [ ] Opened web UI and visited **Setup**
- [ ] Configured LLM in **Settings → Agent → Apply**
- [ ] Connected a cluster under **Clusters**
- [ ] Tested Meshy or pod healing on **Overview**

<p align="center">
  <img src="docs/assets/cognix-logo.svg?sanitize=true" alt="Cognix" height="88" />
</p>

<h1 align="center">Kubernetes Healing Agent</h1>

<p align="center">
  AI-assisted Kubernetes pod healing — watch unhealthy pods, diagnose with LLM, and heal automatically from a friendly dashboard with <strong>Meshy</strong> (AI copilot).
</p>

<p align="center">
  📖 <a href="docs/SETUP.md"><strong>Full setup guide</strong></a> · <a href="docs/HOSTING.md"><strong>Hosting (Nginx + SSL)</strong></a>
</p>

---

## Quick Setup (Ubuntu 24.04+ / EC2)

Automated installer: **`scripts/setup-ubuntu.sh`** — installs Docker, Node 20, pnpm, Postgres, Redis, Ollama, applies the DB schema, writes env files, and prints copy-paste values + API test commands.

### Prerequisites

| Requirement | Details |
|-------------|---------|
| **OS** | Ubuntu **24.04+** (22.04 often works) |
| **Storage [EBS]** | **20+ GB** For Safe side |
| **Access** | SSH as a normal user (not root) |
| **Firewall — development** | Inbound **TCP 3000** (web UI), **TCP 3001** (agent API for dashboard), **22** (SSH) |
| **Firewall — production** | After **Nginx + domain + SSL**: inbound **80** and **443** only (app listens on localhost) |

### Run the script

```bash
sudo su ubuntu
cd /home/ubuntu/
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
sudo chmod +x scripts/setup-ubuntu.sh
./scripts/setup-ubuntu.sh -y
```

**Production build + deploy configs:**

```bash
./scripts/setup-ubuntu.sh --mode production -y --domain app.yourdomain.com
```

See **[docs/HOSTING.md](docs/HOSTING.md)** for Nginx, Certbot SSL, and systemd/PM2.

### After the script

1. Review **`SETUP_COPY_PASTE.txt`** (and terminal output): author info, **API test curls**, required **env** values.
2. Start the app (two terminals on the server):

```bash
cd cognix
pnpm dev:agent
# another terminal:
pnpm dev:web -- -H 0.0.0.0
```

3. Open **`http://<your-server-public-ip>:3000/setup`** → check DB → create schema → **`/login`** → generate admin credentials → sign in.

**Important env (written by the script):**

- `apps/web/.env` — `AGENT_INTERNAL_URL=http://127.0.0.1:3001` (setup/login proxy on same host)
- `NEXT_PUBLIC_AUTH_DISABLED=false` (full setup wizard + login)
- `JWT_SECRET` — same value in `apps/agent/.env` and `apps/web/.env`

Use `--dev-auth-off` only if you want to skip login and go straight to the dashboard.

---

## Application

![Cognix dashboard homepage](docs/assets/homepage.png)

---

## Choose your installation method

After the [shared prerequisites](#shared-prerequisites) below, pick **one** path:

| # | Method | Best for |
|---|--------|----------|
| **1** | [Local development / EC2](#option-1-local-development--ec2) | Developers, or a cloud VM (EC2/VPS) running Node + Docker for Postgres/Ollama |
| **2** | [Docker Compose](#option-2-docker-compose) | Full stack in containers on one machine — no local Node required except one schema step |
| **3** | [Kubernetes (Helm)](#option-3-kubernetes-helm) | Production on an existing Kubernetes cluster |

All paths end with the same [post-install UI setup](#post-install-ui-setup-all-methods).

---

## Shared prerequisites

Every method needs:

| Tool | Version | Why |
|------|---------|-----|
| [Git](https://git-scm.com/downloads) | any recent | Clone the repository |
| [curl](https://curl.se/) | any recent | Verify agent/web health |
| [OpenSSL](https://www.openssl.org/) | any recent | Generate secrets (`openssl rand -base64 32`) |

Generate a **JWT secret** now (used in agent + web env files):

```bash
openssl rand -base64 32
```

Save the output — you will paste it as `JWT_SECRET` in the steps below.

Each option has **additional** prerequisites listed in its section.

---

## Option 1: Local development / EC2

Run the **agent** and **web** on the host with hot reload. Use Docker only for **PostgreSQL** and **Ollama** (or install those natively and skip the Docker steps marked *optional*).

Works the same on your laptop or on **EC2/VPS** — on a server, complete [EC2 server prep](#ec2-server-prep-optional) first, then follow the steps below.

### Prerequisites (Option 1)

| Tool | Version | Required | Why |
|------|---------|----------|-----|
| [Node.js](https://nodejs.org/) | **20+** (`engines` in `package.json`) | Yes | Run agent and web |
| [pnpm](https://pnpm.io/) | **9.15.0** (`packageManager` in `package.json`) | Yes | Install monorepo dependencies |
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Yes* | Postgres + Ollama via Compose |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ | Yes* | Start Postgres/Ollama |
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | 1.28+ | Recommended | Connect clusters in the UI |
| [Ollama](https://ollama.com/) (native) | latest | Optional | Alternative to Docker Ollama |

\*Skip Docker if you already run PostgreSQL and Ollama on the host — update `DATABASE_URL` and `OLLAMA_URL` accordingly.

**Install pnpm (once):**

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v   # should print 9.15.0
```

<details>
<summary><strong>EC2 server prep (optional)</strong></summary>

On a new **Ubuntu 24.04+** server, use the automated installer:

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
chmod +x scripts/setup-ubuntu.sh
./scripts/setup-ubuntu.sh --mode production -y --domain app.yourdomain.com
# See docs/HOSTING.md for Nginx, SSL (certbot), and systemd/PM2 start commands (printed at end)
```

Or install tools only, then follow the steps below:

```bash
./scripts/setup-ubuntu.sh --deps-only -y
```

Manual install (Ubuntu 22.04 / EC2):

```bash
sudo apt update && sudo apt install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
# log out and back in
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
corepack enable && corepack prepare pnpm@9.15.0 --activate
```

</details>

### Step 1 — Clone the repository

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
chmod +x scripts/ollama-pull.sh
```

### Step 2 — Install Node dependencies

From the repo root:

```bash
pnpm install
cd packages/shared && pnpm build
```

### Step 3 — Start PostgreSQL

**If PostgreSQL is not already running**, start it with Docker Compose:

```bash
docker compose up -d postgres
```

Wait until healthy:

```bash
docker compose ps postgres
# STATUS should include "healthy"
```

Default connection (host port **5433** → container 5432):

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | **5433** |
| User / password / database | `cognix` / `cognix` / `cognix` |

> Already have Postgres elsewhere? Skip this step and set `DATABASE_URL` in Step 5 to your instance.

### Step 4 — Start Ollama (or skip)

**If Ollama is not already installed**, start it with Docker and pull the default model:

```bash
docker compose up -d ollama
docker compose up ollama-pull
```

Follow the pull job until it exits successfully:

```bash
docker compose logs ollama-pull
# should end with: Model llama3.1:8b ready.
```

Verify Ollama responds:

```bash
curl -s http://localhost:11434/api/tags | head
```

**Skip this step** if you use OpenAI/Claude only (configure in **Settings → Agent** later) or if Ollama is installed natively on `http://localhost:11434`.

### Step 5 — Create environment files

**Agent** — copy and edit `apps/agent/.env`:

```bash
cp apps/agent/.env.example apps/agent/.env
```

Minimum contents:

```env
DATABASE_URL=postgresql://cognix:cognix@localhost:5433/cognix
JWT_SECRET=paste-your-openssl-secret-min-32-chars
OLLAMA_URL=http://localhost:11434
ALLOW_LOCAL_KUBECONFIG=true
```

**Web** — copy and edit `apps/web/.env`:

```bash
cp apps/web/.env.example apps/web/.env
```

Minimum contents for local dev (login disabled):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
JWT_SECRET=same-secret-as-agent-env-above
NEXT_PUBLIC_AUTH_DISABLED=true
```

> **`JWT_SECRET` must be identical** in `apps/agent/.env` and `apps/web/.env`.

On **EC2**, replace `localhost` in `NEXT_PUBLIC_API_URL` with your server IP or domain if the browser runs on another machine.

### Step 6 — Push database schema

Creates tables in PostgreSQL (required before the agent starts):

```bash
make db:push
```

Expected output ends with `[✓] Changes applied`.

> Uses `DATABASE_URL` from `apps/agent/.env`. Re-run after schema changes.

### Step 7 — Start the agent

```bash
pnpm dev:agent
```

Leave this terminal open. Agent listens on **http://localhost:3001**.

Verify in another terminal:

```bash
curl -s http://localhost:3001/health
```

### Step 8 — Start the web dashboard

In a **second terminal** (repo root):

```bash
pnpm dev:web
```

Web listens on **http://localhost:3000**.

### Step 9 — Open the application

Open **http://localhost:3000** in your browser (on EC2 use `http://YOUR_SERVER_IP:3000`).

Continue with [post-install UI setup](#post-install-ui-setup-all-methods).

### Option 1 — Quick reference

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| Agent | http://localhost:3001/health |
| Postgres | `localhost:5433` (user/pass/db: `cognix`) |
| Ollama | http://localhost:11434 |

**Makefile shortcuts:** `make agent` · `make web` · `make db:push`

---

## Option 2: Docker Compose

Runs **postgres**, **ollama**, **agent**, and **web** entirely in Docker. Best for a single machine without running Node dev servers.

### Prerequisites (Option 2)

| Tool | Version | Required | Why |
|------|---------|----------|-----|
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Yes | All services |
| [Docker Compose](https://docs.docker.com/compose/) | v2+ | Yes | Orchestration |
| [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/) | 20+ / 9.15.0 | **Step 6 only** | One-time database schema push |
| [curl](https://curl.se/) | any | Yes | Health checks |

### Step 1 — Clone the repository

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
chmod +x scripts/ollama-pull.sh
```

### Step 2 — Create agent environment file

Docker Compose loads **`.env`** at the repo root for the **agent** container:

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgresql://cognix:cognix@postgres:5432/cognix
JWT_SECRET=paste-your-openssl-secret-min-32-chars
OLLAMA_URL=http://ollama:11434
```

| Key | Value in Docker |
|-----|-----------------|
| `DATABASE_URL` | Hostname **`postgres`** (Docker network), port **5432** |
| `JWT_SECRET` | Same value you will put in `.env.web` |
| `OLLAMA_URL` | **`http://ollama:11434`** (Docker service name) |

### Step 3 — Create web environment file

```bash
cp .env.web.example .env.web
```

Edit `.env.web` for local access:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=same-secret-as-dot-env
NEXTAUTH_SECRET=another-openssl-random-string
NEXTAUTH_URL=http://localhost:3000
```

> **`JWT_SECRET` must match** between `.env` and `.env.web`.

On a server with a public domain, set `NEXT_PUBLIC_API_URL`, `NEXTAUTH_URL`, and `NEXT_PUBLIC_APP_URL` to your HTTPS URLs.

### Step 4 — Start PostgreSQL

```bash
docker compose up -d postgres
```

Wait until healthy:

```bash
docker compose ps postgres
```

### Step 5 — Prepare schema push env (one-time)

The agent image does **not** auto-create tables. Create a local agent env file pointing at Postgres on the host port:

```bash
cp apps/agent/.env.example apps/agent/.env
```

Edit **`apps/agent/.env`** — only `DATABASE_URL` matters for this step:

```env
DATABASE_URL=postgresql://cognix:cognix@localhost:5433/cognix
JWT_SECRET=paste-your-openssl-secret-min-32-chars
OLLAMA_URL=http://localhost:11434
```

### Step 6 — Push database schema

Install dependencies once, then push schema:

```bash
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
cd packages/shared && pnpm build
make db:push
```

Expected: `[✓] Changes applied`.

### Step 7 — Start the full stack

```bash
docker compose up -d --build
```

Or: `make dev` (foreground, with logs).

First run builds images and pulls the Ollama model (`llama3.1:8b`) — allow **5–15 minutes**.

Check all services:

```bash
docker compose ps
```

### Step 8 — Verify services

```bash
curl -s http://localhost:3001/health
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```

| Service | URL | Notes |
|---------|-----|-------|
| Web dashboard | http://localhost:3000 | Main UI |
| Agent API | http://localhost:3001/health | Backend |
| PostgreSQL | `localhost:5433` | user/pass/db: `cognix` |
| Ollama | http://localhost:11434 | Local LLM for Meshy |

### Step 9 — Open the application

Open **http://localhost:3000** and complete [post-install UI setup](#post-install-ui-setup-all-methods).

### Option 2 — Useful commands

```bash
docker compose logs -f agent
docker compose logs -f web
docker compose logs -f ollama
docker compose restart agent
docker compose down              # stop
docker compose down -v           # stop + wipe volumes (destructive)
make logs                        # agent logs shortcut
```

---

## Option 3: Kubernetes (Helm)

Deploy Cognix into a Kubernetes cluster using the chart in [`helm/cognix`](helm/cognix).

### Prerequisites (Option 3)

| Tool | Version | Required | Why |
|------|---------|----------|-----|
| [kubectl](https://kubernetes.io/docs/tasks/tools/) | 1.28+ | Yes | Cluster access |
| [Helm](https://helm.sh/docs/intro/install/) | 3.12+ | Yes | Install chart |
| [Docker](https://docs.docker.com/get-docker/) | 24+ | Yes | Build and push images |
| Container registry | any | Yes | Cluster must pull agent + web images |
| [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/) | 20+ / 9.15.0 | **Step 7 only** | One-time schema push |
| [curl](https://curl.se/) | any | Yes | Health checks |

### Step 1 — Clone the repository

```bash
git clone https://github.com/shubmeshaws/cognix.git cognix
cd cognix
```

### Step 2 — Build container images

Replace `YOUR_REGISTRY` with your registry (ECR, GCR, Docker Hub, etc.):

```bash
docker build -t YOUR_REGISTRY/cognix-agent:latest -f apps/agent/Dockerfile .
docker build -t YOUR_REGISTRY/cognix-web:latest -f apps/web/Dockerfile .
docker push YOUR_REGISTRY/cognix-agent:latest
docker push YOUR_REGISTRY/cognix-web:latest
```

### Step 3 — Configure Helm values

```bash
cp helm/cognix/values.yaml helm/cognix/my-values.yaml
```

Edit `helm/cognix/my-values.yaml` — minimum changes:

```yaml
jwtSecret: "your-openssl-secret-min-32-chars"

agent:
  image:
    repository: YOUR_REGISTRY/cognix-agent
    tag: latest
  env:
    ollamaUrl: "http://YOUR_OLLAMA_HOST:11434"   # or external LLM via Settings UI

web:
  image:
    repository: YOUR_REGISTRY/cognix-web
    tag: latest
  env:
    nextPublicApiUrl: "https://api.yourdomain.com"   # browser → agent
    nextAuthUrl: "https://app.yourdomain.com"        # browser → web

ingress:
  enabled: true
  className: nginx
  hosts:
    web: app.yourdomain.com
    api: api.yourdomain.com

postgresql:
  enabled: true
```

> Bundled Ollama is **disabled** by default (`ollama.enabled: false`). Use an external Ollama URL, or configure OpenAI/Claude in **Settings → Agent** after install.

### Step 4 — Install the Helm chart

```bash
helm upgrade --install cognix ./helm/cognix \
  -f helm/cognix/my-values.yaml \
  -n cognix --create-namespace
```

### Step 5 — Wait for pods

```bash
kubectl get pods -n cognix -w
```

Wait until **agent**, **web**, and **postgres** pods are `Running`.

```bash
kubectl get ingress -n cognix
```

### Step 6 — Configure DNS

Point DNS records to your ingress load balancer:

- `app.yourdomain.com` → web ingress
- `api.yourdomain.com` → agent ingress

Add TLS via [cert-manager](https://cert-manager.io/) or your cloud load balancer.

### Step 7 — Push database schema

The chart does not run migrations automatically. From your workstation:

```bash
# Terminal 1 — port-forward Postgres (release name cognix → service cognix-postgres)
kubectl port-forward -n cognix svc/cognix-postgres 5433:5432
```

```bash
# Terminal 2 — schema push (repo root)
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
cd packages/shared && pnpm build
DATABASE_URL=postgresql://cognix:cognix@localhost:5433/cognix \
  make db:push
```

> Default Postgres credentials match `helm/cognix/values.yaml` (user / password / database: `cognix`).

### Step 8 — Verify deployment

```bash
curl -s https://api.yourdomain.com/health
curl -s -o /dev/null -w "%{http_code}\n" https://app.yourdomain.com/
```

### Step 9 — Open the application

Open your **web ingress URL** and complete [post-install UI setup](#post-install-ui-setup-all-methods).

### Option 3 — Upgrade / uninstall

```bash
helm upgrade cognix ./helm/cognix -f helm/cognix/my-values.yaml -n cognix
helm uninstall cognix -n cognix
```

More detail: [helm/cognix/README.md](helm/cognix/README.md) · [docs/SETUP.md §3](docs/SETUP.md#3-setup-on-kubernetes-helm)

---

## Post-install UI setup (all methods)

Complete these in the dashboard after any install path:

1. **Setup** (sidebar) — run health checks; resolve any failures (database, agent, Ollama/LLM).
2. **Settings → Agent** — select LLM provider (Ollama / OpenAI / Claude) → **Test** → **Apply to agent**.
3. **Clusters** — upload kubeconfig or register the in-cluster agent.
4. **Overview** — confirm pods and metrics appear.
5. **Meshy** (optional) — ask a test question about your cluster.

Configure in the UI (not `.env`): LLM API keys, Teams webhooks, heal rules. Settings persist on the agent host.

---

## Authentication

Cognix supports **email/password login**, optional **Google** and **GitHub SSO**, and an **Admin** area for user management. For local development you can skip login entirely; enable auth for Docker, EC2, or Kubernetes deployments.

### Local dev — skip login (default)

In `apps/web/.env`:

```env
NEXT_PUBLIC_AUTH_DISABLED=true
```

The dashboard loads without a login page. **`JWT_SECRET` must still match** between `apps/agent/.env` and `apps/web/.env`.

### Enable login (production or testing auth locally)

1. Remove `NEXT_PUBLIC_AUTH_DISABLED` or set it to `false` in `apps/web/.env`.
2. Add NextAuth settings (same secret as agent is fine):

```env
NEXTAUTH_SECRET=same-as-JWT_SECRET-or-another-32-char-secret
NEXTAUTH_URL=http://localhost:3000
```

3. Ensure `JWT_SECRET` is **identical** in `apps/agent/.env` and `apps/web/.env`.
4. Run `make db:push` if you have not since upgrading to a version with auth.
5. Create the first admin user (see below), then restart agent and web.

On a public server, set `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` to your HTTPS web URL.

### Create the first admin user

On first launch with auth enabled, open the login page — if no admin exists yet, click **Generate admin credentials**. Cognix creates the initial admin with a random password shown once on screen. Sign in with those credentials and set a new password when prompted.

Alternatively, from the CLI after `make db:push`:

```bash
./scripts/create-admin.sh --email admin@example.com --name "Admin User"
# Optional: --username admin
```

The CLI script prints a **random password once**. Save it — the admin **must change it on first login**.

### First login flow

1. Open the web URL → **Sign in** with email (or username) and the generated password.
2. You are redirected to **Change password** — set a new password before using the dashboard.
3. Admins see **Admin → Users** in the sidebar to add, disable, or reset other users.

### Google / GitHub SSO (optional)

Add OAuth credentials to `apps/web/.env`. Buttons appear on the login page only when both ID and secret are set.

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**Google Cloud Console** — OAuth 2.0 client (Web application):

- Authorized redirect URI: `https://your-domain/auth/callback/google` (local: `http://localhost:3000/auth/callback/google`)

**GitHub** — Settings → Developer settings → OAuth App:

- Authorization callback URL: `https://your-domain/api/auth/callback/github` (local: `http://localhost:3000/api/auth/callback/github`)

SSO users are synced to the agent on first sign-in. Only admins can invite additional local (password) users from **Admin → Users**.

### Admin user management

Users with role **admin** can:

- List all users
- Create users (email, name, optional username) — a random password is shown once
- Enable/disable accounts
- Reset passwords (user must change password on next login)

Regular users can sign in and use the dashboard but cannot access **Admin → Users**.

### Auth environment summary

| Variable | Where | Purpose |
|----------|-------|---------|
| `JWT_SECRET` | Agent + web | Shared signing secret (min 32 chars) |
| `NEXT_PUBLIC_AUTH_DISABLED` | Web | `true` = skip login (local dev only) |
| `NEXTAUTH_SECRET` | Web | NextAuth session secret (when auth enabled) |
| `NEXTAUTH_URL` | Web | Public URL of the web app |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Web | Optional Google SSO |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Web | Optional GitHub SSO |

---

## Environment files reference

| File | Used when | Required keys |
|------|-----------|---------------|
| `apps/agent/.env` | Option 1 — local / EC2 | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| `apps/web/.env` | Option 1 — local / EC2 | `NEXT_PUBLIC_API_URL`, `JWT_SECRET` |
| `.env` | Option 2 — Docker agent | `DATABASE_URL`, `JWT_SECRET`, `OLLAMA_URL` |
| `.env.web` | Option 2 — Docker web | `NEXT_PUBLIC_API_URL`, `JWT_SECRET`, `NEXTAUTH_*` |
| Helm `my-values.yaml` | Option 3 — K8s | `jwtSecret`, image repos, ingress URLs |

| Key | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Shared secret — **must match** in agent and web (min 32 chars) |
| `OLLAMA_URL` | Ollama base URL for Meshy local LLM |
| `NEXT_PUBLIC_API_URL` | Agent URL as seen **from the browser** |
| `NEXT_PUBLIC_AUTH_DISABLED` | `true` only for local dev (Option 1) |
| `ALLOW_LOCAL_KUBECONFIG` | `true` to import `~/.kube/config` (Option 1 dev) |

Full reference: [docs/SETUP.md — Environment files](docs/SETUP.md#environment-files--which-file-which-keys)

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| Agent won't start | Postgres running? `DATABASE_URL` correct? `JWT_SECRET` ≥ 32 chars? Ran `db:push`? |
| Web can't reach agent | `NEXT_PUBLIC_API_URL` must be reachable **from your browser** (not Docker-internal hostname) |
| Meshy / LLM errors | **Settings → Agent** → pick an installed model → **Test** → **Apply**; `docker compose logs ollama` |
| Login / auth errors | `JWT_SECRET` identical in agent + web; `NEXTAUTH_URL` matches browser URL |
| No pods on Overview | **Clusters** — kubeconfig uploaded? Agent has cluster access? |
| Ollama model missing | `docker compose up ollama-pull` or `ollama pull llama3.1:8b` |
| Postgres port conflict | Compose maps host **5433** → container 5432 |

More: [docs/SETUP.md — Troubleshooting](docs/SETUP.md#troubleshooting)

---

## Project structure

| Path | Description |
|------|-------------|
| `apps/web` | Next.js dashboard |
| `apps/agent` | Fastify agent + cluster watcher |
| `packages/shared` | Shared types |
| `helm/cognix` | Kubernetes Helm chart |
| `docs/SETUP.md` | Extended setup guide (EC2 hardening, Helm values, etc.) |

---

## Links

- [Complete setup guide](docs/SETUP.md)
- [Hosting (Nginx, SSL, systemd/PM2)](docs/HOSTING.md)
- [Helm chart README](helm/cognix/README.md)
- [Ollama](https://ollama.com/) · [Docker](https://docs.docker.com/get-docker/) · [Helm](https://helm.sh/)

---

## Collaborate

Questions, feedback, or contributions — reach out:

**Shubham Meshram** — [shubmeshaws@gmail.com](mailto:shubmeshaws@gmail.com)

- Portfolio: [shubhammeshram.com](https://shubhammeshram.com)
- LinkedIn: [linkedin.com/in/iamshubhammeshram](https://www.linkedin.com/in/iamshubhammeshram/)

# KubeHealer

pnpm monorepo for the KubeHealer SaaS — AI-assisted Kubernetes pod healing.

## Structure

| Path | Description |
|------|-------------|
| `apps/web` | Next.js 15 frontend (App Router) |
| `apps/agent` | Fastify backend agent |
| `packages/shared` | Shared TypeScript types |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker (for local infra)

## Setup

```bash
pnpm install
pnpm --filter @kubehealer/shared build
cp apps/agent/.env.example apps/agent/.env
cp apps/web/.env.example apps/web/.env
```

## Local infrastructure

**Infra only** (run agent/web on the host):

```bash
chmod +x scripts/ollama-pull.sh
docker compose up -d postgres redis ollama ollama-pull
```

**Full stack in Docker** (production images):

```bash
cp .env.example .env
cp .env.web.example .env.web
make dev
```

Services:

- **PostgreSQL** — `localhost:5432` (user/pass/db: `kubehealer`)
- **Redis** — `localhost:6379`
- **Ollama** — `localhost:11434` (auto-pulls `llama3.1:8b` after startup)
- **Agent** — `localhost:3001` (with `make dev`)
- **Web** — `localhost:3000` (with `make dev`)

### Makefile

| Target | Description |
|--------|-------------|
| `make dev` | `docker compose up --build` (all services) |
| `make agent` | Agent only, `tsx watch` |
| `make web` | Next.js dev server |
| `make db:push` | Drizzle push schema |
| `make db:studio` | Drizzle Studio |
| `make logs` | Follow agent container logs |

## Development

```bash
# Both apps
pnpm dev

# Individual
pnpm dev:web    # http://localhost:3000
pnpm dev:agent  # http://localhost:3001
```

## shadcn/ui

From `apps/web`:

```bash
pnpm dlx shadcn@latest add <component>
```

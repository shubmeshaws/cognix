.PHONY: dev agent web logs build

# Full stack via Docker (postgres, redis, ollama, agent, web)
dev:
	docker compose up --build

# Local agent with hot reload (requires postgres/redis/ollama — run `make dev` infra only or full stack)
agent:
	pnpm --filter @kubehealer/agent dev

web:
	pnpm --filter @kubehealer/web dev

db\:push:
	pnpm --filter @kubehealer/agent db:push

db\:studio:
	pnpm --filter @kubehealer/agent db:studio

logs:
	docker compose logs -f agent

build:
	docker compose build

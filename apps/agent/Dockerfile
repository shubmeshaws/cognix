# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/agent apps/agent

RUN pnpm --filter @kubehealer/shared build \
  && pnpm --filter @kubehealer/agent build

RUN pnpm --filter @kubehealer/agent deploy --prod /deploy/agent

FROM node:22-alpine AS runner

RUN addgroup -g 1001 kubehealer \
  && adduser -u 1001 -G kubehealer -s /bin/sh -D kubehealer

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder --chown=kubehealer:kubehealer /deploy/agent ./

USER kubehealer

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]

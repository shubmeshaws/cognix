# syntax=docker/dockerfile:1

FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/web apps/web

ENV NEXT_TELEMETRY_DISABLED=1 \
  NEXTAUTH_SECRET=build-time-secret-min-32-characters-long \
  JWT_SECRET=build-time-secret-min-32-characters-long \
  NEXTAUTH_URL=http://localhost:3000 \
  NEXT_PUBLIC_API_URL=http://localhost:3001 \
  EMAIL_SERVER=smtp://localhost:1025 \
  EMAIL_FROM="build@kubehealer.local"

RUN pnpm --filter @kubehealer/web build

FROM node:22-alpine AS runner

RUN addgroup -g 1001 kubehealer \
  && adduser -u 1001 -G kubehealer -s /bin/sh -D kubehealer

WORKDIR /app

ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000

COPY --from=builder --chown=kubehealer:kubehealer /app/apps/web/.next/standalone ./
COPY --from=builder --chown=kubehealer:kubehealer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=kubehealer:kubehealer /app/apps/web/public ./apps/web/public

USER kubehealer

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

# syntax=docker/dockerfile:1
# Se construye desde la RAÍZ del monorepo (un solo pnpm-lock.yaml):
#   docker build -f api/Dockerfile -t axzydev/axzy_central_api:<tag> .
# Al arrancar aplica las migraciones pendientes y levanta el API.

FROM node:22-bookworm-slim AS builder
WORKDIR /repo
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter axzy-central-api --store-dir=/pnpm/store
COPY api/prisma ./api/prisma
RUN pnpm --filter axzy-central-api exec prisma generate
COPY api/tsconfig.json api/tsconfig.build.json ./api/
COPY api/src ./api/src
RUN pnpm --filter axzy-central-api run build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter axzy-central-api --store-dir=/pnpm/store

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4100
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo/api
COPY --chown=node:node --from=builder /repo/node_modules /repo/node_modules
COPY --chown=node:node --from=builder /repo/api/node_modules ./node_modules
COPY --chown=node:node --from=builder /repo/api/package.json ./
COPY --chown=node:node --from=builder /repo/api/prisma ./prisma
COPY --chown=node:node --from=builder /repo/api/dist ./dist
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]

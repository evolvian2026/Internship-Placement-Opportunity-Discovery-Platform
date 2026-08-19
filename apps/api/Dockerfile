# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# API image. Multi-stage so the runtime layer carries no build toolchain.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# --- deps -------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# --- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY tsconfig.base.json package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run build --workspace @odp/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @odp/api

# Drop dev dependencies from the tree that ships.
RUN npm prune --omit=dev

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Never run as root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S api -G nodejs

COPY --from=build --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=api:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=api:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=api:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=api:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=api:nodejs /app/package.json ./

# Resume uploads land here when STORAGE_DRIVER=local.
RUN mkdir -p /app/apps/api/storage && chown -R api:nodejs /app/apps/api/storage

USER api
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/apps/api/src/server.js"]

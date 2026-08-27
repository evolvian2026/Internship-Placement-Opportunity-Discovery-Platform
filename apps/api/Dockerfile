# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# API image. Multi-stage so the runtime layer carries no build toolchain.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# --- deps -------------------------------------------------------------------
# Only the manifests, so this layer is reused until a dependency changes.
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# --- prod-deps --------------------------------------------------------------
# The dependency tree that actually ships. Installed from the lockfile rather
# than pruned out of the build tree, so the runtime layer cannot inherit a
# half-removed package or the generated Prisma client of a dev-only engine.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts
# Generate the client against the production tree it will be loaded from.
COPY apps/api/prisma ./apps/api/prisma
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

# --- build ------------------------------------------------------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.base.json package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN npm run build --workspace @odp/shared \
 && npx prisma generate --schema apps/api/prisma/schema.prisma \
 && npm run build --workspace @odp/api

# --- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production

# Never run as root.
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S api -G nodejs

COPY --from=prod-deps --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=api:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=api:nodejs /app/packages/shared/package.json ./packages/shared/
COPY --from=build --chown=api:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=api:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=api:nodejs /app/apps/api/package.json ./apps/api/
COPY --from=build --chown=api:nodejs /app/package.json ./
# npm links every workspace from the root tree. The web app is never executed
# in this image, but its manifest must be present or npm commands run inside
# the container (migrations, seeding) trip over the dangling workspace link.
COPY --from=prod-deps --chown=api:nodejs /app/apps/web/package.json ./apps/web/

# Resume uploads land here when STORAGE_DRIVER=local.
RUN mkdir -p /app/apps/api/storage && chown -R api:nodejs /app/apps/api/storage

USER api
WORKDIR /app/apps/api
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tsc emits with apps/api as the root, so the entrypoint is dist/src, not
# dist/apps/api/src.
CMD ["node", "dist/src/server.js"]

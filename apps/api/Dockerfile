# syntax=docker/dockerfile:1.7
# apps/api/Dockerfile — Build multi-stage para NestJS API iWana neXt
# Basado en el patrón de apps/worker/Dockerfile

ARG NODE_VERSION=24.13.1
FROM node:${NODE_VERSION}-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

# ── deps: instalar dependencias con contexto completo del monorepo ──────────
FROM base AS deps

# Copiar manifiestos de todos los workspaces para que pnpm resuelva el grafo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json          apps/api/
COPY apps/portal/package.json       apps/portal/
COPY apps/web/package.json          apps/web/
COPY apps/worker/package.json       apps/worker/
COPY packages/config/package.json   packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json   packages/shared/
COPY packages/storage/package.json   packages/storage/
COPY packages/ui/package.json       packages/ui/

# HUSKY=0 evita que el hook "prepare" falle por ausencia de .git en Docker
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile --prod=false --ignore-scripts

# ── builder: compilar la API ─────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules                 ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/storage/node_modules  ./packages/storage/node_modules
COPY --from=deps /app/apps/api/node_modules          ./apps/api/node_modules

# Copiar el repo completo para preservar los links/junctions de workspace pnpm
COPY . .

# Los node_modules de deps incluyen los enlaces de todos los workspaces. Tras
# COPY . . se conservan porque .dockerignore excluye los node_modules del contexto.
# Este builder se valida sin una segunda instalación para evitar trabajo duplicado.

# Compilar dependencias en orden correcto antes de compilar la API
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/storage/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/api/tsconfig.json

# `deploy --prod` materializa la API y sus workspaces runtime sin dependencias
# de desarrollo. Se ejecuta después del build para incluir los artefactos dist.
RUN pnpm --filter @iwana/api deploy --prod --legacy /output

# ── runner: imagen mínima de producción ─────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# `deploy --prod` deja fuera pnpm global, toolchain y devDependencies. La
# configuración sigue llegando por variables de entorno, no desde el workspace.
COPY --from=builder --chown=nestjs:nodejs /output ./

USER nestjs

# Health check usando el endpoint GET /api/v1/health creado en HealthModule
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/api/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]

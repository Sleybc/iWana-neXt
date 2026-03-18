# apps/api/Dockerfile — Build multi-stage para NestJS API iWana neXt
# Basado en el patrón de apps/worker/Dockerfile

FROM node:24-bookworm AS base
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
COPY packages/ui/package.json       packages/ui/

# HUSKY=0 evita que el hook "prepare" falle por ausencia de .git en Docker
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── builder: compilar la API ─────────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules                 ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/api/node_modules          ./apps/api/node_modules

# Copiar el repo completo para preservar los links/junctions de workspace pnpm
COPY . .

# Rehidrata el grafo del monorepo dentro del builder
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Compilar dependencias en orden correcto antes de compilar la API
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/api/tsconfig.json

# ── runner: imagen mínima de producción ─────────────────────────────────────
FROM base AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copiar solo los artefactos necesarios para runtime
COPY --from=builder --chown=nestjs:nodejs /app/node_modules      ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api          ./apps/api
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared   ./packages/shared
COPY --from=builder --chown=nestjs:nodejs /app/packages/database ./packages/database

# El runtime no debe depender de archivos .env copiados desde el workspace.
# En contenedor la configuracion llega por variables de entorno inyectadas.
RUN rm -f /app/apps/api/.env /app/apps/api/.env.*

USER nestjs

WORKDIR /app/apps/api

# Health check usando el endpoint GET /api/v1/health creado en HealthModule
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main.js"]

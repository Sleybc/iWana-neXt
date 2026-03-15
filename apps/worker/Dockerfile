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

# HUSKY=0 evita que el hook "prepare" falle por ausencia de .git
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── builder: compilar el worker ─────────────────────────────────────────────
FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules

# Se copia el repo completo para preservar los links/junctions de workspace que usa pnpm.
COPY . .

# Rehidrata el grafo del monorepo dentro del builder para evitar enlaces rotos
# al copiar `node_modules` entre stages en Docker.
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# El worker depende de artefactos compilados de @iwana/shared y @iwana/db.
# `pnpm exec` resuelve el binario real dentro de `.pnpm` sin depender de rutas fijas.
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/worker/tsconfig.json

# ── runner: imagen mínima de producción ────────────────────────────────────
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=worker:nodejs /app/apps/worker ./apps/worker
COPY --from=builder --chown=worker:nodejs /app/packages/shared ./packages/shared
COPY --from=builder --chown=worker:nodejs /app/packages/database ./packages/database

USER worker

WORKDIR /app/apps/worker

CMD ["node", "dist/main.js"]

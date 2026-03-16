# apps/web/Dockerfile — Build multi-stage para Next.js App Router (@iwana/web)
# output: 'standalone' configurado en apps/web/next.config.ts

FROM node:24-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

# ── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json          apps/api/
COPY apps/portal/package.json       apps/portal/
COPY apps/web/package.json          apps/web/
COPY apps/worker/package.json       apps/worker/
COPY packages/config/package.json   packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json   packages/shared/
COPY packages/ui/package.json       packages/ui/

RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder

# NEXT_PUBLIC_API_URL se bake en el bundle de Next.js en tiempo de build.
# Debe apuntar a la URL pública del API: http://10.0.0.2:${APP_PORT}/api/v1
# Pasar como ARG → ENV para que Next.js lo exponga al cliente.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules                ./node_modules
COPY --from=deps /app/packages/config/node_modules   ./packages/config/node_modules
COPY --from=deps /app/packages/shared/node_modules   ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules       ./packages/ui/node_modules
COPY --from=deps /app/apps/web/node_modules          ./apps/web/node_modules

COPY . .

# Rehidrata el grafo del monorepo
RUN CI=true HUSKY=0 pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Compilar dependencias compartidas
RUN pnpm exec tsc --project packages/shared/tsconfig.json

# Build Next.js (usa output: 'standalone' automáticamente desde next.config.ts)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @iwana/web build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone: el output incluye server.js + todas las dependencias necesarias
# La ruta es apps/web/.next/standalone/ (relativa a la raíz del monorepo en builder)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static     ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public           ./apps/web/public

USER nextjs

EXPOSE 3001

# El server.js generado por Next.js standalone está en: /app/apps/web/server.js
CMD ["node", "apps/web/server.js"]

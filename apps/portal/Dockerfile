# syntax=docker/dockerfile:1.7
# apps/portal/Dockerfile — build multi-stage de Next.js App Router (@iwana/portal)
# output: 'standalone' configurado en apps/portal/next.config.ts
#
# Toda la cadena (base, deps, builder y runner) usa la MISMA variante Alpine.
# Antes se instalaba y compilaba sobre bookworm (glibc) y se ejecutaba sobre
# alpine (musl): el output standalone de Next arrastraba hasta la imagen final
# @img/sharp-linux-x64/lib/sharp-linux-x64-*.node —un binario glibc— sobre una
# base musl, donde `require('sharp')` falla al optimizar imágenes. Con la cadena
# homogénea pnpm resuelve las variantes linuxmusl y el binario coincide con la
# libc del runner.

ARG NODE_VERSION=24.13.1
# Debe coincidir con `packageManager` del package.json raíz.
ARG PNPM_VERSION=10.32.1

# ── base: toolchain mínimo compartido por deps y builder ────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NEXT_TELEMETRY_DISABLED=1
# corepack en vez de `npm install -g pnpm`: evita dejar la caché de npm en la
# capa y usa el mismo mecanismo que ya declara `packageManager` en el repo.
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ── deps: grafo de dependencias del monorepo ────────────────────────────────
# Solo manifiestos: la capa se revalida cuando cambia el grafo, no el código.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json          apps/api/
COPY apps/portal/package.json       apps/portal/
COPY apps/web/package.json          apps/web/
COPY apps/worker/package.json       apps/worker/
COPY packages/config/package.json   packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json   packages/shared/
COPY packages/storage/package.json  packages/storage/
COPY packages/ui/package.json       packages/ui/

# HUSKY=0 evita que el hook "prepare" falle por ausencia de .git en Docker.
# El filtro materializa el subgrafo de esta app más el workspace raíz (de donde
# salen typescript y turbo). `--frozen-lockfile` sigue validando el lockfile
# completo: el filtro no relaja la verificación, solo evita instalar el subgrafo
# de NestJS/TypeORM/AWS SDK, que esta imagen nunca usa.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile \
      --prod=false --ignore-scripts \
      --filter "@iwana/portal..." --filter "iwana-next"

# ── builder ─────────────────────────────────────────────────────────────────
# Deriva de `deps` en vez de recopiar node_modules stage a stage: la lista
# explícita de `COPY --from=deps <ws>/node_modules` había que mantenerla a mano
# por cada workspace nuevo y ya estaba desincronizada entre Dockerfiles.
FROM deps AS builder

# NEXT_PUBLIC_PORTAL_API_URL se hornea en el bundle del navegador en tiempo de build.
# C-4 (ADR-081): cada aplicación usa su propia variable de URL del API.
ARG NEXT_PUBLIC_PORTAL_API_URL
ENV NEXT_PUBLIC_PORTAL_API_URL=$NEXT_PUBLIC_PORTAL_API_URL

# Solo los workspaces de esta app. `COPY <dir> <dir>` fusiona sobre el
# directorio existente, así que los node_modules creados en `deps` (que
# .dockerignore mantiene fuera del contexto) sobreviven a esta copia.
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/ui     packages/ui
COPY apps/portal      apps/portal

RUN pnpm exec tsc --project packages/shared/tsconfig.json
RUN pnpm --filter @iwana/portal build

# ── runner: imagen mínima de producción ─────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    HOME=/home/nextjs \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# --ingroup: antes el usuario quedaba en `nogroup` mientras los archivos se
# copiaban con grupo `nodejs`, de modo que el bit de grupo no aplicaba a nadie.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs --home /home/nextjs nextjs

# Next standalone ya trae server.js con el cierre mínimo de dependencias.
# --link crea capas independientes del padre; con --link el chown es numérico
# (1001:1001 = nextjs:nodejs).
COPY --from=builder --link --chown=1001:1001 /app/apps/portal/.next/standalone ./
COPY --from=builder --link --chown=1001:1001 /app/apps/portal/.next/static     ./apps/portal/.next/static
COPY --from=builder --link --chown=1001:1001 /app/apps/portal/public           ./apps/portal/public

USER nextjs

EXPOSE 3002

# Next.js no expone ruta de salud propia. El probe comprueba que el servidor
# acepta la conexión y responde HTTP sin error de servidor: tolera la
# redirección a /auth/login y solo falla ante 5xx o socket cerrado.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=3s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3002/',(r)=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

STOPSIGNAL SIGTERM

CMD ["node", "apps/portal/server.js"]

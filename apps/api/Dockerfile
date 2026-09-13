# syntax=docker/dockerfile:1.7
# apps/api/Dockerfile — build multi-stage de la API NestJS (@iwana/api)
#
# Invariantes compartidos con worker, web, portal y migrator:
#   1. Ningún stage usa la variante completa de node. La instalación corre con
#      --ignore-scripts, así que no hay node-gyp y el toolchain de
#      `node:*-bookworm` (python3/make/g++/git) nunca se ejecuta.
#   2. `builder` solo recibe los workspaces que participan en ESTE build: un
#      cambio en apps/web no invalida la caché de la API.
#   3. La imagen final no contiene pnpm, devDependencies, fuentes TypeScript,
#      sourcemaps ni declaraciones.

ARG NODE_VERSION=24.13.1
# Debe coincidir con `packageManager` del package.json raíz.
ARG PNPM_VERSION=10.32.1

# ── base: toolchain mínimo compartido por deps y builder ────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
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
# El filtro materializa solo el subgrafo de la API más el workspace raíz (de
# donde salen typescript y turbo). `--frozen-lockfile` sigue validando el
# lockfile completo: el filtro no relaja la verificación, solo evita instalar
# next/react/leaflet/playwright, que esta imagen nunca usa.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile \
      --prod=false --ignore-scripts \
      --filter "@iwana/api..." --filter "iwana-next"

# ── builder: compilar la API ────────────────────────────────────────────────
# Deriva de `deps` en vez de recopiar node_modules stage a stage: la lista
# explícita de `COPY --from=deps <ws>/node_modules` había que mantenerla a mano
# por cada workspace nuevo y ya estaba desincronizada entre Dockerfiles.
FROM deps AS builder

# Solo los workspaces del subgrafo de la API. `COPY <dir> <dir>` fusiona sobre
# el directorio existente, así que los node_modules creados en `deps` (que
# .dockerignore mantiene fuera del contexto) sobreviven a esta copia.
COPY packages/config   packages/config
COPY packages/shared   packages/shared
COPY packages/storage  packages/storage
COPY packages/database packages/database
COPY apps/api          apps/api

# `pnpm exec` resuelve el binario real dentro de `.pnpm` sin rutas fijas.
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/storage/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/api/tsconfig.json

# `deploy --prod` materializa la API y sus workspaces runtime sin dependencias
# de desarrollo. Se ejecuta después del build para incluir los artefactos dist.
RUN pnpm --filter @iwana/api deploy --prod --legacy /output

# Poda de artefactos de build. Se aplica SOLO a /output y a los workspaces
# propios (@iwana/*); nunca se podan nombres coincidentes dentro de paquetes de
# terceros. Mismo criterio que packages/database/Dockerfile.migrator.
#   - .map y .d.ts: Node no los carga (los .map solo los leen depuradores y los
#     .d.ts solo tsc). En la imagen previa eran 95 MB de los 225 MB de /app y
#     además exponían la estructura del código fuente.
#   - src/, test/, tsconfig*.json, jest.config*.js, Dockerfile*: `pnpm deploy`
#     copia el directorio del paquete completo, de modo que las fuentes
#     TypeScript y hasta el propio Dockerfile viajaban a producción.
# Los LICENSE y README de terceros NO se tocan: conservarlos es obligación de
# las licencias de redistribución, no peso prescindible.
RUN set -eu; \
    find /output -type f \( -name '*.map' -o -name '*.d.ts' \) -delete; \
    for iwana_dir in $(find /output/node_modules -type d -name '@iwana'); do \
      for pkg_dir in "$iwana_dir"/*; do \
        [ -d "$pkg_dir" ] || continue; \
        rm -rf -- "$pkg_dir/src" "$pkg_dir/test" "$pkg_dir/tsconfig.json" \
          "$pkg_dir/tsconfig.typecheck.json" "$pkg_dir/jest.config.js" \
          "$pkg_dir/jest.integration.config.js" "$pkg_dir/Dockerfile.migrator"; \
      done; \
    done; \
    rm -rf -- /output/src /output/test /output/tsconfig.json \
      /output/tsconfig.typecheck.json /output/jest.config.js \
      /output/jest.integration.config.js /output/Dockerfile; \
    test -f /output/dist/main.js; \
    test -f /output/assets/fonts/Exo2-Regular.ttf; \
    test ! -e /output/src; \
    test -z "$(find /output -type f \( -name '*.map' -o -name '*.d.ts' \) -print -quit)"

# Smoke test del cierre de dependencias tras la poda: carga el grafo pesado sin
# levantar el servidor ni abrir conexiones. Si la poda rompiera un paquete, el
# build falla aquí y no en producción.
RUN cd /output && node -e "require('reflect-metadata');require('@nestjs/core');require('@nestjs/platform-express');require('typeorm');require('@iwana/db');require('@iwana/storage');require('@iwana/shared');"

# ── runner: imagen mínima de producción ─────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOME=/home/nestjs \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# --ingroup: antes el usuario quedaba en `nogroup` mientras los archivos se
# copiaban con grupo `nodejs`, de modo que el bit de grupo no aplicaba a nadie.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs --home /home/nestjs nestjs

# `deploy --prod` deja fuera pnpm global, toolchain y devDependencies. La
# configuración sigue llegando por variables de entorno, no desde el workspace.
# --link crea una capa independiente del padre: un rebase de la imagen base no
# obliga a rehacer la copia. Con --link el chown debe ser numérico.
COPY --from=builder --link --chown=1001:1001 /output ./

USER nestjs

EXPOSE 3000

# 127.0.0.1 y no `localhost`: Node resuelve localhost a ::1 primero y el
# servidor escucha en IPv4, así que el probe podía fallar contra un API sano.
# start-interval acorta la ventana de arranque sin acortar el intervalo estable.
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --start-interval=3s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]

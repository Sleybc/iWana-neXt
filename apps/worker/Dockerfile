# syntax=docker/dockerfile:1.7
# apps/worker/Dockerfile — build multi-stage del worker BullMQ (@iwana/worker)
#
# Mismos invariantes que apps/api/Dockerfile: build sobre la variante slim, el
# stage `builder` solo recibe los workspaces de este subgrafo y la imagen final
# no contiene pnpm, devDependencies, fuentes TypeScript, sourcemaps ni
# declaraciones.

ARG NODE_VERSION=24.13.1
# Debe coincidir con `packageManager` del package.json raíz.
ARG PNPM_VERSION=10.32.1

# ── base: toolchain mínimo compartido por deps y builder ────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app

# ── deps: grafo de dependencias del monorepo ────────────────────────────────
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
# El filtro materializa el subgrafo del worker más el workspace raíz (typescript
# y turbo). `--frozen-lockfile` sigue validando el lockfile completo.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile \
      --prod=false --ignore-scripts \
      --filter "@iwana/worker..." --filter "iwana-next"

# ── builder: compilar el worker ─────────────────────────────────────────────
FROM deps AS builder

COPY packages/config   packages/config
COPY packages/shared   packages/shared
COPY packages/storage  packages/storage
COPY packages/database packages/database
COPY apps/worker       apps/worker

# El worker depende de artefactos compilados de @iwana/shared, @iwana/storage y
# @iwana/db. `pnpm exec` resuelve el binario real dentro de `.pnpm`.
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/storage/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json && \
    pnpm exec tsc --project apps/worker/tsconfig.json

# `deploy --prod` materializa el worker y sus workspaces runtime sin
# dependencias de desarrollo, después de producir los artefactos dist.
RUN pnpm --filter @iwana/worker deploy --prod --legacy /output

# Poda de artefactos de build. Se aplica SOLO a /output y a los workspaces
# propios (@iwana/*); nunca se podan nombres coincidentes dentro de paquetes de
# terceros. Mismo criterio que packages/database/Dockerfile.migrator.
#   - .map y .d.ts: Node no los carga (los .map solo los leen depuradores y los
#     .d.ts solo tsc) y además exponen la estructura del código fuente.
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
          "$pkg_dir/tsconfig.typecheck.json" "$pkg_dir/tsconfig.test.json" \
          "$pkg_dir/jest.config.js" "$pkg_dir/jest.integration.config.js" \
          "$pkg_dir/Dockerfile.migrator"; \
      done; \
    done; \
    rm -rf -- /output/src /output/test /output/coverage /output/tsconfig.json \
      /output/tsconfig.typecheck.json /output/tsconfig.test.json \
      /output/jest.config.js /output/jest.integration.config.js /output/Dockerfile; \
    test -f /output/dist/main.js; \
    test ! -e /output/src; \
    test -z "$(find /output -type f \( -name '*.map' -o -name '*.d.ts' \) -print -quit)"

# Smoke test del cierre de dependencias tras la poda: carga el grafo pesado sin
# abrir conexiones a Redis ni a Postgres. Si la poda rompiera un paquete, el
# build falla aquí y no en producción.
RUN cd /output && node -e "require('reflect-metadata');require('@nestjs/core');require('bullmq');require('typeorm');require('@iwana/db');require('@iwana/storage');require('@iwana/shared');"

# ── runner: imagen mínima de producción ─────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOME=/home/worker \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# --ingroup: antes el usuario quedaba en `nogroup` mientras los archivos se
# copiaban con grupo `nodejs`.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs --home /home/worker worker

# --link crea una capa independiente del padre; con --link el chown es numérico.
COPY --from=builder --link --chown=1001:1001 /output ./

USER worker

# El worker consume colas BullMQ: SIGTERM debe llegar al proceso Node para que
# cierre los jobs en vuelo. `init: true` en compose mantiene el reaper de PID 1.
STOPSIGNAL SIGTERM

CMD ["node", "dist/main.js"]

# PLAT-OPS Deuda de Bajo Riesgo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar D4, D6 y la mitad restante de A2 sin modificar las deudas que requieren ADR o decisión de CTO.

**Architecture:** El proxy de desarrollo conservará el prefijo global `/api/v1`; el liberador de puertos clasificará PIDs y solo terminará watchers del workspace; el migrator usará un builder completo y un runner `bookworm-slim` con el deploy de producción de `@iwana/db`. La documentación actualizará únicamente los estados demostrados por las pruebas.

**Tech Stack:** Nginx, Docker multi-stage, Node.js 24.13.1, pnpm 10.32.1, Node test runner, TypeScript, GitHub Actions.

---

## Mapa de archivos

- Modify: `nginx/nginx.dev.conf` — preservar rutas `/api/v1` y apuntar `/health` al endpoint real de NestJS.
- Create: `scripts/nginx-config.test.mjs` — prueba estructural de las reglas del proxy de desarrollo.
- Modify: `scripts/free-dev-ports.mjs` — clasificar PIDs propios frente a externos y fallar sin matar procesos ajenos.
- Modify: `scripts/free-dev-ports.test.mjs` — pruebas puras de clasificación de PIDs.
- Modify: `package.json` — incluir la prueba nginx en `test:tooling`.
- Modify: `packages/database/package.json` — declarar `@iwana/shared` como dependencia runtime.
- Modify: `pnpm-lock.yaml` — actualizar el grafo después del cambio de dependencia.
- Modify: `packages/database/Dockerfile.migrator` — separar dependencias, compilación y runtime.
- Modify: `docs/informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md` — cerrar D4, D6 y A2 con evidencia, manteniendo B4/A1/A3/A4/A8/A9 abiertos.
- Modify: `docs/specs/2026-08-03-plat-ops-deuda-bajo-riesgo-design.md` — solo si la implementación descubre una desviación aprobada del diseño.

## Task 1: Corregir el proxy de desarrollo D4

**Files:**
- Modify: `nginx/nginx.dev.conf:13-35`
- Create: `scripts/nginx-config.test.mjs`
- Modify: `package.json:20`

- [ ] **Step 1: Write the failing configuration test**

Create `scripts/nginx-config.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const configPath = fileURLToPath(new URL('../nginx/nginx.dev.conf', import.meta.url));

test('nginx dev preserves the API global prefix', async () => {
  const config = await readFile(configPath, 'utf8');
  const apiLocation = config.match(/location \/api\/ \{([\s\S]*?)\n    \}/)?.[1] ?? '';

  assert.match(apiLocation, /proxy_pass http:\/\/api;/);
  assert.doesNotMatch(apiLocation, /proxy_pass http:\/\/api\//);
});

test('nginx dev health proxies to the real Nest health endpoint', async () => {
  const config = await readFile(configPath, 'utf8');
  const healthLocation = config.match(/location \/health \{([\s\S]*?)\n    \}/)?.[1] ?? '';

  assert.match(healthLocation, /proxy_pass http:\/\/api\/api\/v1\/health;/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run from the worktree root:

```text
node --test scripts/nginx-config.test.mjs
```

Expected: the first assertion fails because the current API location uses
`proxy_pass http://api/;`, and the health assertion fails because it targets
`/health` instead of `/api/v1/health`.

- [ ] **Step 3: Apply the minimal proxy correction**

Change only these directives in `nginx/nginx.dev.conf`:

```nginx
location /health {
    proxy_pass http://api/api/v1/health;
    # existing proxy headers remain unchanged
}

location /api/ {
    proxy_pass http://api;
    # existing proxy headers remain unchanged
}
```

- [ ] **Step 4: Run the focused test and nginx syntax validation**

Run:

```text
node --test scripts/nginx-config.test.mjs
docker run --rm -v "${PWD}/nginx/nginx.dev.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.31.2-alpine nginx -t
```

Expected: two Node tests pass and nginx reports `syntax is ok` plus
`test is successful`.

- [ ] **Step 5: Include the new test in tooling validation**

Change the root script to:

```json
"test:tooling": "node --test scripts/dev.test.mjs scripts/free-dev-ports.test.mjs scripts/nginx-config.test.mjs"
```

Run `pnpm test:tooling`; expected result is the previous tooling suite plus two
new passing nginx tests.

- [ ] **Step 6: Commit the D4 change**

```text
git add nginx/nginx.dev.conf scripts/nginx-config.test.mjs package.json
git commit -m "fix(nginx): preserve api prefix in dev proxy"
```

## Task 2: Close D6 without killing external processes

**Files:**
- Modify: `scripts/free-dev-ports.mjs:149-182,252-289`
- Modify: `scripts/free-dev-ports.test.mjs`

- [ ] **Step 1: Add pure classification tests**

Import `classifyDevPids` from `scripts/free-dev-ports.mjs` and add:

```js
test('classifyDevPids separates external listeners from workspace watchers', () => {
  assert.deepEqual(
    classifyDevPids([101, 202, 303, 303], [202, 404, 404]),
    { safePids: [202, 404], externalPids: [101, 303] },
  );
});

test('classifyDevPids permits cleaning a stale watcher without a listening socket', () => {
  assert.deepEqual(classifyDevPids([], [404]), {
    safePids: [404],
    externalPids: [],
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```text
node --test scripts/free-dev-ports.test.mjs
```

Expected: Node reports that `classifyDevPids` is not exported.

- [ ] **Step 3: Implement the pure classifier**

Add this export after `findRepoWatcherPids`:

```js
export function classifyDevPids(portPids, repoWatcherPids) {
  const uniquePortPids = [...new Set(portPids)];
  const safePids = [...new Set(repoWatcherPids)];
  const safeSet = new Set(safePids);
  const externalPids = uniquePortPids.filter((pid) => !safeSet.has(pid));

  return { safePids, externalPids };
}
```

- [ ] **Step 4: Use the classifier in the cleanup loop**

Replace the direct union at both cleanup reads with this sequence:

```js
const portPids = getPidsUsingPorts(DEV_PORTS);
const repoWatcherPids = getRepoWatcherPids();
const { safePids, externalPids } = classifyDevPids(portPids, repoWatcherPids);

if (externalPids.length > 0) {
  console.warn(
    `No se detienen procesos externos en puertos de desarrollo: ${externalPids.join(', ')}.`,
  );
}
```

Terminate only `safePids`. If a sweep has no `safePids` but has external PIDs,
set `process.exitCode = 1` and return. After the final sweep, set exit code 1
whenever external PIDs remain, even if all repo watchers were cleaned. Keep the
existing retry count and SIGKILL/taskkill behavior for the safe set.

- [ ] **Step 5: Run all port cleanup tests**

Run:

```text
node --test scripts/free-dev-ports.test.mjs
```

Expected: all existing ancestor, Unix, Windows and new classification tests
pass. No test starts or kills a real process.

- [ ] **Step 6: Commit the D6 change**

```text
git add scripts/free-dev-ports.mjs scripts/free-dev-ports.test.mjs
git commit -m "fix(dev): protect external processes when freeing ports"
```

## Task 3: Convert the migrator to multi-stage A2

**Files:**
- Modify: `packages/database/package.json:23-36`
- Modify: `pnpm-lock.yaml` through the package-manager command
- Modify: `packages/database/Dockerfile.migrator`

- [ ] **Step 1: Make the runtime workspace dependency explicit**

Move this entry from `devDependencies` to `dependencies` in
`packages/database/package.json`:

```json
"@iwana/shared": "workspace:*"
```

Do not move `@iwana/config`: it is consumed by TypeScript configuration and is
not imported by compiled database runtime code.

- [ ] **Step 2: Regenerate only the lockfile metadata**

Run:

```text
pnpm install --lockfile-only
```

Expected: the lockfile records `@iwana/shared` as a production dependency of
`@iwana/db`; no unrelated package version changes are accepted in the diff.

- [ ] **Step 3: Replace the single-stage Dockerfile with the three-stage build**

Use this structure in `packages/database/Dockerfile.migrator`:

```dockerfile
# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24.13.1

FROM node:${NODE_VERSION}-bookworm AS base
WORKDIR /app
RUN npm install -g pnpm@10.32.1

FROM base AS deps
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile --ignore-scripts

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/config/package.json ./packages/config/
COPY packages/database ./packages/database
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm exec tsc --project packages/shared/tsconfig.json && \
    pnpm exec tsc --project packages/database/tsconfig.json
RUN pnpm --filter @iwana/db deploy --prod --legacy /output

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOME=/home/node
COPY --from=builder --chown=node:node /output ./
USER node
CMD ["sh", "-ec", "node node_modules/typeorm/cli.js migration:run -d dist/data-source.js && node dist/cli/tenant-migrate.js"]
```

The final stage must not install pnpm or copy the builder toolchain. The direct
TypeORM CLI path is deterministic in the production dependency tree and the
second command invokes the already compiled tenant runner. The command preserves
the existing public-then-tenant ordering and exit-code propagation.

- [ ] **Step 4: Build the migrator image**

Run:

```text
docker build --file packages/database/Dockerfile.migrator --build-arg NODE_VERSION=24.13.1 --tag iwana-ci/migrator:debt-low-risk .
```

Expected: build succeeds and the final image contains the compiled database and
shared outputs.

- [ ] **Step 5: Inspect the runtime contract**

Run:

```text
docker run --rm --entrypoint sh iwana-ci/migrator:debt-low-risk -ec "id -u; node --version; command -v pnpm || true; test ! -d /app/node_modules/typescript && echo no-typescript"
```

Expected: UID is `1000`, Node is `v24.13.1`, pnpm is absent from the final
runner, and `no-typescript` is printed. Do not run migrations against a real
database in this inspection step.

- [ ] **Step 6: Commit the migrator change**

```text
git add packages/database/package.json pnpm-lock.yaml packages/database/Dockerfile.migrator
git commit -m "build(db): use production-only multi-stage migrator"
```

## Task 4: Update evidence and validate the PR

**Files:**
- Modify: `docs/informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md:41-80,322-333,406-424,431-439,440-451`

- [ ] **Step 1: Update the audit statuses with exact scope**

Apply these exact status changes in the audit report:

```text
2.1 B4 — remains Abierto.
2.2 A1 — remains Escalado; A3 remains Parcial; A4 remains Parcial; A8 and A9
remain Escalados.
2.4 D4 — Cerrado: dev and prod preserve /api/v1; structural test and nginx -t
pass.
2.4 D6 — Cerrado: external PIDs are reported and never terminated; repository
watchers remain cleanable; focused tests pass.
2.2 A2 — Cerrado: migrator is multi-stage, slim, non-root, and production-only.
```

In the §7 table, add an `Estado` column and mark A2, D4 and D6 as `Cerrado` with
the evidence above. Keep B4, A1, A3, A4 (resources/networks), A8 and A9
explicitly open and preserve their proposed owners. In §8, change only the A2
row to `Cerrado` and add that D4/D6 are closed by this remediation. In §9,
replace the closing sentence with:

```text
Quedan abiertas B4, A1, A3, A4 (recursos y redes), A8 y A9, con los
destinatarios y decisiones indicados en §7. A2, D4 y D6 quedan cerrados por
esta remediación; el cierre no altera el estado G7 definido por ADR-070.
```

- [ ] **Step 2: Run focused and repository validation**

Run in order:

```text
pnpm test:tooling
pnpm --filter @iwana/db typecheck
pnpm lint
pnpm typecheck
pnpm test --force
docker build --file packages/database/Dockerfile.migrator --build-arg NODE_VERSION=24.13.1 --tag iwana-ci/migrator:debt-low-risk .
```

Expected: all commands exit 0; the full test run must report `Cached: 0` or be
run with the repository's force flag so the evidence is not restored from Turbo
cache.

- [ ] **Step 3: Run documentation audits**

```text
pnpm audit:doc-locations
pnpm audit:adr-citations
```

Expected: `BLOQUEANTE: 0` in both outputs.

- [ ] **Step 4: Review the complete diff and local status**

```text
git diff --check
git diff origin/main...HEAD --stat
git status --short --branch
```

Expected: only the spec, plan, proxy, tooling tests, port cleaner, database
package/lockfile, migrator Dockerfile and audit report are changed; no files
from the user's dirty main checkout appear in this branch.

- [ ] **Step 5: Push the branch and open a GitHub PR**

```text
git push -u origin codex/plat-ops-debt-low-risk
```

Create a PR against `main` with the title
`fix(plat-ops): close low-risk Docker audit debt` and include:

```text
Closes D4, D6 and the remaining A2 migrator single-stage debt.
Does not change B4, A1, A3, A4, A8 or A9; those remain open because they require
application/security/CTO decisions documented in the Docker audit §7.

Validation: test:tooling, db typecheck, lint, typecheck, forced unit suite,
migrator image build/inspection, documentation audits.
```

- [ ] **Step 6: Wait for and record GitHub Actions evidence**

Use the authenticated GitHub API to verify the PR's Linux CI jobs. Record the
run ID, validated head SHA, all job conclusions, and the migrator image build
result in the Docker audit report before claiming D4, D6 or A2 closed.

- [ ] **Step 7: Commit final evidence if needed and finish through the PR**

If the run adds no new documentation changes, merge only after all required CI
checks are green. If evidence updates are needed, commit them to the same
branch, rerun the checks, and merge only the final green head. Never commit the
unrelated dirty files from the original `main` checkout.

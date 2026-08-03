# Convergencia Node 24 LTS — Plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: usar `subagent-driven-development` por tarea, con revisión de cumplimiento y después revisión de calidad. Las tareas se siguen con checkboxes.

**Objetivo:** Alinear las cinco imágenes y los workflows de CI a Node 24 LTS mediante `pnpm-workspace.yaml.useNodeVersion`, reduciendo trabajo duplicado de build sin alterar código de aplicación.

**Arquitectura:** `useNodeVersion` es la única fuente autoritativa. Los Dockerfiles reciben `NODE_VERSION` como argumento de build y los workflows extraen ese valor tras `checkout`; E7 comprueba que todas las referencias derivadas permanezcan iguales. API y worker cambian a runners de producción limpios solo si las construcciones y los arranques reales conservan sus dependencias de runtime.

**Tecnologías:** Node 24.13.1, pnpm 10, Docker BuildKit, GitHub Actions y Node test runner.

---

### Task 1: Registrar decisión y proteger la fuente única

**Files:**

- Modify: `docs/adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md:3-7`
- Modify: `pnpm-workspace.yaml:80`

- [ ] **Step 1: Confirmar la decisión aprobada**

Verificar que el ADR tiene `Estado: Aprobado` y aprobación del CTO fechada el 2026-08-03. Mantener `useNodeVersion: 24.13.1`; no cambiar `package.json.engines.node`, que conserva el mínimo `>=24.0.0`.

- [ ] **Step 2: Verificar las variantes de base**

Run: `docker manifest inspect node:24.13.1-bookworm; docker manifest inspect node:24.13.1-alpine; docker manifest inspect node:24.13.1-bookworm-slim`

Expected: los tres manifests existen antes de modificar los `FROM`.

### Task 2: Escribir E7 antes de modificar las declaraciones

**Files:**

- Modify: `scripts/dev.test.mjs`
- Modify: `package.json:20`

- [ ] **Step 1: Añadir los helpers de lectura**

Añadir un test Node nativo que lea `pnpm-workspace.yaml`, los cinco Dockerfiles y los dos workflows. El test debe extraer `useNodeVersion` con `/^useNodeVersion:\s*(24\.\d+\.\d+)$/m` y validar que es la única fuente autoritativa.

```js
const workspaceVersion = workspace.match(/^useNodeVersion:\s*(24\.\d+\.\d+)$/m)?.[1];
assert.match(workspaceVersion ?? '', /^24\.\d+\.\d+$/);
```

- [ ] **Step 2: Cubrir las referencias derivadas**

Exigir que los cinco Dockerfiles declaren `ARG NODE_VERSION=24.13.1` y usen exclusivamente `node:${NODE_VERSION}` en cada `FROM`; exigir que los workflows extraigan la versión del workspace, usen el output en cada `setup-node`, y entreguen `--build-arg NODE_VERSION=` a las cinco construcciones del job de imágenes.

- [ ] **Step 3: Confirmar la falla inicial**

Run: `pnpm test:tooling`

Expected: FAIL porque las imágenes de aplicación siguen con `node:25.8.2` y CI conserva `24.x`.

- [ ] **Step 4: Mantener el script público**

El test se ejecutará bajo el script existente `test:tooling`; no crear runners ni tipos duplicados.

### Task 3: Parametrizar y optimizar los cinco Dockerfiles

**Files:**

- Modify: `apps/api/Dockerfile`
- Modify: `apps/worker/Dockerfile`
- Modify: `apps/web/Dockerfile`
- Modify: `apps/portal/Dockerfile`
- Modify: `packages/database/Dockerfile.migrator`

- [ ] **Step 1: Parametrizar las bases**

Anteponer `ARG NODE_VERSION=24.13.1` a cada Dockerfile y sustituir las bases por las variantes conservadas:

```dockerfile
ARG NODE_VERSION=24.13.1
FROM node:${NODE_VERSION}-bookworm AS base
```

Web y portal conservan su runner `node:${NODE_VERSION}-alpine`; migrator conserva `node:${NODE_VERSION}-bookworm-slim`. No modificar el hardening no-root ya existente del migrator.

- [ ] **Step 2: Aplicar cache BuildKit al store de pnpm**

Para cada instalación que se mantenga, declarar el store estable y el mount:

```dockerfile
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true HUSKY=0 pnpm install --store-dir=/pnpm/store --frozen-lockfile --prod=false --ignore-scripts
```

No montar el store en el runner ni usar el cache para datos o secretos.

- [ ] **Step 3: Validar y retirar solo los installs redundantes**

Construir primero cada imagen con el segundo `pnpm install` presente. Si los enlaces de workspace siguen válidos tras quitarlo, eliminar la segunda instalación de los builders API, worker, web y portal. Si falla, conservarlo con comentario que describa la evidencia; no sustituirlo con una aproximación no verificada.

- [ ] **Step 4: Limpiar runners API y worker**

Usar una base de runtime Node 24 sin `pnpm` global y copiar exclusivamente artefactos runtime/producción. El cambio se acepta solo tras comprobar que no hay `pnpm`, toolchain ni `devDependencies` requeridas para arrancar; el usuario `nestjs`/`worker` y el healthcheck de API se conservan.

### Task 4: Derivar CI de la fuente única y cubrir las imágenes

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/e2e-web-admin-smoke.yml`

- [ ] **Step 1: Extraer `useNodeVersion` por job**

Después de cada `checkout` y antes de `setup-node`, usar un step Bash `id: node-version` que valide el formato y escriba el output:

```yaml
run: |
  set -euo pipefail
  version="$(sed -n 's/^useNodeVersion: //p' pnpm-workspace.yaml)"
  [[ "$version" =~ ^24\.[0-9]+\.[0-9]+$ ]]
  echo "version=$version" >> "$GITHUB_OUTPUT"
```

- [ ] **Step 2: Reemplazar pins flotantes**

Usar `node-version: ${{ steps.node-version.outputs.version }}` en los cuatro setup-node afectados. Eliminar todas las apariciones de `'24.x'` sin introducir `node:24`, `24.x` o `latest`.

- [ ] **Step 3: Propagar `NODE_VERSION` a las cinco imágenes**

Añadir el build arg a API, web, portal, worker y migrator:

```yaml
--build-arg NODE_VERSION=${{ steps.node-version.outputs.version }}
```

Conservar el `NEXT_PUBLIC_API_URL` sintético como dato público y no añadir secretos a argumentos de build.

### Task 5: Medir, verificar y documentar la fase

**Files:**

- Create: `docs/informes/INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md`
- Modify: `docs/informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md`
- Modify: `docs/prds/Stack_Tecnologico.md` (solo si declara el patch de Node)
- Modify: `CLAUDE.md` y `AGENTS.md` (solo si fijan el patch de Node)
- Modify: `docs/adrs/ADR-071-Convergencia-Runtime-Node-24-LTS.md`

- [ ] **Step 1: Ejecutar E7 y las verificaciones estáticas**

Run: `pnpm test:tooling; rg -n 'node:25|node:24($|[^.])|24\.x|:latest' --glob '!node_modules' .; pnpm lint; pnpm typecheck; pnpm audit:adr-citations; pnpm audit:doc-locations`

Expected: tooling, lint, typecheck y auditorías terminan con código 0; la búsqueda no deja referencias prohibidas dentro del alcance.

- [ ] **Step 2: Medir las cinco imágenes**

Registrar por imagen el tiempo de build frío/caliente y el tamaño de `docker image inspect`. Construir API, worker, web, portal y migrator con `--build-arg NODE_VERSION=24.13.1`; no borrar volúmenes ni datos.

- [ ] **Step 3: Verificar runtime y Compose**

Ejecutar API y worker con su configuración requerida, comprobar API `GET /api/v1/health` igual a 200, carga de `sharp` y `msgpackr-extract`, y `id -u` distinto de 0 para API, worker y migrator. Ejecutar `config --quiet` en Compose dev, prod y E2E.

- [ ] **Step 4: Ejecutar gates de suite y limpieza**

Run: `turbo run test --concurrency=1 --force; pnpm dev`

Expected: evidencia de `Cached: 0`, servicios API/web/portal/worker disponibles y bucket creado. Retirar al final solo imágenes y cache creados por esta verificación, conservando el baseline y todos los volúmenes.

- [ ] **Step 5: Consolidar evidencia documental**

Crear el informe de fase con tabla antes/después, evidencia de CA-01 a CA-15, riesgos/deuda abierta y el `[DESEMPATE]` de CA-02: la fuente es única de forma autoritativa; las referencias derivadas permitidas son verificadas por E7. Actualizar A7, C1, C2, C3 y propuestas 6, 8, 9 y 10 del informe vivo; marcar ADR-071 implementado solo con evidencia ejecutada.


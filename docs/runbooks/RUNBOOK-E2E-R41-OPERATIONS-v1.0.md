# RUNBOOK — E2E operativo R4.1

**Tipo:** Runbook operativo de pruebas
**Módulo:** MOD09–MOD11 — Órdenes de ejecución
**Versión:** 1.0
**Fecha:** 2026-07-31
**Autor:** AI-PLAT-OPS
**Alcance:** desarrollo local y CI efímero; nunca producción

## 1. Propósito

Ejecutar el flujo vertical de R4.1 contra PostgreSQL, Redis/BullMQ, MinIO
compatible con S3 y la API real. No se permiten mocks, `test.skip` ni una
dependencia de storage local para esta corrida.

El provisionador usa únicamente estos archivos Compose:

```text
docker-compose.yml
docker-compose.e2e.yml
```

`docker-compose.e2e.yml` declara las dependencias aisladas y `worker-e2e`; nunca
se carga con el perfil `production`.

## 2. Prerrequisitos

- Docker Engine/Compose disponible y daemon activo.
- Node.js y pnpm del baseline del workspace.
- Variables de plataforma E2E disponibles en el entorno local o en
  `.env.development` (`E2E_PLATFORM_*` o `PLATFORM_SUPER_ADMIN_*`).
- Claves de bootstrap de la API (CI las genera efímeras y enmascaradas; en
  local el provisionador aplica defaults si faltan — no sobrescribe valores
  ya presentes):
  - `PII_HASH_KEY` — 64 hex (`openssl rand -hex 32`), SEC-P1, **independiente**
    de `MFA_ENCRYPTION_KEY`.
  - `MFA_ENCRYPTION_KEY` — 64 hex (`openssl rand -hex 32`).
  - `EXECUTION_ORDER_IDEMPOTENCY_SECRET` — mínimo 32 caracteres
    (`openssl rand -hex 24`).
- No se requiere ningún secreto de CI para MinIO: el script genera credenciales
  efímeras en memoria cuando el entorno no las proporciona y no las imprime.

Si Docker no está disponible, el procedimiento debe terminar con:

```text
[BLOQUEO] Docker no está disponible o el daemon no responde. No se ejecuta el E2E: R4.1 requiere MinIO y worker BullMQ reales.
```

No sustituir esa condición por un mock, un skip o el adaptador `local`.

**Diagnóstico — fallo de config vs Playwright:** si el log muestra
`API E2E terminó antes del healthcheck` y la cola de la API incluye
`PII_HASH_KEY es obligatoria`, la causa es configuración (clave SEC-P1
ausente), no Playwright ni flakiness de tests. Corregir la inyección de
entorno antes de reintentar la suite.

## 3. Provisionamiento y orden obligatorio

Desde la raíz del workspace:

```bash
node scripts/e2e-provision-operational.mjs
```

El script ejecuta este orden y aborta ante cualquier código distinto de cero:

1. `docker compose config --quiet` sobre los dos archivos E2E.
2. Arranque con `--wait` de PostgreSQL, Redis, MinIO y Typesense.
3. Healthcheck de PostgreSQL, Redis, MinIO y Typesense.
4. Bootstrap privado del bucket mediante `minio-init`.
5. Compilación de `@iwana/shared` y `@iwana/storage`.
6. Migraciones públicas y tenant con `pnpm db:migrate:all`.
7. Build, arranque y healthcheck del `worker-e2e` BullMQ.
8. Arranque o reutilización de la API y healthcheck real
   `/api/v1/health`.
9. Provisionamiento de fixtures E2E y ejecución de Playwright.

El worker no expone HTTP. Su healthcheck de Compose verifica que el proceso
BullMQ PID 1 sigue vivo; el `--wait` de Compose debe terminar correctamente
antes de iniciar Playwright.

## 4. Variables no persistentes

El Compose no contiene valores de credenciales. El provisionador inyecta en el
proceso los valores de laboratorio necesarios para:

- PostgreSQL y sus roles de bootstrap, aplicación y migración.
- Redis sin autenticación en la red local de desarrollo.
- MinIO (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_*`).
- Typesense y referencias de imágenes fijadas.
- Claves de API/worker: `PII_HASH_KEY`, `MFA_ENCRYPTION_KEY` y
  `EXECUTION_ORDER_IDEMPOTENCY_SECRET` (defaults efímeros si el entorno no las
  aporta; `worker-e2e` exige `PII_HASH_KEY` vía Compose `:?`).

No registrar el entorno completo, ejecutar `docker compose config` sin
`--quiet`, ni imprimir logs que contengan variables. Las credenciales efímeras
no deben copiarse a `.env`, Compose, imágenes, workflows ni informes.

## 5. Evidencia funcional mínima

La suite debe ejecutar el flujo real de creación, inicio, actividad, consumo,
upload de evidencia, registro y cierre. El caso de evidencia debe demostrar:

```text
POST /api/v1/tasks/execution-orders/:id/evidence-assets -> HTTP 202
```

El `202` debe provenir de la API real y el asset debe persistirse en MinIO; no
cuenta una respuesta simulada. El resultado de Playwright debe mostrar el
conteo de casos `passed`, `failed` y `skipped`; cualquier skip o fallo bloquea
R4.1.

La invocación focalizada equivalente, cuando la infraestructura ya esté
levantada y el fixture haya sido provisionado, es:

```bash
pnpm exec playwright test e2e/tests/api/execution-orders-operational.spec.ts --config e2e/playwright.api.config.ts --reporter=list
```

## 6. Limpieza y rollback del entorno E2E

El script elimina los tenants y schemas efímeros al terminar y retira
`worker-e2e`. Usa volúmenes y puertos propios (`15433`, `16380`, `19002`,
`18108` por defecto), no ejecuta comandos sobre el perfil production ni elimina
volúmenes compartidos de desarrollo. También usa el proyecto Compose
`iwana-e2e-r41` y baja sus contenedores al finalizar; no reconcilia contenedores
del proyecto de desarrollo. Si una corrida deja artefactos de prueba en el
bucket, limpiarlos únicamente en el entorno E2E local autorizado.

Un fallo de cualquier healthcheck, migración, worker, API o test es un **NO-GO**
para la evidencia R4.1. No reintentar ocultando el fallo con skips, mocks o
`continue-on-error`.

## 7. CI

El job `execution-orders-e2e` de `.github/workflows/ci.yml` instala las
dependencias y navegadores, genera credenciales efímeras enmascaradas
(`PLATFORM_SUPER_ADMIN_*`, `EXECUTION_ORDER_IDEMPOTENCY_SECRET`,
`MFA_ENCRYPTION_KEY`, `PII_HASH_KEY`), ejecuta el mismo provisionador y
conserva los artefactos de Playwright aunque el job falle. El job usa Docker
efímero del runner y no usa el perfil de producción.

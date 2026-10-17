# INFORME — WFM · `TASKS` en el enum `work_order_source_context`

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Agente:** `sr-backend` · **Encargo:** [PROMPT-WFM-ENUM-ORIGEN-TASKS-v1.0](../prompts/PROMPT-WFM-ENUM-ORIGEN-TASKS-v1.0.md) · **Origen:** deuda P1 de [FIX-PREVIEW](INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md)
**Estado:** **Hecho.** Migración 152, registrada y probada. `dbiw` sin migrar (decisión del CTO tras el commit). Sin commit.
**Skills consultadas como documentación:** `database-migration`, `iwana-tenant-migration`, `postgresql`, `test-driven-development` y `verification-before-completion`.

## 1. Reproducción (antes del cambio)

**Test nuevo:** `apps/api/src/modules/wfm/tests/work-order-source-context-tasks.postgres.integration.spec.ts`.

- Crea un schema efímero con la **cadena real** de migraciones tenant (`applyTenantMigrationsInOrder`) y lo registra en `public.tenants`. Rechaza cualquier `DB_NAME` que no sea `test` o `iwana_it_*`.
- Escribe por los **servicios de dominio** reales:
  - una visita con `VisitRequestsService.createVisitRequest` (actor `ADMIN`, `originContext: TASKS`);
  - una orden de trabajo con `WorkOrdersService.create` (`sourceContext: TASKS`).

**Rojo verificado**, en `iwana_it_g7_ci`, antes de crear la 152 (2 de 2 tests fallaron):

| Test | Error | Paso |
| --- | --- | --- |
| Visita con origen TASKS | `QueryFailedError` SQLSTATE `22P02`: `invalid input value for enum work_order_source_context: "TASKS"` | `visit-requests.service.ts:414`, `findActiveDuplicateByOrigin`: la guarda de duplicados compara el origen antes del `INSERT` |
| Orden de trabajo con origen TASKS | El mismo `22P02` | `work-orders.service.ts:148`, `manager.save(WorkOrder)` |

**Flujo de punta a punta hoy (antes de migrar):** falla.

- El portal crea la visita desde una tarea con `createTaskVisitRequestAndRoute` (`apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts:474`), que llama `POST /wfm/visit-requests` con `originContext: TASKS`.
- Esa ruta entra a `createVisitRequest` (`wfm.controller.ts:170-171`), justo el camino reproducido. El `QueryFailedError` no tiene manejo propio, así que la respuesta HTTP es un 500 genérico.
- Igual falla la orden de trabajo embebida en la creación de un evento con `workOrder.sourceContext = TASKS` (`schedule-events.service.ts:416-420`).
- `execution_orders.origin_context` es `varchar` y no se ve afectado.
- **Límite:** el 500 HTTP se deduce del camino de código y de la reproducción por servicio. No se ejecutó contra `dbiw`, para no escribir en esa base.

No apareció ningún otro defecto en la reproducción: no hubo `[BLOQUEO]`.

## 2. Migración tenant 152

**Archivo:** `packages/database/src/migrations/tenant/152_work_order_source_context_tasks.ts`, clase `WorkOrderSourceContextTasks1520000000000`. Registrada en `runner.ts` (import y última posición de `TENANT_MIGRATIONS`). El número 152 es el siguiente al mayor del directorio (151).

- **`up`:** `DO $$ … IF NOT EXISTS (…) THEN ALTER TYPE work_order_source_context ADD VALUE 'TASKS'` con la guarda `t.typnamespace = current_schema()::regnamespace`, el patrón de la 058. Es idempotente y no ve el enum de otro tenant.
- **`down`:**
  - Cuenta las filas con `TASKS` en `work_orders.source_context` y en `visit_requests.origin_context`, comparando como texto.
  - Si hay alguna, **no cambia nada**: lo registra con `console.warn` (solo conteos, sin identificadores) y queda documentado en el JSDoc. Quitar el valor exigiría reescribir el origen de esas filas.
  - Si no hay ninguna:
    1. `RENAME` del tipo a `_old`;
    2. `CREATE TYPE` con `CRM, ASSURANCE, PROVISIONING, MANUAL`;
    3. `ALTER COLUMN … TYPE … USING <col>::text::work_order_source_context` en **las dos columnas**;
    4. `DROP TYPE … _old`.
  - Sin DEFAULT ni vistas dependientes, verificado en `pg_depend` e `information_schema`. Los dos índices de `visit_requests` que incluyen `origin_context` se reconstruyen solos con el `ALTER COLUMN TYPE`.

**Transacción:** se mantiene la transacción por migración del runner (`transactional` por defecto), por estas razones:

1. Todos los caminos que aplican migraciones tenant (CLI `tenant-migrate`, worker `tenant-provisioning.processor.ts:316` y tests) pasan por `applyTenantMigrationStep` (`runner.ts:356-376`). Esa función abre **una transacción por migración** y confirma antes de la siguiente.
2. Desde PostgreSQL 12, `ALTER TYPE … ADD VALUE` se admite dentro de un bloque transaccional; la restricción es que el valor nuevo no se puede **usar** antes del commit. La 152 no lo usa: el bookkeeping solo escribe en `typeorm_migrations`. El servidor local es PostgreSQL 18.3.
3. Es el mismo modo que la 058 y la 107, que ya agregan valores a enums con el runner actual.
4. `transactional = false` no aporta nada aquí y perdería la atomicidad del bookkeeping.

## 3. Tests

| Test | Tipo | Qué prueba |
| --- | --- | --- |
| `152_work_order_source_context_tasks.spec.ts` | Unitario `@iwana/db` (5 tests) | Que sea transaccional; la forma del `up` (guarda por `current_schema()`, idempotencia); `down` sin cambios con filas en cualquiera de las dos tablas; `down` sin uso: orden `RENAME → CREATE → ALTER ×2 → DROP` y tipo nuevo sin `TASKS` |
| `152_work_order_source_context_tasks.integration.spec.ts` | Integración `@iwana/db` (4 tests), **dos schemas tenant** creados con la cadena completa | (1) Ambos quedan con `TASKS` en su propio tipo y la 152 registrada. (2) Repetir `up` no duplica. (3) `down` en A con filas TASKS no cambia nada; `down` en B sin filas quita TASKS, migra las dos columnas, no deja `_old`, una escritura TASKS en B da `22P02` y A conserva el valor y sus filas. (4) Re-`up` en B restaura TASKS y vuelve a aceptar escrituras |
| `work-order-source-context-parity.integration.spec.ts` | Integración `@iwana/db` (1 test) | `pg_enum` del tipo en un schema migrado = `Object.values(WorkOrderSourceContext)`. **Rojo verificado:** con la 152 sacada temporalmente del array, falló con «Expected − "TASKS"». Luego se restauró `runner.ts` y quedó con solo las 2 líneas de registro |
| `work-order-source-context-tasks.postgres.integration.spec.ts` | Integración `@iwana/api` (2 tests) | La reproducción del §1: **rojo antes** (2 × `22P02`) y **verde después** (2/2) |

## 4. Evidencia

| Ejecución | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/db typecheck` · `pnpm --filter @iwana/api typecheck` · ESLint de los 6 archivos | 0 errores |
| `@iwana/api` `jest --runInBand --no-cache --silent` | **386 suites aprobadas, 4 omitidas** (390); **5.241 tests aprobados, 15 omitidos** (5.256); **0 fallos**; 246,7 s |
| `@iwana/db` `jest --no-cache --silent` | **68 suites aprobadas** (68); **402 tests aprobados**; **0 fallos**; 10,3 s; incluye `PASS 152_…spec.ts` |
| `@iwana/db` `test:integration` contra `iwana_it_g7_ci` | **34 suites aprobadas** (34); **115 tests aprobados**; 0 fallos; 29,5 s. `PASS` de `152_…integration.spec.ts` y de `work-order-source-context-parity.integration.spec.ts` |
| `@iwana/api` `test:integration` contra `iwana_it_g7_ci`, con `E2E_TENANT_SLUG=test` | **22 suites aprobadas, 3 omitidas** (25); **94 tests aprobados, 15 omitidos** (109); 0 fallos; 58,3 s. `PASS` de `work-order-source-context-tasks.postgres.integration.spec.ts`. Las 3 omitidas son K2 y las suites con opt-in, igual que en corridas anteriores |
| `pnpm exec turbo run test --force --continue` | **8 de 10 tareas en verde, 0 cacheadas** (detalle abajo) |

**Totales de turbo por paquete:**

| Paquete | Suites | Tests |
| --- | --- | --- |
| `@iwana/shared` | 19/19 | 174 aprobados |
| `@iwana/db` | 68/68 | 402 aprobados |
| `@iwana/worker` | 20/20 | 169 aprobados |
| `@iwana/ui` | 5/5 | 34 aprobados |
| `@iwana/web` | 36/36 | 229 aprobados |
| `@iwana/api` | **1 fallida**, 385 aprobadas, 4 omitidas (390) | **1 fallido**, 5.240 aprobados, 15 omitidos (5.256) |
| `@iwana/portal` | **1 fallida**, 302 aprobadas (303) | **1 fallido**, 3.042 aprobados, 1 omitido (3.044) |

**Los 2 fallos de turbo son inestabilidad por carga, no regresión:**

| Suite | Fallo bajo turbo | Aislada, sin caché |
| --- | --- | --- |
| `apps/api/.../inventory/tests/purchase-order-pdf.service.spec.ts` | `Exceeded timeout of 20000 ms` en `renderRequestOrdersZip` (suite de 59,7 s) | **8/8 aprobados** (21,9 s). También pasó en la corrida completa de `@iwana/api` de arriba |
| `apps/portal/.../settings/OrganizationSettingsClient.spec.tsx` | `Unable to find an element with the text: Inactiva` (suite de 95,3 s) | **43/43 aprobados** (10,5 s) |

Ninguna de las dos toca WFM, migraciones ni `TASKS`, y este cambio no modifica código de `inventory` ni del portal. Para un verde estricto de turbo hay que tratar su sensibilidad a la carga (timeout del render de ZIP y espera del `findByText`); queda como seguimiento fuera de este encargo.

**Bases de datos:**

- **`iwana_it_g7_ci` (desechable):** se migró `tenant_test` con `migration:tenant:run`, como el CI antes de la integración de la API. Resultado: 147 migraciones en paridad y `enum_range` = `{CRM, ASSURANCE, PROVISIONING, MANUAL, TASKS}`. Los schemas efímeros de los tests se eliminaron al terminar.
- **`dbiw`, sin migrar:** `pg_enum` no tiene `TASKS` (consulta de solo lectura: 0 filas). Migrarla lo decide el CTO después del commit, con `pnpm db:backup` antes.

## 5. Archivos

- **Nuevos:**
  - `packages/database/src/migrations/tenant/152_work_order_source_context_tasks.ts`;
  - `packages/database/src/migrations/tenant/152_work_order_source_context_tasks.spec.ts`;
  - `packages/database/src/migrations/tenant/152_work_order_source_context_tasks.integration.spec.ts`;
  - `packages/database/src/migrations/tenant/work-order-source-context-parity.integration.spec.ts`;
  - `apps/api/src/modules/wfm/tests/work-order-source-context-tasks.postgres.integration.spec.ts`;
  - este informe.
- **Modificado:** `packages/database/src/migrations/tenant/runner.ts` (+2 líneas: import y registro).
- **No tocados:** el contrato de `@iwana/shared`, el resto del código de producto y `wfm-titular-erasure.participant.ts`. Su diff pendiente es el de FIX-PREVIEW, sin commitear; su comparación `origin_context::text = 'TASKS'` sigue siendo válida con el valor ya presente.

La ruta de este informe se verificó libre antes de escribirlo. No hay PII ni claves reales (UUID aleatorios, correos `example.invalid`). Sin commit.

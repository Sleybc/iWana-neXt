# INFORME — MOD11 Operaciones · OLA 2 · F1 backend (listado de OT, scoping, índice, responsibleLabel)

**Versión:** 1.0
**Estado:** Emitido — entra a **G5** (revisión de segunda capa de AI-EM-ARCH); condicionado al veredicto de AI-SEC-ENG sobre la `[CONSULTA]` de §8
**Fecha:** 2026-09-13
**Autor:** AI-SR-FULL (Principal Backend Engineer)
**Orden de despacho que acota este trabajo:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md` v1.0 (pasos 5–11 del encargo formal, sección F1)
**Encargo formal:** `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md` v1.0 — sección F1
**Spec que ejecuta:** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (Aprobado por el CTO) — §4.7 y §4.8 normativos
**Plan:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 (§3.3/3.4, §4, §5, §8, §10)
**Directrices vinculantes absorbidas:** D1 (scoping v1 sin cuadrilla), D2 (`total` por alcance del actor), D3 (bucket de throttling) — consolidación OLA1 §4
**ADRs citados (verificados, Aprobados):** ADR-065 v1.2 (§10, §12, §15, §17, §18, §22-bis), ADR-066 v1.0, ADR-067 v1.0; relacionados ADR-068
**Superficie:** `apps/api/` + `packages/database/` (+ `e2e/tests/api/execution-orders-operational.spec.ts`, citado por la orden §9). **No se tocó `apps/portal/`** (restricción 3). No se emitió `git commit` ni `git add`.

---

## 1. Qué se ejecutó

La implementación F1 existía en el árbol como WIP de una sesión previa interrumpida, sin informe y sin verificación. Se **auditó línea a línea** contra la orden (§3 pasos 5–11, §4 D1–D3, §7 restricciones, §8 riesgo R1) y se verificó con corridas reales. Se corrigieron **3 defectos** (§3) y se **completó el entregable e2e** que no existía (§4). No se reimplementó nada sin causa: el diseño del WIP era conforme y se preservó.

| Paso de la orden | Estado | Evidencia |
| --- | --- | --- |
| 5. Migración índice `(tenant_id, planned_window_start_at DESC, id DESC)` + evaluación del índice de cuadrilla | ✅ | Migración **130** `transactional = false`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS`, `down()` con `DROP INDEX CONCURRENTLY`, patrón 089, runner ADR-066. Aplicada en 2 tenants con verificación física (§6). Índice de cuadrilla: **INCLUIDO**, justificación en §7 |
| 6. `ExecutionOrdersService.list()` — filtros §4.7.1, `clampPage`, `buildPageMeta({ randomAccess: true, sortableFields: [] })`, orden `planned_window_start_at DESC, id DESC` (desempate obligatorio), proyección exacta | ✅ | `apps/api/src/modules/tasks/services/execution-orders.service.ts` — una sola query + count sobre el QB (D2 estructural); sin `getCompletion`/`getSyncState`/`getInventoryReconciliation`; `toListItem()` solo columnas directas (sin N+1) |
| 7. Scoping por actor en el `WHERE` (D1) | ✅ | `LIST_RESTRICTED_ROLES = [TECHNICIAN, CONTRACTOR]`; WHERE: `assigned_technician_id = :actorSub OR (assigned_technician_id IS NULL AND assigned_crew_id IS NULL AND status <> 'CREATED')` — réplica exacta de la lectura de `assertActorAccess` (consistencia bandeja↔detalle). **El scoping vive en el servicio, nunca en el guard** |
| 8. `@Get()` antes de `@Get(':id/evidences')` con `@ExecutionOrderTenantScoped()` | ✅ | `execution-orders.controller.ts` — `@Get()` declarado antes de las rutas `:id/*`; `@Roles(ADMIN, NOC, SUPPORT, TECHNICIAN, CONTRACTOR)` + `@Permissions(OPERATIONS_EXECUTION_ORDERS_READ)`; sin `@ApiQuery` de `sortBy`/`sortDir` (ADR-065 §22-bis punto 3) |
| 9. `responsibleLabel` aditivo en `TasksService.list()` | ✅ | Lookup batch por página (recomendación del dictamen G3 §3.5 opción 1): una query `IN (:ids)` por página vía `UsersService.findDisplayLabelsByIds()` (módulo users, ya consumido por tasks — sin cruce de boundary nuevo). IDs no-UUID legacy filtrados; no resoluble → `null`, no error |
| 10. Tests bloqueantes (§6 del prompt formal) | ✅ | Ver §5 — todos en verde con conteo real |
| 11. Consulta a AI-SEC-ENG sobre el scoping | ✅ emitida | `[CONSULTA]` formateada en §8 — veredicto pendiente (condición de cierre registrada en §10) |

## 2. Skills leídas (declaración §5.1 del plan)

Leídas **antes** de auditar/escribir código:

- **Obligatorias:** `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder`.
- **De apoyo:** `security-auditor` (revisión BOLA del scoping), `openapi-spec-generation` (honestidad del spec: sin `sortBy`/`sortDir` con lista vacía), `testing-patterns`.
- **No usadas, conforme a la orden:** `bullmq-specialist`, `auth-implementation-patterns`, `architecture-decision-records` (no nace ADR nuevo), `observability-engineer` (no se instrumentó el listado).

## 3. Auditoría del WIP heredado — defectos corregidos

| # | Defecto encontrado | Severidad | Corrección aplicada |
| --- | --- | --- | --- |
| WIP-1 | `execution-orders.controller.http.spec.ts`: la sonda `UndecoratedListProbeController` (caso 403-sin-decorador) no ataba `ExecutionOrderAccessGuard` en `@UseGuards` — el deny-by-default nunca corría y el caso respondía **200 en vez de 403** (es decir, el test pasaba a verificar lo contrario del R1). Bloqueante: el caso 403-sin-decorador es condición de cierre | Alta | `@UseGuards(JwtAuthGuard, TenantAwareThrottlerGuard, RolesGuard, PermissionsGuard, ExecutionOrderAccessGuard)` en la sonda, mismo orden que el controlador real (líneas 111–119). Tras el fix: 403 verificado |
| WIP-2 | `execution-orders.service-list.spec.ts` y `tasks.boundary.spec.ts`: `jest.mock('@iwana/db', () => ({…}))` con mock **parcial** que reemplazaba el módulo completo — cualquier export consumido por la cadena de imports (`MediaUsage`, etc.) quedaba `undefined` y ambos suites morían con `TypeError: Cannot read properties of undefined (reading 'LOGO')` | Alta | `...jest.requireActual('@iwana/db')` + parche solo de `TenantContext` y `runInTenantSchema` en ambos specs |
| WIP-3 | `execution-orders.service-list.spec.ts`: el caso de `cursor` esperaba `BadRequestException`, pero el patrón del módulo (`tasks.service.ts:223`) es `Schema.parse()` en el servicio — `ZodError` crudo para callers internos; el `ZodValidationPipe` del controlador es quien lo traduce a 400 en HTTP | Baja | El caso ahora espera `ZodError` con comentario del patrón; el 400 de `cursor` queda cubierto por el schema strict en servicio (`ListExecutionOrdersQuerySchema.parse`, caso del service-list spec), por el `ZodValidationPipe` en el path HTTP y por el caso 9e del e2e (pendiente de corrida, deuda D-2). El suite HTTP **no** tiene caso `?cursor=abc` — esta fila lo citaba por error; corregido por observación SEC-O1 de AI-SEC-ENG |

Ningún otro defecto: migración, servicio (D1/D2), controlador, DTOs, `responsibleLabel`, swagger y BOLA del WIP resultaron conformes a la orden y no se alteraron salvo lo listado.

## 4. Completado sobre el WIP — E2E API (bloque 9)

El prompt formal §6 exige un bloque nuevo de **listado paginado + BOLA** en `e2e/tests/api/execution-orders-operational.spec.ts`. El WIP no lo tenía. Se añadió `test.describe('9. Bandeja de OT — listado paginado y BOLA por actor (MOD11 F1)')` con 7 casos (9a–9g), siguiendo las convenciones del archivo (helpers `authedGet`/`tenantLogin`/`anchorScheduleIso`, falla instructiva cuando falta un fixture, como el 6a):

- **9a** NOC lista con paginación y `meta` completo ADR-065 (`capabilities` `{randomAccess: true, sortableFields: []}`, `sort: null`) + proyección mínima (sin `serviceAddress`/`workInstructions`/`completion`/`syncState`/`inventoryReconciliation`/`cursor`).
- **9b** Orden por defecto DESC (`schedule.window.startAt` no-creciente).
- **9c** Filtro por `assigneeId` incluye la OT del técnico; ticket inexistente → 0 filas, `total: 0`.
- **9d** `page*limit` sobre el tope → 400.
- **9e** `limit > 100` → 400; `cursor` → 400 (exclusivo con `page`, ADR-065 §10).
- **9f** **BOLA**: el técnico solo ve filas propias o pool (D1); la OT del happy path sí aparece (consistencia bandeja↔detalle); `total` del técnico ≤ `total` del NOC (ADR-065 §15).
- **9g** **BOLA duro**: un segundo técnico (`E2E_TECH2_*`) no ve la OT asignada al primero.

Provisión ejecutada: `npx tsx e2e/scripts/provision-execution-template.ts iwana` → plantilla `E2E_HAPPY_PATH` v1 PUBLISHED + 3 requisitos.

**La corrida real del e2e no fue ejecutable en esta sesión** (ver §5.3 y deuda D-2): dos intentos con evidencia capturada; Playwright parsea los 7 casos sin errores (sintaxis e imports validados con `--list`).

## 5. Verificación — evidencia con conteo real (regla §8.1 del plan)

Plataforma: **Windows (win32 10.0.26200 x64), Git Bash, pnpm**. Ningún verde de turbo con caché caliente ni `--passWithNoTests` fue usado como evidencia.

### 5.1 Lint y typecheck

| Comando | Resultado | Evidencia |
| --- | --- | --- |
| `pnpm lint` (monorepo) | ✅ `Tasks: 8 successful, 8 total` — `Cached: 0 cached, 8 total`, 16.7s | 0 errores; 46 warnings preexistentes (portal/scheduling, settings, etc. — ningún archivo de F1) |
| `pnpm typecheck` (monorepo) | ✅ `Tasks: 8 successful, 8 total` — 15.3s | Ejecución real (7 cache miss explícitos, 1 cached correspondiente a paquete no tocado) |
| `pnpm --filter @iwana/api typecheck` (re-corrido tras los fixes) | ✅ verde | `tsc --noEmit` sin salida de error |
| `pnpm --filter @iwana/api lint` (re-corrido tras los fixes) | ✅ 0 errores, 7 warnings preexistentes de `taxation` | Ningún warning en archivos de F1 |

### 5.2 Tests (conteo real)

| Suite | Resultado | Evidencia de corrida real |
| --- | --- | --- |
| `pnpm --filter @iwana/api test` (suite completa, `jest` directo — sin caché turbo) | ✅ **313 suites passed**, 4 skipped (preexistentes: integración con BD e inventario de otro track) · **3925 tests passed**, 15 skipped, **0 failed** · 51.9s | Línea de resumen de Jest: `Test Suites: 4 skipped, 313 passed, 313 of 317 total / Tests: 15 skipped, 3925 passed, 3940 total / Time: 51.904 s / Ran all test suites.` — corrida completa en disco, no restaurada de caché |
| 5 suites F1 combinados (service-list, controller.http, boundary, tasks.service, swagger) | ✅ **107 tests passed, 0 failed** | `Test Suites: 5 total / Tests: 107 passed / Time: 7.055 s` (tras los fixes WIP-1..3) |
| Migraciones (`@iwana/db` jest): `130_execution_orders_list_ordering.spec.ts` + `migration-order.spec.ts` | ✅ **15 tests passed** | Incluye: `transactional=false` (ADR-066), CONCURRENTLY en up, DROP CONCURRENTLY en down en orden inverso, sin calificar DDL con schema (search_path del runner), whitelist de índices inválidos, orden de la 130 registrado |

Contenido de los entregables de test de F1 (todos dentro de la corrida de 3925):

- **`execution-orders.controller.http.spec.ts`** — caso 403-sin-decorador (sonda con el guard REAL atado, tras fix WIP-1), 200-con-decorador con `meta` completo ADR-065, D3 (`x-ratelimit-limit: 120` en vivo), 400 por `page*limit` sobre el tope, 400 por `limit > 100`, `sortBy`/`sortDir` ignorados con `meta.sort: null`, 401 sin token.
- **`tasks.boundary.spec.ts`** — **test BOLA sobre el listado**: un `TECHNICIAN` no ve OT ajenas (predicado parametrizado — sin concatenar el `sub` en SQL — y comportamiento simulado que honra el WHERE); dos técnicos ven conjuntos distintos con el mismo predicado; **ADR-065 §15**: ADMIN ve el tenant (total 3) y el técnico su alcance (total 1 < 3), con un único `getManyAndCount` por listado (D2 estructural: el `total` no puede venir de un conteo sin scopear).
- **`tasks.swagger.spec.ts`** — el listado se documenta con 12 parámetros y **sin** `sortBy`/`sortDir` ni `cursor`; el JSON versionado `tasks-execution-orders.v1.json` no se altera (el listado vive en los decoradores vivos + tipos `execution-orders-list.ts` v1 — precedente MOD12).
- **`execution-orders.service-list.spec.ts`** — orden por defecto con desempate, scoping D1 presente para técnico y ausente para supervisor, los 10 filtros de §4.7.1, proyección exacta sin campos excluidos, pool sin `assignee`, `meta` completo con lista blanca vacía, `clampPage` 400, schema strict rechaza `cursor`, y **nunca invoca `getCompletion`/`getSyncState`** (stop/go).
- **`tasks.service.spec.ts`** — `responsibleLabel` con un solo lookup batch por página; `null` para no-USER sin consultar usuarios.

### 5.3 Migraciones tenant (BD viva)

`pnpm --filter @iwana/db migration:tenant:run` (con `@iwana/db` compilado; corre contra `dist/`):

```text
[MIGRATOR] Starting migrations for 2 tenant(s)
[MIGRATOR] Migrating tenant_iwana
[130] All 2 execution-orders indexes verified valid.
[MIGRATOR] Done tenant_iwana in 123ms
[MIGRATOR] Migrating tenant_test_s2_live
[130] All 2 execution-orders indexes verified valid.
[MIGRATOR] Paridad de migraciones OK: 2 tenant(s) ACTIVE con 125 migraciones idénticas.
```

Evidencia física posterior (consulta `pg_indexes` en la BD local, ambos schemas):

```text
tenant_iwana         | idx_execution_orders_tenant_window_start  | CREATE INDEX ... ON tenant_iwana.execution_orders USING btree (tenant_id, planned_window_start_at DESC, id DESC)
tenant_iwana         | idx_execution_orders_tenant_assigned_crew | CREATE INDEX ... ON tenant_iwana.execution_orders USING btree (tenant_id, assigned_crew_id)
tenant_test_s2_live  | idx_execution_orders_tenant_window_start  | (idéntica)
tenant_test_s2_live  | idx_execution_orders_tenant_assigned_crew | (idéntica)
```

### 5.4 OpenAPI en vivo (API dev local con el código del árbol)

`GET /api/v1/docs-json` del API corriendo:

```text
/api/v1/tasks/execution-orders -> get
params: ["status","result","workType","assigneeId","organizationSiteId","ticketId","taskId","visitRequestId","windowFrom","windowTo","page","limit"]
anuncia sortBy: false | anuncia sortDir: false | anuncia cursor: false
response 200 -> #/components/schemas/ExecutionOrderListPageDto
```

### 5.5 E2E API — intento real y resultado

1. Provisión: `npx tsx e2e/scripts/provision-execution-template.ts iwana` → ✅ (ver §4).
2. `pnpm exec playwright test … --config e2e/playwright.api.config.ts --grep "9\."` → **fallo en `beforeAll`**: `Login de plataforma falló: Expected 200, Received 401` (dos intentos: con defaults y con las credenciales `E2E_PLATFORM_*` del `.env` exportadas). El email del usuario de plataforma está hasheado en la BD local (contrato PII), por lo que las credenciales vigentes no son verificables ni restaurables desde esta sesión sin provisionar el entorno efímero canónico (`scripts/e2e-provision-operational.mjs`), que exige derribar/levantar el stack docker y choca con la API dev viva del track concurrente.
3. `--list` de Playwright → los 7 casos del bloque 9 se parsean sin errores (sintaxis e imports validados).

La corrida del bloque 9 queda como deuda **D-2** (§9); no es condición del stop/go §11 (ver §10).

## 6. Migración 130 — decisiones

- **Numeración siguiente a la 129** (`130_execution_orders_list_ordering`), patrón de la 089: `transactional = false`, `CREATE INDEX CONCURRENTLY IF NOT EXISTS` / `DROP INDEX CONCURRENTLY IF EXISTS`, manejo de índice `INVALID` heredado del fallo mode conocido de `CONCURRENTLY` (limpieza previa con whitelist local validada + verificación post-migración que lista inválidos/faltantes), sin DDL calificado con schema (el runner fija `search_path`), sin DML (ADR-066 §4).
- **Índice líder `tenant_id`:** convención de la familia 046/091/098 de la misma tabla; el `list()` filtra `tenant_id = :tenantId` explícito además del `search_path`, así que la columna líder sí participa del plan.
- **Reversibilidad:** `down()` con `DROP INDEX CONCURRENTLY IF EXISTS` en orden inverso, ejercitado por el spec unitario.
- Aplicada y verificada físicamente en los 2 tenants de la BD local (§5.3). R8 (índice bloqueando escrituras) mitigado por diseño `CONCURRENTLY`.

## 7. Índice de cuadrilla — justificación (decisión declarada, directriz del paso 5)

**Se INCLUYE** en la misma migración: `idx_execution_orders_tenant_assigned_crew (tenant_id, assigned_crew_id)`.

1. El filtro `assigneeId` de spec §4.7.1 acepta técnico **o** cuadrilla; sin índice, la rama cuadrilla degrada a seq scan por tenant.
2. Es simétrico al índice de técnico que ya existe (`idx_execution_orders_tenant_assigned_technician`, 046) — mismas consultas reales, misma familia.
3. Coste marginal: una pasada `CONCURRENTLY` más dentro de la misma migración, sin bloqueo de escrituras.
4. Su uso por roles restringidos llega con el port WFM (deuda B-A1, refinamiento v2); los supervisores (`assigneeId` libre) ya lo aprovechan en v1.

## 8. `[CONSULTA]` a AI-SEC-ENG (obligatoria para cerrar F1 — R1)

```text
[CONSULTA] De: AI-SR-FULL → A: AI-SEC-ENG
Contexto: MOD11 Operaciones · OLA 2 · F1 — nuevo GET /tasks/execution-orders (bandeja de OT).
Spec: docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md §4.7.1/§4.7.2 (Aprobada).
Orden: docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md §3/§8. Riesgo R1:
@ExecutionOrderTenantScoped() habilita la ruta y DESACTIVA el ABAC del guard
(execution-order-access.guard.ts:42-46 retorna sin assertActorAccess), por lo que el
scoping por actor debe vivir íntegramente en el WHERE del servicio, nunca en el guard.
Pregunta concreta: ¿apruebas el scoping D1 implementado como control suficiente contra
BOLA horizontal entre técnicos/contractors del mismo tenant, y la superficie expuesta?
Puntos exactos a revisar:
  1) Scoping en el WHERE (directriz D1 — réplica de la lectura del detalle):
     apps/api/src/modules/tasks/services/execution-orders.service.ts —
     constante LIST_RESTRICTED_ROLES y método list() (~líneas 480-590):
       WHERE order.tenant_id = :tenantId
       AND (order.assigned_technician_id = :actorSub
            OR (order.assigned_technician_id IS NULL
                AND order.assigned_crew_id IS NULL
                AND order.status <> 'CREATED'))
     parámetros ligados (sin interpolación del sub); admin/noc/support sin cláusula de actor.
  2) Proyección mínima expuesta (ADR-067): método toListItem() del mismo archivo —
     sin serviceAddress, workInstructions, contacto, completion/syncState/inventoryReconciliation.
  3) Endpoint y decoradores: apps/api/src/modules/tasks/execution-orders.controller.ts —
     @Get() con @ExecutionOrderTenantScoped() + @Roles(5 roles) +
     @Permissions(OPERATIONS_EXECUTION_ORDERS_READ); OpenAPI no anuncia sortBy/sortDir/cursor.
  4) Tests que fijan el control: tests/tasks.boundary.spec.ts (BOLA listado, predicado
     parametrizado, ADR-065 §15 dos alcances), tests/execution-orders.controller.http.spec.ts
     (403 sin decorador / 200 con decorador), tests/execution-orders.service-list.spec.ts.
  5) responsibleLabel (dato de usuario interno, no de suscriptor):
     apps/api/src/modules/users/users.service.ts — findDisplayLabelsByIds() (batch, UUID-only);
     apps/api/src/modules/tasks/services/tasks.service.ts — resolveResponsibleLabels().
Bloqueante: Sí | Supuesto mientras tanto: ninguno — F1 no se declara cerrada hasta tu veredicto.
```

## 9. Deuda residual (por severidad)

| # | Severidad | Deuda | Dueño / momento |
| --- | --- | --- | --- |
| D-1 | Media | **Veredicto de AI-SEC-ENG sobre el scoping D1** — `[CONSULTA]` emitida (§8), pendiente de sesión de SEC-ENG. Condición de cierre de F1 y del handoff H2 | AI-SEC-ENG, en la consolidación de la ola 2 |
| D-2 | Media | **Corrida real del bloque 9 del e2e API** en el entorno canónico (`scripts/e2e-provision-operational.mjs`): la sesión no dispone de credenciales de plataforma válidas para la BD local (login 401, email hasheado por contrato PII) y el entorno efímero choca con la API dev viva del track concurrente. El código está parseado y la provisión de plantilla está hecha | AI-SR-QA en F6 (o PLAT-OPS al disponer el entorno e2e) |
| D-3 | Media (heredada, no generada) | Cuadrilla en el scoping (B-A1): los roles restringidos no ven OT de su cuadrilla hasta el port tipado de WFM — refinamiento v2 del **comportamiento** (el shape no cambia) | Registrada en la consolidación OLA1 §7; no se abre aquí |
| D-4 | Baja (heredada) | Tramo de `sortableFields` (`plannedWindowStartAt`, `executionOrderNumber`, `status`) exige medición p95 de AI-PLAT-OPS y autorización de AI-EM-ARCH (ADR-065 §22-bis) | Post-F5 |
| D-5 | Baja (observación) | Dos migraciones de contract PII (expand/contract) quedan **DIFERIDAS** por el runner (`DropPlatformUsersEmailHash…`, `DropPiiSha256HashColumns1090000000000`): preexistente a esta fase; el runner exige `IWANA_APPLY_PII_CONTRACT=true` en ventana planificada | Responsable del proyecto (mensaje del runner) |

## 10. Veredicto stop/go (§11 de la orden) — punto por punto

| # | Condición de cierre | Veredicto |
| --- | --- | --- |
| 1 | Test BOLA sobre el listado y caso 403-sin-decorador / 200-con-decorador | ✅ **CUMPLE** — `tasks.boundary.spec.ts` (3 casos BOLA/§15) y `execution-orders.controller.http.spec.ts` en verde (WIP-1 corregido: el 403 ahora corre con el guard real atado) |
| 2 | Verificación ADR-065 §15 con dos alcances | ✅ **CUMPLE** — ADMIN total 3 vs técnico total 1 con un solo `getManyAndCount` scopeado; e2e 9f/9g replican la verificación contra API real (pendiente de corrida, D-2) |
| 3 | `sortableFields` poblado, u OpenAPI anuncia `sortBy`/`sortDir` con lista vacía | ✅ **CUMPLE** — lista vacía en servicio y `meta`; sin `@ApiQuery` de orden; test swagger en verde + verificación en vivo del docs-json (§5.4) |
| 4 | El path del listado invoca `getCompletion`/`getSyncState`/`getInventoryReconciliation` | ✅ **CUMPLE** (no invoca ninguno) — `toListItem()` solo columnas directas; caso de test específico en verde |
| 5 | La migración no usa `CREATE INDEX CONCURRENTLY` bajo ADR-066 | ✅ **CUMPLE** — 130 `transactional=false`, CONCURRENTLY, aplicada y verificada físicamente en 2 tenants (§5.3/§6) |
| 6 | AI-SEC-ENG no revisó el scoping | ⏳ **PENDIENTE** — `[CONSULTA]` emitida y registrada en §8; es la única condición de cierre abierta de F1 (D-1). No se simula veredicto |
| 7 | El informe reporta verde sin conteo real | ✅ **CUMPLE** — conteos reales con línea de resumen en §5; ninguna cifra de caché presentada como corrida |

**Conclusión:** F1 queda **lista para G5** con la condición 6 pendiente del veredicto de AI-SEC-ENG (procedimiento previsto por la orden: la consulta se despacha en la consolidación). El handoff H2 (endpoint vivo, `meta` completo, scoping verificado, OpenAPI actualizada) se entrega con el test BOLA de Jest en verde con conteo real y queda **condicionado al registro del veredicto SEC-ENG**.

## 11. Marcadores emitidos

- `[CONSULTA] De: AI-SR-FULL → A: AI-SEC-ENG` (§8) — **bloqueante** para el cierre formal de F1; formato §6.2 del protocolo.
- **Ningún `[BLOQUEO]`**: ninguna condición del §11 quedó sin vía de resolución dentro de la sesión; el e2e (D-2) tiene dueño y conducto definidos y no es condición de cierre §11.

## 12. Notas de contrato

- `packages/shared/src/contracts/operations/execution-orders.ts` (congelado): **no modificado** — verificado por diff.
- `execution-orders-list.ts` v1 y `operational-tasks.ts` v1 (F0): **sin cambio**; `ListExecutionOrdersQuery/Input` se consumen tal cual (incluye `sortBy`/`sortDir` opcionales con TSDoc de "ignorados mientras la lista blanca esté vacía" — interpretación ratificada en G3, dictamen backend §3.6).
- El JSON versionado `apps/api/openapi/tasks-execution-orders.v1.json` **no se regenera**: congela detalle y comandos; el listado se documenta vía decoradores vivos + tipos v1 (decisión fijada por el test `tasks.swagger.spec.ts`, precedente MOD12). Un cambio del JSON versionado sería cambio de contrato publicado y requiere coordinación de AI-EM-ARCH.

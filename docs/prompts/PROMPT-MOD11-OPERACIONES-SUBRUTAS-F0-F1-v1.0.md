# PROMPT DE EJECUCIÓN — MOD11 Operaciones · F0–F1 · Contratos y listado de OT

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Código:** MOD11-OPERACIONES-SUBRUTAS
**Fase:** F0 (contratos) + F1 (backend)
**Versión:** 1.0
**Fecha:** 2026-09-13
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-SR-FULL** (backend). Consulta obligatoria a **AI-SEC-ENG** antes de cerrar F1.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que exista un listado de OT de ejecución consultable, paginado, filtrable y **correctamente restringido por actor**, y que los contratos tipados de tareas y de listado de OT vivan en `@iwana/shared` para que los tracks de frontend puedan correr en paralelo.

**Lo que sí entra:**

- F0 — dos archivos de contrato nuevos en `packages/shared` y su export.
- F0 — tabla de finalidad por campo (ADR-067 §2) de la proyección del listado de OT.
- F1 — migración del índice de orden por defecto.
- F1 — `ExecutionOrdersService.list()` con scoping por actor.
- F1 — `@Get()` en `execution-orders.controller.ts`.
- F1 — proyección aditiva `responsibleLabel` en el listado de tareas.
- F1 — tests de contrato, de acceso (BOLA) y de OpenAPI.

**Lo que NO entra:**

- Cualquier archivo bajo `apps/portal/`. El frontend es F2/F5, de AI-FE-PLATFORM.
- Modificar `packages/shared/src/contracts/operations/execution-orders.ts` (congelado).
- La `WorkOrder` ligera de MOD09/WFM, en ninguna forma.
- Poblar `capabilities.sortableFields`.
- Reordenar `@Get('health/relay')` (deuda registrada, spec §10.1).

## 2. Artefactos de entrada obligatorios

- **Spec de diseño (fuente de verdad de esta fase):** `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO, 2026-09-13**) — §4.7 y §4.8 son normativos para este prompt.
- **Plan de orquestación:** `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.0 — §4 (dispatch de skills), §5 (protocolo de sesión), §6 (handoffs), §8 (verificación).
- PRD: `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.2, En revisión).
- HLD: `docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md` (v1.1, En revisión).
- ADRs aplicables: **ADR-065** (paginación numerada y orden; §10, §12, §15, §18, §22-bis), **ADR-066** (migraciones no transaccionales), **ADR-067** (proyección de PII en listados), **ADR-068** (OT como fuente canónica), ADR-046, ADR-047.
- Spec antecesora: `docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md` (Aprobado).
- Contrato congelado de OT (solo lectura): `packages/shared/src/contracts/operations/execution-orders.ts`.

**Artefactos faltantes detectados:** no existe informe de cierre de MOD11 y los PRD/HLD siguen "En revisión" condicionados a un ADR ya aprobado. Es deuda de gobernanza declarada fuera de alcance por el CTO (spec §10.4). **No la resuelvas en esta fase ni la uses como bloqueo.**

## 2bis. Skills a leer antes de escribir código

Fuente única del dispatch: plan de orquestación v2.0 §4. `AGENTS.md` es explícito en que Claude Code **lee** el `SKILL.md` como documentación; no se invoca como tool. Una skill leída después de escribir el código no sirvió de nada.

**Obligatorias:**

| Fase | Skills |
| --- | --- |
| F0 | `monorepo-architect`, `typescript-pro`, `openapi-spec-generation` |
| F1 | `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder` |

**De apoyo, cuando el paso lo pida:** `typescript-expert` (trae `scripts/ts_diagnostic.py`, útil al mover los nueve tipos), `security-auditor` (revisión BOLA del paso 7), `testing-patterns`, `docs-architect` (tabla de finalidad e informe), `observability-engineer` (solo si instrumentas el listado).

**No uses aquí:** `bullmq-specialist` (no se toca el outbox), `auth-implementation-patterns` (el cambio es de autorización, no de autenticación), `architecture-decision-records` (**no nace ADR nuevo**; si crees que hace falta uno, es `[BLOQUEO]` a AI-EM-ARCH, no iniciativa del track).

**Declara en el informe de fase qué skills leíste.** Una fase que no las declara se revisa como si no las hubiera aplicado.

## 3. Contratos congelados que esta fase produce

Conforme al perfil AI-EM-ARCH §3.5, esta fase **produce** dos contratos que quedan congelados al terminar F0. A partir de ese momento F2, F3 y F5 corren contra ellos y **cualquier cambio se notifica a AI-EM-ARCH y se versiona; no se parchea en silencio**.

| Contrato | Ruta | Versión |
| --- | --- | --- |
| Listado de OT | `packages/shared/src/contracts/operations/execution-orders-list.ts` | v1 |
| Tareas operativas | `packages/shared/src/contracts/operations/operational-tasks.ts` | v1 |

## 4. Pasos

### F0 — Contratos (bloqueante de todo el trabajo posterior)

1. **Crear `packages/shared/src/contracts/operations/execution-orders-list.ts`** con `ExecutionOrderListItem` y `ListExecutionOrdersQuery` según spec §4.7.1. Reusa `Page<T>` del archivo congelado; **no crees un envelope nuevo**. Cabecera del archivo declarando que es hermano del contrato congelado y por qué existe por separado.
2. **Crear `packages/shared/src/contracts/operations/operational-tasks.ts`** moviendo los nueve tipos hoy declarados en `apps/portal/src/lib/api-client.ts:6699-6816` (spec §4.7.3). `ListOperationalTasksResponse` gana `meta: ListMeta` y marca `total`/`page`/`limit` como `@deprecated` (dual-emit). `ListOperationalTasksParams` gana `sortBy` y `sortDir`.
3. **Exportar ambos** desde `packages/shared/src/index.ts` (el archivo exporta línea a línea, líneas 53-56).
4. **Escribir la tabla de finalidad por campo** (ADR-067 §2) para `ExecutionOrderListItem`: por cada campo proyectado, qué finalidad operativa lo justifica en una **bandeja** (no en un detalle). Va como sección del informe de fase. **Sin esta tabla el endpoint no es publicable y F0 no cierra.**

> El movimiento de tipos es **solo relocalización**: el api-client los re-exportará en F2 para que ningún consumidor cambie su import. No cambies formas en este paso.

### F1 — Backend

5. **Migración del índice** `(tenant_id, planned_window_start_at DESC, id DESC)` sobre `execution_orders`, con `CREATE INDEX CONCURRENTLY` bajo el runner no transaccional de ADR-066, aplicada **por schema de tenant**. Evalúa si conviene además el índice de cuadrilla (hoy existe el de técnico, falta el de crew) y decláralo con su justificación.
6. **`ExecutionOrdersService.list()`** con:
   - Filtros de spec §4.7.1.
   - `clampPage` y tope `page*limit <= 10_000`.
   - `buildPageMeta({ randomAccess: true, sortableFields: [] })`.
   - Orden por defecto `planned_window_start_at DESC, id DESC` — **el desempate por `id` es obligatorio** (ADR-065 §12).
   - **Scoping por actor en el `WHERE`** (paso 7).
   - Proyección **exactamente** la de spec §4.7.1. **No** invoques `getCompletion`, `getSyncState` ni `getInventoryReconciliation`: en un listado son N+1 por fila y su aparición en el path del listado es causa de rechazo en review.
7. **Scoping por actor.** `ExecutionOrderAccessGuard` es deny-by-default en rutas sin `:id`, así que el `@Get()` exige `@ExecutionOrderTenantScoped()`; **y ese decorador desactiva el ABAC del guard**. Replica en el `WHERE` lo que `assertActorAccess` hace por recurso: `TECHNICIAN`/`CONTRACTOR` ven solo lo asignado a ellos o a su cuadrilla; `ADMIN`/`NOC`/`SUPPORT` ven el tenant. Patrón a copiar: `RESTRICTED_ROLES` en `apps/api/src/modules/tasks/services/tasks.service.ts:233-250`.
8. **`@Get()` en el controlador**, declarado **antes** de `@Get(':id/evidences')` (línea 121), con los decoradores de spec §4.7.1.
9. **`responsibleLabel`** aditivo y opcional en la proyección de `TasksService.list()` (spec §4.7.4). Habilita retirar el crawl de usuarios en F5.
10. **Tests** (§6).
11. **Consulta a AI-SEC-ENG** sobre el paso 7 antes de cerrar la fase. Es el riesgo R1 de la spec y la razón por la que esta fase tiene revisión reforzada.

## 5. Restricciones no negociables

1. **No modificar `execution-orders.ts`.** Está congelado y declara "no modificar sin versionar". Archivo hermano.
2. **No exponer `cursor`** en el listado: `page` y `cursor` son excluyentes (ADR-065 §10) y el recurso es `randomAccess: true`.
3. **No poblar `sortableFields`** sin medición de p95 de AI-PLAT-OPS y autorización de AI-EM-ARCH. La lista vacía **es** estado conforme (ADR-065 §22-bis punto 1), y con lista vacía el endpoint **no anuncia `sortBy`/`sortDir` en OpenAPI** (punto 3).
4. **No proyectar `serviceAddress`, `workInstructions` ni datos de contacto** sin la tabla de finalidad del paso 4 escrita y aprobada (ADR-067 §3).
5. **No tocar `apps/portal/`.**
6. **No romper boundaries del modulith:** sin acceso directo a tablas de otro módulo, sin imports cruzados. La integración con MOD09/MOD12 sigue siendo por outbox (ADR-068).
7. Sin PII real ni credenciales en fixtures, tests ni documentación.
8. Solo `pnpm`.

## 6. Entregables técnicos obligatorios

- Los dos archivos de contrato y su export.
- Migración del índice bajo el runner de ADR-066.
- `list()` en el servicio y `@Get()` en el controlador.
- `responsibleLabel` en la proyección de tareas.
- OpenAPI actualizado.
- **Tests, todos bloqueantes de la fase:**
  - `execution-orders.controller.http.spec.ts` — 403 **sin** `@ExecutionOrderTenantScoped()` y 200 **con** él; `meta` completo; `page*limit > 10_000` devuelve 400.
  - `tasks.boundary.spec.ts` — **BOLA sobre el listado**: un `TECHNICIAN` no ve OT ajenas. Hermano del caso 6a existente para el detalle.
  - `tasks.swagger.spec.ts` — `sortBy` y `sortDir` **no** se anuncian mientras la lista blanca esté vacía.
  - E2E API: bloque nuevo en `e2e/tests/api/execution-orders-operational.spec.ts` (hoy solo cubre comandos y `:id`) con listado paginado y BOLA. Prerrequisito del fichero: `npx tsx e2e/scripts/provision-execution-template.ts`.
  - **Verificación ADR-065 §15:** con dos usuarios de alcance distinto, que el `total` del pie no revele el total del tenant a un técnico.

## 7. Entregables documentales obligatorios

- Informe de fase en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md`, incluyendo la **tabla de finalidad por campo** del paso 4 y el conteo real de tests ejecutados.
- Evidencia de calidad en `docs/quality/`.
- **Conteo real de tests, no la salida de caché.** Un `PASS` de turbo con caché caliente, `--passWithNoTests`, o un dev server reusado no es evidencia: reporta suites y casos efectivamente ejecutados.
- `[BLOQUEO]` a AI-EM-ARCH si algo impide cerrar, **antes** de terminar la sesión.

## 8. Stop / Go

**F0 no cierra si:**

- La tabla de finalidad por campo no está escrita.
- Se modificó `execution-orders.ts`.

**F1 no cierra si:**

- Falta el test BOLA sobre el listado, o falta el caso que verifica 403 sin el decorador y 200 con él.
- `sortableFields` quedó poblado.
- OpenAPI anuncia `sortBy`/`sortDir` con la lista vacía.
- El path del listado invoca `getCompletion`, `getSyncState` o `getInventoryReconciliation`.
- La migración no usa `CREATE INDEX CONCURRENTLY` bajo el runner de ADR-066.
- AI-SEC-ENG no revisó el scoping por actor.

**Go:** con lo anterior en verde, F5 queda desbloqueada y AI-EM-ARCH registra los contratos como congelados en firme.

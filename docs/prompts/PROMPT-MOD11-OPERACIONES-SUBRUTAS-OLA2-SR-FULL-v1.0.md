# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 2 · AI-SR-FULL

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 2 — implementación (paralelo por superficie)
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `sr-backend` (AI-SR-FULL)
**Fase:** **F1** — listado de OT, scoping por actor, índice, `responsibleLabel`
**Cierra:** parte de **G5** (etapa 5 del protocolo)
**Consulta obligatoria:** **AI-SEC-ENG** antes de cerrar la fase

> Orden de despacho: acota qué parte del encargo formal ejecutas. Encargo formal: `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md`, **solo la sección F1**. F0 ya está cerrada y sus contratos publicados.

---

## 1. Estado de entrada — tu DoR ya está satisfecho (§3.1 del protocolo)

Verificado por AI-EM-ARCH en `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md`:

| Condición | Estado |
| --- | --- |
| G2 (UX spec + contrato de componente) | ✅ **Cerrado** |
| G3 (dictámenes de factibilidad) | ✅ **Cerrado** — tu propio dictamen: VIABLE CON AJUSTES |
| G4 (prompt de ejecución con contratos citados por ruta y versión) | ✅ **Efectivo** |
| H1 — contratos de F0 publicados | ✅ `execution-orders-list.ts` v1 y `operational-tasks.ts` v1, exportados en `packages/shared/src/index.ts:54-55` |

**Arranca.** Si aun así encuentras la entrada incompleta, emite `[BLOQUEO]` antes de escribir código.

## 2. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §3 etapa 5, §4 gates técnicos (**y su nota de caché**), §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.4 olas, §4 skills, §5 protocolo de sesión, §8 verificación.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — §4.7 y §4.8 normativos.
5. **`docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md`** — tu propio dictamen; sus §3, §4 y §5 son la base de estimación y riesgo de esta fase.
6. `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA1-CONSOLIDACION-v1.0.md` §4 — **las resoluciones de G3 son directrices vinculantes de este despacho**.
7. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md` — encargo formal, sección F1.

## 3. Alcance: **solo F1**

Ejecuta los pasos 5 a 11 del prompt formal:

5. **Migración del índice** `(tenant_id, planned_window_start_at DESC, id DESC)` sobre `execution_orders`, con `CREATE INDEX CONCURRENTLY` bajo el runner no transaccional de ADR-066, **por schema de tenant**. Numeración siguiente a la 129, patrón de la 089 (tu dictamen §4). Evalúa el índice de cuadrilla y declara su justificación o su descarte.
6. **`ExecutionOrdersService.list()`** con los filtros de spec §4.7.1, `clampPage`, tope `page*limit <= 10_000`, `buildPageMeta({ randomAccess: true, sortableFields: [] })`, orden por defecto `planned_window_start_at DESC, id DESC` (**el desempate por `id` es obligatorio**, ADR-065 §12) y la proyección exacta de spec §4.7.1.
7. **Scoping por actor en el `WHERE`** — ver directriz **D1** abajo.
8. **`@Get()`** en `execution-orders.controller.ts`, declarado **antes** de `@Get(':id/evidences')` (línea 121), con `@ExecutionOrderTenantScoped()` obligatorio.
9. **`responsibleLabel`** aditivo y opcional en la proyección de `TasksService.list()`.
10. **Tests** (§6).
11. **Consulta a AI-SEC-ENG** sobre el scoping antes de cerrar.

## 4. Directrices de G3 — vinculantes, resueltas por AI-EM-ARCH

### D1 (de tu ajuste A1) — Scoping v1 sin cuadrilla

El *"o su cuadrilla"* de spec §4.7.2 **no se implementa en esta fase**. Tu dictamen demostró que la membresía de cuadrilla pertenece a WFM y no es inferible hoy (`assertActorAccess:291-294` lo declara explícitamente).

**Decisión adoptada — tu recomendación:** el scoping v1 es la **réplica exacta de la semántica de lectura del detalle**: asignada al técnico **o** pool sin asignar distinto de `CREATED`. El criterio de aceptación es que **ninguna fila que la bandeja liste dé 404 al abrirse** — consistencia bandeja↔detalle.

La resolución de cuadrilla entra como refinamiento **v2**, cuando exista el port tipado de WFM. Queda registrada como deuda en la consolidación §7; **no la abras aquí**.

### D2 (de tu ajuste A2) — `total` por alcance del actor

Se satisface estructuralmente contando sobre el query builder ya scopeado. **Ya es stop/go bloqueante** de esta fase: test con dos usuarios de alcance distinto (ADR-065 §15). No se cierra sin él.

### D3 (de tu ajuste A3) — Bucket de throttling

Este controlador **salta el throttler global** (comentario en `execution-orders.controller.ts:81-100`). Verifica `resolveBucket` y deja el nuevo `GET` clasificado en el bucket de **lectura ligera** del `TenantAwareThrottlerGuard`. Declara el resultado en el informe.

## 5. Skills — leer antes de escribir código

**Obligatorias:** `nestjs-expert`, `database-migration`, `postgresql`, `backend-security-coder`.
**De apoyo:** `security-auditor` (BOLA y revisión del scoping), `openapi-spec-generation`, `testing-patterns`, `observability-engineer` (solo si instrumentas el listado).
**No uses:** `bullmq-specialist`, `auth-implementation-patterns`, `architecture-decision-records` (**no nace ADR nuevo**; si crees que hace falta, emite `[BLOQUEO]`).

`AGENTS.md`: el `SKILL.md` se **lee** como documentación, no se invoca como tool. Leerlas después de escribir el código no sirve de nada.

## 6. Superficie exclusiva — reparto de la ola 2

Trabajas **solo** en `apps/api/` y `packages/database/`. `apps/portal/` es de AI-FE-PLATFORM en esta misma ola, sobre la misma rama `main` (plan §4.5). Ningún archivo cae en ambos alcances. **Si necesitas tocar `apps/portal/`, el reparto está mal: emite `[CONSULTA]` a AI-EM-ARCH antes de hacerlo** — no lo resuelvas por merge.

## 7. Restricciones no negociables

1. **No modificar** `packages/shared/src/contracts/operations/execution-orders.ts` — congelado.
2. **No cambiar** los contratos de F0 (`execution-orders-list.ts`, `operational-tasks.ts` v1). Un cambio se versiona y se notifica a AI-EM-ARCH; no se parchea en silencio (§3bis regla 1).
3. **No tocar `apps/portal/`.**
4. **No exponer `cursor`** (ADR-065 §10: `page` y `cursor` son excluyentes).
5. **No poblar `capabilities.sortableFields`** sin medición de p95 y autorización de AI-EM-ARCH. La lista vacía **es** estado conforme (§22-bis punto 1), y con ella OpenAPI **no anuncia** `sortBy`/`sortDir` (punto 3).
6. **No invocar `getCompletion`, `getSyncState` ni `getInventoryReconciliation`** en el path del listado: N+1 por fila, y su aparición es causa de rechazo en review.
7. **No proyectar** `serviceAddress`, `workInstructions` ni datos de contacto — la tabla de finalidad de F0 (tu informe §7) fija qué se proyecta.
8. **No mezclar** la `WorkOrder` ligera de MOD09/WFM.
9. **No reordenar** `@Get('health/relay')` (deuda registrada, spec §10.1).
10. Sin PII real ni credenciales. Solo `pnpm`.

## 8. Riesgo dominante (R1 de tu dictamen)

`@ExecutionOrderTenantScoped()` habilita la ruta **y desactiva el ABAC del guard** (`execution-order-access.guard.ts:42-46` retorna sin `assertActorAccess`). Con el decorador y sin scoping en el servicio, **filtras OT entre técnicos**; sin el decorador, la ruta responde 403 inexplicable.

El scoping vive en el `WHERE` del servicio, **nunca en el guard**. Triple control, los tres bloqueantes: test 403-sin-decorador / 200-con-decorador, test BOLA sobre el listado, y consulta a AI-SEC-ENG.

## 9. Entregables y verificación

- Migración, `list()`, `@Get()`, `responsibleLabel`, OpenAPI actualizada.
- **Tests bloqueantes:**
  - `execution-orders.controller.http.spec.ts` — 403 sin el decorador, 200 con él; `meta` completo; `page*limit > 10_000` → 400.
  - `tasks.boundary.spec.ts` — **BOLA sobre el listado**: un `TECHNICIAN` no ve OT ajenas.
  - `tasks.swagger.spec.ts` — `sortBy`/`sortDir` **no** anunciados con la lista blanca vacía.
  - **ADR-065 §15** — dos usuarios de alcance distinto: el `total` del pie no revela el total del tenant.
  - E2E API en `e2e/tests/api/execution-orders-operational.spec.ts`: listado paginado + BOLA. Prerrequisito: `npx tsx e2e/scripts/provision-execution-template.ts`.
- Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm --filter @iwana/api test`, `pnpm --filter @iwana/db migration:tenant:run`.

**Regla de evidencia (§8.1 del plan):** un verde de turbo con caché caliente, `--passWithNoTests` o un dev server reusado **no son evidencia**. Adjunta la línea de resumen con **`Cached: 0`** (o corre con `--force`) y declara conteo real de suites y casos, plataforma y duración. Un informe con verde sin ese conteo se devuelve sin revisar.

## 10. Handoff H2 (F1 → F5) — condición de aceptación

Endpoint vivo, `meta` completo, scoping verificado, OpenAPI actualizada. **Se acepta con el test BOLA en verde y la revisión de AI-SEC-ENG registrada**, no con tu declaración de que está listo.

## 11. Stop/go — F1 no cierra si

- Falta el test BOLA sobre el listado, o el caso 403-sin-decorador / 200-con-decorador.
- Falta la verificación ADR-065 §15 con dos alcances.
- `sortableFields` quedó poblado, u OpenAPI anuncia `sortBy`/`sortDir` con la lista vacía.
- El path del listado invoca `getCompletion`, `getSyncState` o `getInventoryReconciliation`.
- La migración no usa `CREATE INDEX CONCURRENTLY` bajo el runner de ADR-066.
- **AI-SEC-ENG no revisó el scoping.**
- El informe reporta verde sin conteo real.

## 12. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` a AI-SEC-ENG (manejo de PII o control de seguridad, **bloqueante**), a AI-FE-PLATFORM (necesidades del frontend sobre shape, paginación o errores), a AI-EM-ARCH (ambigüedad de alcance, contrato o boundary, **bloqueante**).

## 13. Reporte final

Informe de fase en `docs/informes/`. Declara: skills leídas, archivos tocados, resultado de cada test bloqueante con **conteo real**, resolución de D3 (`resolveBucket`), veredicto de AI-SEC-ENG, y deuda residual por severidad.

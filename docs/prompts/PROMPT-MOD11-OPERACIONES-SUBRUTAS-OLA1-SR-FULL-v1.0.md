# ENCARGO DE DESPACHO — MOD11 Operaciones · Ola 1 · AI-SR-FULL

**Módulo:** MOD11 — Ejecución Operativa / Tareas
**Ola:** 1 — congelación de contratos y factibilidad
**Versión:** 1.0 · **Fecha:** 2026-09-13 · **Emitido por:** AI-EM-ARCH
**Agente destinatario:** `sr-backend` (AI-SR-FULL)
**Cierra:** parte de **G3** (dictamen de factibilidad backend) y congela el contrato de API tipado

> Este documento es una **orden de despacho**: acota qué parte del encargo formal ejecuta este agente en esta ola. El encargo formal es `PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md`; aquí no se reescribe, se acota.

---

## 1. Lectura obligatoria, en este orden

1. `AGENTS.md` — gobernanza y **Skills Dispatch**.
2. `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md` v1.5 — §2 RACI, §3 workflow, **§3.1 definition of ready**, §3bis contratos congelados, §6.3 marcadores.
3. `docs/plans/2026-09-13-mod11-operaciones-subrutas-bandeja-ot.md` v2.1 — §3.3 mapeo a gates, §3.4 olas, §4 skills, §5 protocolo de sesión.
4. `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` v1.0 (**Aprobado por el CTO**) — §4.7 y §4.8 normativos.
5. `docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-F0-F1-v1.0.md` — encargo formal.

## 2. Alcance de esta ola: **F0 + dictamen. NO F1.**

### Parte A — F0: congelar el contrato de API tipado (§3bis)

Ejecuta **solo** los pasos 1 a 4 de la sección "F0 — Contratos" del prompt formal:

1. Crear `packages/shared/src/contracts/operations/execution-orders-list.ts` con `ExecutionOrderListItem` y `ListExecutionOrdersQuery` (spec §4.7.1). Reusa el `Page<T>` ya congelado; **no** crees envelope nuevo.
2. Crear `packages/shared/src/contracts/operations/operational-tasks.ts` moviendo los nueve tipos de `apps/portal/src/lib/api-client.ts:6699-6816`. `ListOperationalTasksResponse` gana `meta: ListMeta` y marca `total`/`page`/`limit` como `@deprecated`. `ListOperationalTasksParams` gana `sortBy` y `sortDir`.
3. Exportar ambos desde `packages/shared/src/index.ts`.
4. Escribir la **tabla de finalidad por campo** (ADR-067 §2) de `ExecutionOrderListItem`: por cada campo proyectado, qué finalidad operativa lo justifica **en una bandeja**, no en un detalle.

**No ejecutes F1** — migración de índice, `list()`, `@Get()`, `responsibleLabel`. Es la ola 2 y depende de que AI-EM-ARCH apruebe G2 y G3.

### Parte B — Dictamen de factibilidad backend (etapa 3, gate G3)

En `docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md`, veredicto **viable / viable con ajustes / inviable**, con costo estimado y riesgos, sobre lo que F1 tendrá que hacer:

- El `@Get()` con `@ExecutionOrderTenantScoped()`. Verifica en `apps/api/src/modules/tasks/guards/execution-order-access.guard.ts` que el guard es deny-by-default en rutas sin `:id` y que ese decorador **desactiva el ABAC** — riesgo R1 del plan.
- El scoping por actor en el `WHERE`, replicando `RESTRICTED_ROLES` de `apps/api/src/modules/tasks/services/tasks.service.ts:233-250`.
- La migración del índice `(tenant_id, planned_window_start_at DESC, id DESC)` con `CREATE INDEX CONCURRENTLY` bajo ADR-066, por schema de tenant.
- La proyección sin `completion`/`syncState`/`inventoryReconciliation` (N+1 si se incluyen).
- `responsibleLabel` aditivo en `TasksService.list()`.

Si algo de spec §4.7 es inviable o necesita ajuste, **dilo**: para eso existe G3, y cuesta un orden de magnitud menos ahora que en implementación.

## 3. Skills — leer antes de escribir código

**Obligatorias:** `monorepo-architect`, `typescript-pro`, `openapi-spec-generation`.
**De apoyo:** `typescript-expert` (trae `scripts/ts_diagnostic.py`), `nestjs-expert` y `postgresql` (para el dictamen), `docs-architect`.
**No uses:** `bullmq-specialist`, `auth-implementation-patterns`, `architecture-decision-records` (no nace ADR nuevo; si crees que hace falta, emite `[BLOQUEO]`).

`AGENTS.md`: Claude Code **lee** el `SKILL.md` como documentación, no lo invoca como tool. Leerlas después de escribir el código no sirve de nada.

## 4. Contratos que produces (congelados al cerrar)

| Contrato | Ruta | Versión |
| --- | --- | --- |
| Listado de OT | `packages/shared/src/contracts/operations/execution-orders-list.ts` | v1 |
| Tareas operativas | `packages/shared/src/contracts/operations/operational-tasks.ts` | v1 |

Un cambio posterior se versiona y se notifica a AI-EM-ARCH; no se parchea en silencio (§3bis regla 1).

## 5. DoR — verifica antes de empezar (§3.1)

La spec está aprobada por el CTO y los contratos a producir están especificados por ruta en §4.7. Si esa entrada te parece incompleta, emite `[BLOQUEO]` **antes** de escribir código; no arranques "mientras se aclara".

## 6. Restricciones no negociables

1. **No modificar** `packages/shared/src/contracts/operations/execution-orders.ts` — congelado. Archivo hermano.
2. **No tocar** `apps/portal/`.
3. **No exponer `cursor`** (ADR-065 §10: `page` y `cursor` son excluyentes).
4. **No poblar `capabilities.sortableFields`**: lista vacía es estado conforme (ADR-065 §22-bis) y con ella OpenAPI no anuncia `sortBy`/`sortDir`.
5. **No proyectar** `serviceAddress`, `workInstructions` ni datos de contacto sin la tabla de finalidad escrita (ADR-067 §3).
6. **No mezclar** la `WorkOrder` ligera de MOD09/WFM.
7. Sin PII real ni credenciales. Solo `pnpm`.

## 7. Stop/go — F0 no cierra si

- Falta la tabla de finalidad por campo.
- Se modificó el contrato congelado `execution-orders.ts`.
- `pnpm --filter @iwana/shared build` no queda en verde con los tipos importables.

## 8. Marcadores (§6.3 — exactos, sin variantes)

`[BLOQUEO]` a AI-EM-ARCH antes de cerrar sesión. `[CONSULTA]` si necesitas criterio de otro perfil.

## 9. Reporte final

Declara: skills leídas, archivos creados, veredicto del dictamen, y resultado real de `pnpm --filter @iwana/shared build` y `pnpm typecheck`. Si reportas tests, **conteo real** — un verde de turbo con caché caliente no es evidencia.

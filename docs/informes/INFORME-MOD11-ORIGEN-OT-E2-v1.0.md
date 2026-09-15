# INFORME — MOD11 Origen de la OT · E2: la puerta de despacho

**Versión:** 1.0
**Fecha:** 2026-09-15
**Agente:** AI-SR-FULL (`sr-backend`) · **C:** `sec-eng` (condición de cierre)
**Encargo:** `docs/prompts/PROMPT-MOD11-ORIGEN-OT-E2-v1.0.md`
**Plan:** `docs/plans/2026-09-14-mod11-origen-ot.md` · **Spec:** `docs/specs/2026-09-14-mod11-origen-ot-design.md` (§3.1, §3.6, §3.6.1, §3.6.2, §3.8) · **ADRs:** ADR-091 §D1/D3/D5/D6, ADR-076 §D1/D4
**Estado:** **GO.** CA-05 a CA-08c en verde con conteo real; `sec-eng` GO sin bloqueantes; sin DDL.

---

## 1. Veredicto stop/go

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-05 — OT en `CREATED` sin ventana ni técnico, con sitio y origen explícitos; sin sitio / sin origen se rechaza | ✅ | Unit `execution-orders.dispatch.spec.ts` (payload con `scheduleEventId/plannedWindow*/assignees/visitRequestId` nulos + recibo `CREATED`); schema rechaza sin sitio, sin `originContext` y con ventana/evento/responsable (strict); HTTP `POST /dispatch` 201 / 400 |
| CA-06 — la OT sin cita no consume capacidad, verificado desde la agenda | ✅ | El despacho solo persiste `ExecutionOrder` (ningún `ScheduleEvent`); `ScheduleConflictService.hasConflictWithManager` real solo lee `schedule_events` (tablas accedidas `['schedule_events']`, sin `execution_orders`) → sin filas no hay conflicto |
| CA-07 — asignar lleva a `ASSIGNED` y persiste de verdad | ✅ | Unit (SET del UPDATE con técnico + estado, patrón T0) + PG contra base real: relectura cruda `ASSIGNED` + `assigned_technician_id`, sin mutaciones colaterales |
| CA-08 — `CREATED` fuera del pool, por negación, técnicos Y contratistas, cinco sitios coherentes | ✅ | S1 404 ambos roles + supervisor sí lee; S2 predicado con `poolExcludedStatus=CREATED` ligado + filtrado; S3 sin `START` campo / `ASSIGN` supervisión; S4 delegación intacta; S5 superficie + oracle |
| CA-08b — asignable con alcance de supervisión, no sin él | ✅ | `assertActorAccess(...,SUPERVISE)` resuelve con port `true`, 404 con port `false`; sin sitio 404 aunque el port autorice (fail-closed) |
| CA-08c — rechaza origen sin camino y conserva trazabilidad §3.8 | ✅ | `PROVISIONING` → 400 `ORIGIN_WITHOUT_PATH` (servicio + schema); `TASKS` sin ref → 400 `ORIGIN_REF_REQUIRED`; `TASKS` con ref espeja `taskId` |
| Consola viva — listado y detalle 200 con OT sin ventana | ✅ | Unit (proyección con `schedule: {eventId: null, window: null}`) + HTTP 200 detalle y lista con fila sin ventana |
| Suite `tasks` sin regresión (piso 651) | ✅ | **676/676 en 34 suites**, jest directo `--ci --runInBand` (base 651 + 20 despacho + 5 HTTP) |
| Dictamen `sec-eng` cinco sitios | ✅ | GO sin bloqueantes (ver §5) |

**NO-GO evitados:** los dos tripwires de E1 están sustituidos (eran 500 garantizado al nacer la primera OT sin ventana); el DDL no se tocó; la bolsa `CREATED` sigue sin ser reclamable; el despacho no abre vía que eluda el chequeo de conflicto (el input estricto rechaza ventana/evento/responsable).

---

## 2. Cambios

| Archivo | Cambio |
| --- | --- |
| `packages/shared/src/contracts/operations/execution-orders.ts` | Contrato v1.3: `ExecutionOrderScheduleView.eventId/window` nulables + `DispatchExecutionOrderCommand/Receipt` nuevos (historial versionado en el archivo) |
| `packages/shared/src/contracts/operations/execution-orders-list.ts` | `ExecutionOrderListItem.schedule` nulable (documentado para E4) |
| `apps/api/src/modules/tasks/dto/execution-orders.dto.ts` | DTOs de respuesta con `schedule` nulable + `DispatchExecutionOrderSchema` (strict, sin default `MANUAL`, `PROVISIONING` rechazado, sitio UUID obligatorio, `originRefId` exigido fuera de `MANUAL`) + DTOs OpenAPI |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts` | Input del puerto relajado (evento/ventana opcionales; agenda intacta); núcleo nulable (salta idempotencia por evento si no hay evento); `dispatchFromCoordination` (delega en el núcleo compartido, cinturones `ORIGIN_WITHOUT_PATH`/`ORIGIN_REF_REQUIRED`, espejo `taskId` para `TASKS`); `toListItem` tolerante (tripwire sustituido) |
| `apps/api/src/modules/tasks/execution-orders.controller.ts` | `POST /tasks/execution-orders/dispatch` (solo ADMIN/NOC/SUPPORT + SUPERVISE + `@ExecutionOrderTenantScoped`); detalle sin tripwire (emite nulos, 200) |
| `apps/api/src/modules/tasks/interceptors/execution-order-response-headers.interceptor.ts` | `EXECUTION_ORDER_CONTRACT_VERSION` `1.1` → `1.3` (regla del propio archivo: versionar invalida cachés) |
| Tests | `execution-orders.dispatch.spec.ts` (20, nuevo), `execution-orders.dispatch.postgres.integration.spec.ts` (3 PG, nuevo), +5 HTTP despacho/consola viva, OLA1 R11a 22→23 pares (ampliación aprobada), ETag 1.1→1.3 |

**No tocado:** DDL (cero migraciones), S1/S2/S3/guard (verificados intactos por `sec-eng`), camino de agenda (pasa evento + ventana como siempre), consola/portal (solo inventario §6), JSON OpenAPI congelado `tasks-execution-orders.v1.json` (el despacho es contrato nuevo por decoradores vivos, precedente MOD12).

---

## 3. Decisiones §3.8 (no heredadas, con justificación)

**D1 — `PROVISIONING` se retira, no se le da camino.** Darle camino habría significado inventar semántica operativa (¿qué distingue un despacho `PROVISIONING` de un `MANUAL` o `CRM`?) sin módulo consumidor ni producto que lo pida: una etiqueta con camino ficticio es peor deuda que una etiqueta rechazada en voz alta. El rechazo es en dos capas (schema `ORIGIN_WITHOUT_PATH` + cinturón en servicio para llamantes internos) y el valor permanece en el enum por compatibilidad — retirarlo del enum y de la UI (`WORK_ORDER_SOURCE_CONTEXT_OPTIONS`) exige decisión de producto y es deuda P2 de E4. CA-08c lo ejercita directamente.

**D2 — Salto `BILLING`/`SYSTEM`→`TASKS`: pérdida aceptada a un salto, trazabilidad por `taskId`.** Conservar el primer nivel habría exigido extender `WorkOrderSourceContext` con `BILLING`/`SYSTEM` (cambio de dominio + DDL en espíritu + reapertura de ADR-076) sin necesidad operativa: la unidad de deduplicación del campo es la tarea, no el documento aguas arriba. La convención queda fijada y testeada: despacho con origen `TASKS` exige `originRefId` (= id de la tarea) y la columna `task_id` lo espeja — precedente exacto de los dos caminos de agenda (`visit-requests.service.ts`, `schedule-events.service.ts`)—. La cadena `OT.task_id → tarea.originContext/originRefId` conserva el primer nivel a un salto, igual que hoy.

---

## 4. Evidencia con conteo real

- `tasks`: **34 suites, 676/676** (piso del encargo 651; base E1-sin-revert 651 + 20 despacho + 5 HTTP; el conteo E1 de 680 incluía 29 del spec de revert, no afectado).
- `wfm` (llamadores del puerto tras relajar el input): **19 suites, 238/238**.
- `shared`: **10 suites, 122/122**.
- PG despacho (`IWANA_DB_INTEGRATION_AVAILABLE=true`, `E2E_TENANT_SLUG=iwana`, config `jest.integration.config.js`): **3/3 en dos corridas** — CA-05 (fila cruda `CREATED` + 6 nulos + sitio), CA-07 (relectura `ASSIGNED` + técnico, ventana intacta), guarda compartida (segundo despacho 409 con `activeExecutionOrderId`). Ida y vuelta: 135 `up` en `beforeAll`, limpieza + `down` en `afterAll` (el `down` es fail-closed ante OT sin evento: suite verde = cero remanentes).
- Hallazgo de la primera corrida PG (evidencia de que la suite trabaja): el tenant de integración conservaba el esquema pre-E1 y el despacho falló con `NOT NULL` en `schedule_event_id`; se aplicó el precedente E1 (up/down de la 135 existente, **sin DDL nuevo**) y pasó.
- `tsc --noEmit` (api, shared; `@iwana/shared` recompilado a `dist/` por el consumo del api) y `eslint` sobre los 11 archivos tocados: limpios.

---

## 5. Cierre `sec-eng` (condición RACI-C)

Revisión de solo lectura sobre el workspace (`ses_f5ad2d8a3ffeNUJgonXux446pD`): **GO sin bloqueantes, sin `[BLOQUEO]`**. S1/S2/S3 intactos (desplazamiento de líneas sin cambio semántico), S4 correctamente enforcementada para `POST /dispatch` (decorador tenant-scoped + Roles + SUPERVISE; ninguna decisión sobre datos no persistidos), S5 coherente, cinturones de servicio + schema en dos capas verificados, paridad lista↔detalle por negación suficiente para cierre.

Respuestas a sus dos notas (no bloqueantes):
- **M1 (audit del despacho):** el nacimiento no usa `beginCommand/finishCommand` — **en ningún camino**: el camino de agenda tampoco (`createFromSchedulingWithManager` leído completo). Paridad total: el audit de nacimiento es `createdByUserId/updatedByUserId` + tenant + guarda de origen en ambos. Si producto exige asiento de nacimiento, es deuda P3 nueva, no regresión.
- **B-pregunta (`CONTRACTOR` en `unblock`):** intencional y ajeno a E2 — es el cierre de H6 (`INFORME-MOD11-H6-PARIDAD-CONTRATISTA-v1.0.md`, plan §8: H6 cerrado). E2 no tocó esa línea (verificado en el diff: el hunk pertenece al carril H6).

---

## 6. Inventario portal ante contrato nulable (alcance E4, no se arregla aquí)

| Ruta | Supuesto que rompe | Efecto con OT sin ventana |
| --- | --- | --- |
| `apps/portal/src/components/operations/ExecutionOrdersTable.tsx:202-208` (`formatExecutionOrderWindow`) | `order.schedule.window.startAt` incondicional | `TypeError` al renderizar la fila → rompe la tabla entera |
| `apps/portal/src/components/operations/ExecutionOrderSummary.tsx:194-196, 259-260` | `order.schedule.window` + `new Date(window.startAt)` | `TypeError` en la sección Ventana del resumen |
| `apps/portal/src/lib/api-client.ts:6721-6781` (tipos reexportados de shared) | Tipos pre-v1.3 | Tras regenerar, el typecheck de E4 señalará cada deref (trabajo de E4, no de E2) |
| `ExecutionOrderDrawer.tsx`, `SchedulingClient.tsx`, `ScheduleEventDrawer.tsx` | — | Sin derefs directos de `schedule.eventId/window` (verificado por búsqueda): no rompen por este cambio |

---

## 7. Deuda por severidad

- **P1 (handoff a E3):** `POST /dispatch` no crea `ScheduleEvent`; E3 debe correr el chequeo de conflicto de MOD09 sin excepción al vincular (riesgo R1 del plan, mitigado por schema strict + CA-06/CA-09).
- **P2 (handoff a E4):** presentación «sin ventana» + orden por defecto sin asumir `planned_window_start_at` (ADR-091 §D5, condición de entrega) + baja de `PROVISIONING` del enum/UI con decisión de producto (§3).
- **P3:** existencia de `organizationSiteId` no validada al despachar (columna sin FK por ADR-047 regla 6; validar existencia exigiría port cross-module nuevo). Una sede inexistente equivale operativamente a una OT muerta (404 fail-closed al asignar), nunca a fuga.
- **P3:** asiento de nacimiento (`recordStatusTransition` al crear) inexistente en ambos caminos — paridad agenda/despacho, decidir con producto.
- **P3 (preexistente):** rama muerta `CREATED→START` en `computeAllowedActions` (H5); `ticketId` texto libre sin validar contra MOD10 (spec §8.4).

## 8. Handoff a E3

E3 recibe: `dispatchFromCoordination` + núcleo compartido con evento/ventana nulos, guarda única, `CREATED` alcanzable y asignable, lecturas 200 ante nulo. E3 vincula evento + ventana a OT existente y corre conflicto sin atajo (CA-09 a CA-11).

# MOD10 + MOD11 + MOD09 + MOD12 Flujo Operativo Cableado — Implementation Plan

**Versión:** 1.0  
**Fecha:** 2026-07-07  
**Fecha de aprobación:** 2026-07-07  
**Estado:** Aprobado  
**Aprobado por:** CTO  

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el cableado y las reglas del flujo operativo end-to-end (ticket → tarea → visita → OT → inventario cliente) sin violar ADR-047 ni boundaries Modulith.

**Architecture:** Mantener owners por módulo. La integración es por referencias lógicas, puertos tipados y orquestación en portal. Se elimina duplicidad Assurance portal/worker, se completa ledger post-OT hacia `CUSTOMER_SITE` y se sincronizan estados en cierre de OT.

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, Zod, TypeORM, PostgreSQL multi-tenant por schema, BullMQ, Jest, Supertest, Playwright, pnpm.

---

## Source documents

- `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`
- `docs/specs/2026-06-24-mod09-mod11-programacion-centro-agendamiento-ot-ejecucion-design.md`
- `docs/adrs/ADR-047-Separacion-Programacion-y-OT-Ejecucion.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- `docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md`
- `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`

## File map

### Shared / database

- Modify: `packages/shared/src/enums/wfm/wfm-work-type.enum.ts` (solo si hace falta helper de mapeo; preferir helper nuevo)
- Create: `packages/shared/src/operations/task-type-to-wfm-work-type.ts`
- Create: `packages/shared/src/operations/task-type-to-wfm-work-type.spec.ts`
- Modify: `packages/database/src/entities/execution-order.entity.ts`
- Create: `packages/database/src/migrations/tenant/056_execution_order_traceability_refs.ts`

### API — Assurance / WFM / Tasks

- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`
- Modify: `apps/api/src/modules/assurance/ports/assurance-field-service.adapter.ts`
- Modify: `apps/worker/src/processors/assurance-field-service.processor.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-order-inventory.service.ts`
- Modify: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/ports/inventory-movement.port.ts`
- Create: `apps/api/src/modules/inventory/services/customer-site-location.resolver.ts`
- Tests: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`
- Tests: `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts`
- Tests: `apps/worker/src/processors/assurance-field-service.processor.spec.ts` (crear si no existe)

### Portal

- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`
- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`
- Modify: `apps/portal/src/components/assurance/AssuranceClient.tsx`
- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx`
- Modify: `apps/portal/src/components/operations/ExecutionOrderCloseStep.tsx` (o equivalente en drawer)
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`

### Documentación viva

- Update: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`
- Create: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md`

---

## Task 1: Unificar origen Assurance → solicitud de visita (GAP-FLOW-01)

**Objetivo:** Una sola solicitud de visita activa por ticket Assurance, sin carrera portal vs worker.

**Files:**
- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`
- Modify: `apps/worker/src/processors/assurance-field-service.processor.ts`
- Modify: `apps/api/src/modules/assurance/services/tickets.service.ts`
- Test: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.spec.ts`
- Test: worker processor spec

- [ ] **Step 1: Write failing test — deduplicación por ticket, no por workType**

```ts
it('no crea segunda visita Assurance si ya existe una activa para el mismo ticket', async () => {
  // portal creó TECHNICAL_VISIT; worker intenta SUPPORT → debe no-op
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @iwana/api test -- --runInBand assurance-field-service`  
Run: `pnpm --filter @iwana/portal test -- visit-request-origin-orchestration`

- [ ] **Step 3: Unificar `workType` Assurance a `SUPPORT`**

Portal `createAssuranceVisitRequestAndRoute` debe usar `WfmWorkType.SUPPORT` (mismo que worker) o ambos deben deduplicar solo por `(originContext, originRef)` sin filtrar `workType`.

- [ ] **Step 4: Endurecer deduplicación worker**

Cambiar query del processor: buscar visita activa por `origin_context + origin_ref + ticket_id`, ignorando `work_type` en el filtro de duplicado.

- [ ] **Step 5: Política `requestFieldService`**

Si portal ya creó visita en el mismo request de usuario, `requestFieldService` solo encola job idempotente; worker detecta duplicado y sale.

- [ ] **Step 6: Run tests — expect PASS**

---

## Task 2: Mapear `TaskType` → `WfmWorkType` en orquestación de tareas (GAP-FLOW-03)

**Files:**
- Create: `packages/shared/src/operations/task-type-to-wfm-work-type.ts`
- Modify: `apps/portal/src/components/scheduling/visit-request-origin-orchestration.ts`
- Modify: `apps/portal/src/components/operations/OperationsClient.tsx` (pasar `taskType`)

- [ ] **Step 1: Write failing unit test del helper**

```ts
expect(mapTaskTypeToWfmWorkType(TaskType.INSTALLATION)).toBe(WfmWorkType.INSTALLATION);
expect(mapTaskTypeToWfmWorkType(TaskType.BACKOFFICE)).toBeNull();
```

- [ ] **Step 2: Implementar helper según spec §5**

- [ ] **Step 3: `createTaskVisitRequestAndRoute` recibe `taskType` y asigna `workType`**

Si `mapTaskTypeToWfmWorkType` devuelve `null`, no crear visita y devolver error UI claro.

- [ ] **Step 4: Run portal tests**

Run: `pnpm --filter @iwana/portal test -- visit-request-origin-orchestration`

---

## Task 3: Acción «Crear tarea desde ticket» (RF-TSK-11, GAP-FLOW-02)

**Files:**
- Modify: `apps/portal/src/components/assurance/AssuranceClient.tsx` o drawer de detalle ticket
- Modify: `apps/portal/src/components/operations/TaskForm.tsx`
- Modify: `apps/api/src/modules/tasks/services/tasks.service.ts` (validar `ticketId` como referencia opaca, sin leer MOD10)

- [ ] **Step 1: Write failing portal test**

```tsx
it('prefill crear tarea desde ticket con ticketId y origen ASSURANCE', async () => {
  // abrir acción desde ticket → TaskForm con ticketId y originContext ASSURANCE
});
```

- [ ] **Step 2: UI — botón «Crear tarea vinculada» en detalle ticket**

Visible cuando `fieldDecision !== NOT_REQUIRED` o siempre para roles operaciones; no crea visita automáticamente.

- [ ] **Step 3: `TaskForm` acepta `initialTicketId` y `initialOriginContext`**

- [ ] **Step 4: API — `create` persiste `ticketId` y timeline `TASK_CREATED_FROM_TICKET`**

- [ ] **Step 5: Run tests portal + API tasks**

---

## Task 4: Trazabilidad en OT (`taskId`, `ticketId`, `subscriberId`) (GAP-FLOW-04)

**Files:**
- Modify: `packages/database/src/entities/execution-order.entity.ts`
- Create: `packages/database/src/migrations/tenant/056_execution_order_traceability_refs.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`

- [ ] **Step 1: Write failing test `createFromScheduling` persiste refs**

```ts
expect(result.taskId).toBe('task-uuid');
expect(result.ticketId).toBe('ticket-uuid');
expect(result.subscriberId).toBe('sub-uuid');
```

- [ ] **Step 2: Migración reversible — columnas nullable**

```sql
ALTER TABLE execution_orders
  ADD COLUMN task_id varchar(160) NULL,
  ADD COLUMN ticket_id varchar(160) NULL,
  ADD COLUMN subscriber_id varchar(160) NULL;
```

- [ ] **Step 3: Propagar desde `VisitRequest` / `ScheduleEvent` al crear OT**

Sin joins cross-module: copiar refs ya denormalizadas en visita o evento.

- [ ] **Step 4: Run migration + API tests**

Run: `pnpm --filter @iwana/db migration:run`  
Run: `pnpm --filter @iwana/api test -- execution-orders.service.spec`

---

## Task 5: Ledger post-OT hacia `CUSTOMER_SITE` (GAP-FLOW-05)

**Files:**
- Create: `apps/api/src/modules/inventory/services/customer-site-location.resolver.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`
- Test: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`

- [ ] **Step 1: Write failing test — instalación en cliente acredita sitio**

```ts
it('recordExecutionOrderMovement con INSTALLED_AT_CUSTOMER acredita CUSTOMER_SITE del suscriptor', async () => {
  const result = await service.recordExecutionOrderMovement({
    executionOrderId: 'eo-1',
    itemId: 'item-1',
    technicianCustodyId: 'loc-mobile',
    customerSiteLocationId: 'loc-customer',
  ...
  });
  expect(result.lines).toEqual(expect.arrayContaining([
    expect.objectContaining({ locationId: 'loc-mobile', quantity: -1 }),
    expect.objectContaining({ locationId: 'loc-customer', quantity: 1 }),
  ]));
});
```

- [ ] **Step 2: Implementar `CustomerSiteLocationResolver`**

Resuelve o crea ubicación `CUSTOMER_SITE` por `subscriberId` + label; sin PII en código.

- [ ] **Step 3: Extender `ExecutionOrderMovementInput` con `customerSiteLocationId` o `subscriberId`**

`ExecutionOrderInventoryService` pasa ref desde OT al puerto.

- [ ] **Step 4: `mapExecutionOrderDispositionToLocation` — `INSTALLED_AT_CUSTOMER` devuelve sitio cliente**

Ledger: línea negativa custodia + línea positiva cliente para serializados y consumibles según regla §6.2 spec.

- [ ] **Step 5: Run inventory tests**

Run: `pnpm --filter @iwana/api test -- stock-ledger.service.spec`

---

## Task 6: Firma y cierre OT con sincronización de estados (GAP-FLOW-06)

**Files:**
- Modify: `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- Modify: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`
- Modify: `apps/portal/src/components/operations/ExecutionOrderDrawer.tsx` (o close step)
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Write failing API test — close exige firma si hay ítems INSTALLED_AT_CUSTOMER**

```ts
await expect(service.close(id, { result: EXECUTED }, actor))
  .rejects.toThrow(); // sin customerSignatureRef
```

- [ ] **Step 2: Extender DTO close con `customerSignatureRef` opcional condicional**

Zod superRefine: obligatorio si la OT tiene `item_usage` con `INSTALLED_AT_CUSTOMER`.

- [ ] **Step 3: En `close`, si `taskId` presente → `TasksService.transition(RESOLVED)` por puerto interno**

Sin leer tablas WFM. Si `ticketId` presente → emitir evento/contrato hacia Assurance (`execution-order-closed`) para nota de timeline; implementación mínima: puerto stub + test.

- [ ] **Step 4: UI — paso de firma en cierre OT**

Captura referencia de evidencia (`customerSignatureRef`) alineada a entidad `execution_order_evidence`.

- [ ] **Step 5: Run API + portal tests**

---

## Task 7: Reglas UI inventario — bloqueo y mensajes (refuerzo)

**Files:**
- Modify: `apps/portal/src/components/inventory/StockTransferDialog.tsx` (mensaje orientado a OT)
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`
- Test: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Test — destino CUSTOMER_SITE bloqueado con copy que remite a OT**

- [ ] **Step 2: Ajustar copy sentence case español**

Ejemplo: «La carga en sitio del cliente se registra al cerrar la orden de trabajo con firma.»

- [ ] **Step 3: Run portal tests inventario**

---

## Task 8: E2E flujo feliz ticket → OT → inventario (GAP-FLOW-07)

**Files:**
- Create: `e2e/tests/portal-field-flow-ticket-ot-inventory.spec.ts`
- Modify: `e2e/tests/portal-inventory-scm.spec.ts` (helpers compartidos si aplica)

- [ ] **Step 1: Escenario A — Assurance**

Ticket `FIELD_SERVICE_REQUIRED` → visita → agendar → OT → registrar ítem `INSTALLED_AT_CUSTOMER` → ver saldo en bodega cliente (mock stateful API).

- [ ] **Step 2: Escenario B — CRM instalación**

Expediente → visita instalación → OT → movimiento inventario.

- [ ] **Step 3: Run E2E portal**

Run: `pnpm test:e2e:portal -- portal-field-flow-ticket-ot-inventory`

---

## Task 9: Documentación viva e informe

**Files:**
- Create: `docs/informes/INFORME-MOD11-FLOW-CABLEADO-v1.0.md`
- Update: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`

- [ ] **Step 1: Informe MOD11 con matriz §3 del spec y estado por GAP**

- [ ] **Step 2: Informe MOD12 — cerrar decisión RF-INV-12/13 post-OT**

- [ ] **Step 3: Referenciar spec y plan en informes**

---

## Orden de ejecución recomendado

| Fase | Tasks | Dependencia |
| --- | --- | --- |
| 1 — Estabilizar intake campo | Task 1, Task 2 | Ninguna |
| 2 — Trazabilidad | Task 3, Task 4 | Fase 1 |
| 3 — Inventario cliente | Task 5 | Task 4 (refs en OT) |
| 4 — Cierre operativo | Task 6, Task 7 | Task 5 |
| 5 — Evidencia | Task 8, Task 9 | Fases 1–4 |

---

## Gates antes de merge

- [ ] `pnpm lint` y `pnpm typecheck` sin errores
- [ ] Tests API inventario + execution orders ≥ casos nuevos en verde
- [ ] E2E portal escenario Assurance en verde
- [ ] Migración `056` reversible
- [ ] Sin FK cross-module nuevas
- [ ] Sin PII en logs ni fixtures
- [ ] OpenAPI actualizado si cambian DTOs de close / movement
- [ ] Informe vivo actualizado

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Regresión en bandeja de visitas por cambio `workType` | Tests portal + worker deduplicación |
| OT cerrada sin movimiento cliente | Gate firma + test ledger doble línea |
| Doble transición tarea/ticket | Idempotencia en `close` por `executionOrderId` |
| Tenant sin `CUSTOMER_SITE` para suscriptor | Resolver crea ubicación lógica con código autogenerado |

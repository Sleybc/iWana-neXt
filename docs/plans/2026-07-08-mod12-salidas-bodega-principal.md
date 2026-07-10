# MOD12 Salidas de Bodega Principal — Implementation Plan

**Version:** 1.0  
**Fecha:** 2026-07-08  
**Estado:** Aprobado  
**Fecha de aprobacion:** 2026-07-08
**Aprobado por:** CTO
> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear un apartado operativo de `Salidas` para despachos desde bodega principal hacia tecnico, cuadrilla, oficina, nodo, venta o consumo interno, preservando el ledger inmutable de MOD12 y ADR-048.

**Architecture:** Introducir `StockIssue` como documento operativo dentro de MOD12. `StockIssue` modela intencion, destino, evidencia y estado; `StockMovement` sigue siendo el efecto contable/fisico. No crear bounded context nuevo. No permitir salidas manuales a `CUSTOMER_SITE`; cliente sigue via OT + firma.

**Tech Stack:** NestJS, Next.js App Router, TypeScript estricto, Zod, TypeORM, PostgreSQL multi-tenant por schema, Jest, Supertest, Playwright, pnpm.

---

## Source documents

- `docs/specs/2026-07-08-mod12-salidas-bodega-principal-design.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`
- `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- `docs/specs/2026-07-07-mod10-mod11-mod09-mod12-flujo-operativo-cableado-design.md`

## File map

### Shared / database

- Modify: `packages/shared/src/enums/inventory/stock-location-type.enum.ts`
- Create: `packages/shared/src/enums/inventory/stock-issue-type.enum.ts`
- Create: `packages/shared/src/enums/inventory/stock-issue-status.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`
- Create: `packages/database/src/entities/stock-issue.entity.ts`
- Create: `packages/database/src/entities/stock-issue-line.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/057_create_stock_issues.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

### API

- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Create: `apps/api/src/modules/inventory/services/stock-issue.service.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts` only if dispatch needs helper extraction
- Tests: `apps/api/src/modules/inventory/tests/stock-issue.service.spec.ts`
- Tests: `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`
- Tests: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`

### Portal

- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/inventory/StockIssuesWorkspace.tsx`
- Create: `apps/portal/src/components/inventory/StockIssueFormDrawer.tsx`
- Create: `apps/portal/src/components/inventory/StockIssueDetailDrawer.tsx`
- Tests: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`
- Tests: `apps/portal/src/components/inventory/StockIssuesWorkspace.spec.tsx`

### E2E / docs

- Modify: `e2e/tests/portal-inventory-scm.spec.ts`
- Update: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`

---

## Task 1: Crear enums, entidades y migracion `StockIssue`

**Objetivo:** Persistir el documento operativo de salida sin tocar todavia la UX.

**Files:**
- Create shared enums.
- Create `StockIssue` and `StockIssueLine` entities.
- Create migration `057_create_stock_issues.ts`.

- [x] **Step 1: Write failing DB/entity tests or compile expectation**

Add a focused test or type-level import coverage that expects exported enums and entities to exist.

- [x] **Step 2: Add shared enums**

```ts
export enum StockIssueType {
  TECHNICIAN_CUSTODY = 'TECHNICIAN_CUSTODY',
  CREW_CUSTODY = 'CREW_CUSTODY',
  OFFICE_REPLENISHMENT = 'OFFICE_REPLENISHMENT',
  NODE_REPLENISHMENT = 'NODE_REPLENISHMENT',
  SALE_DISPATCH = 'SALE_DISPATCH',
  INTERNAL_CONSUMPTION = 'INTERNAL_CONSUMPTION',
  WAREHOUSE_TO_WAREHOUSE = 'WAREHOUSE_TO_WAREHOUSE',
}
```

```ts
export enum StockIssueStatus {
  DRAFT = 'DRAFT',
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  PICKING = 'PICKING',
  READY_TO_DISPATCH = 'READY_TO_DISPATCH',
  DISPATCHED = 'DISPATCHED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}
```

- [x] **Step 3: Extend `StockLocationType`**

Add:

```ts
OFFICE_STOCK = 'OFFICE_STOCK',
NODE_STOCK = 'NODE_STOCK',
```

Update labels and location code prefixes.

- [x] **Step 4: Create entities** *(desviación registrada: sin `issueNumber` ni campos de actores avanzados; ver informe vivo)*

`stock_issues` must include issue metadata, source/destination refs, actor refs, handoff evidence and `stockMovementId`.

`stock_issue_lines` must include item, requested quantity, dispatched quantity, lot/serial references and condition.

- [x] **Step 5: Create reversible migration**

Migration must:

- create enum types;
- add `OFFICE_STOCK` and `NODE_STOCK` to existing `stock_location_type` safely;
- create tables and indexes;
- avoid FKs to other modules;
- include FK only within MOD12 tables where appropriate.

- [x] **Step 6: Run DB/shared verification**

Run:

```powershell
corepack pnpm --filter @iwana/shared build
corepack pnpm --filter @iwana/db build
```

---

## Task 2: API DTOs y `StockIssueService`

**Objetivo:** Crear/listar/consultar/cancelar salidas sin generar ledger todavia.

**Files:**
- Modify `dto/index.ts`.
- Create `stock-issue.service.ts`.
- Modify `inventory.module.ts`.
- Modify `inventory.controller.ts`.
- Tests API.

- [x] **Step 1: Write failing service tests**

Cover:

```text
create issue TECHNICIAN_CUSTODY with one line
reject issue without lines
reject destination type incompatible with issueType
list issues by status/type
cancel non-dispatched issue
```

- [x] **Step 2: Add Zod schemas**

Create:

```ts
CreateStockIssueSchema
UpdateStockIssueSchema
DispatchStockIssueSchema
CancelStockIssueSchema
ListStockIssuesQuerySchema
```

- [x] **Step 3: Implement create/list/get/cancel**

Rules:

- `sourceLocationId` required and must resolve to `MAIN_WAREHOUSE`.
- At least one line required.
- `SALE_DISPATCH` requires `originRefId` or commercial reference.
- `INTERNAL_CONSUMPTION` requires cost center / reason in destination or origin ref.
- `TECHNICIAN_CUSTODY` and `CREW_CUSTODY` require destination location.
- `destinationLocationId` must be different from `sourceLocationId`.

- [x] **Step 4: Add controller endpoints**

```text
GET    /inventory/issues
POST   /inventory/issues
GET    /inventory/issues/:id
PATCH  /inventory/issues/:id
POST   /inventory/issues/:id/cancel
```

- [x] **Step 5: Run API tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- stock-issue.service.spec.ts inventory.controller.http.spec.ts --runInBand
```

---

## Task 3: Implementar dispatch idempotente hacia ledger

**Objetivo:** Al despachar una salida, generar el movimiento correcto y guardar `stockMovementId`.

**Files:**
- Modify `stock-issue.service.ts`.
- Possibly modify `stock-ledger.service.ts` for narrow helper support.
- Tests service + ledger.

- [x] **Step 1: Write failing dispatch tests** *(incluye rechazo `CUSTOMER_SITE` y segundo dispatch idempotente, agregados 2026-07-09)*

Cover:

```text
TECHNICIAN_CUSTODY dispatch creates TRANSFER to MOBILE_TECHNICIAN
OFFICE_REPLENISHMENT dispatch creates TRANSFER to OFFICE_STOCK
NODE_REPLENISHMENT dispatch creates TRANSFER to NODE_STOCK
SALE_DISPATCH dispatch creates SALE
INTERNAL_CONSUMPTION dispatch creates INTERNAL_CONSUMPTION
CUSTOMER_SITE destination is rejected
second dispatch is idempotent / rejected clearly
```

- [x] **Step 2: Validate destinations by type**

Destination rules:

| Type | Required destination |
| --- | --- |
| `TECHNICIAN_CUSTODY` | `MOBILE_TECHNICIAN` |
| `CREW_CUSTODY` | `MOBILE_CREW` |
| `OFFICE_REPLENISHMENT` | `OFFICE_STOCK` |
| `NODE_REPLENISHMENT` | `NODE_STOCK` |
| `WAREHOUSE_TO_WAREHOUSE` | `OFFICE_STOCK`, `NODE_STOCK`, `QUARANTINE`, `REPAIR` |
| `SALE_DISPATCH` | no inventory destination |
| `INTERNAL_CONSUMPTION` | no inventory destination |

- [x] **Step 3: Implement `dispatch` transaction**

Inside one tenant-aware transaction:

1. lock/read issue;
2. reject terminal states;
3. validate source balance for all lines;
4. call ledger with `idempotencyKey = stock-issue:${issue.id}` or per-line deterministic keys if current ledger requires one item per call;
5. set `status = DISPATCHED`, `stockMovementId`, `dispatchedByUserId`, `closedAt`.

- [x] **Step 4: Preserve ledger boundaries**

Do not move ledger ownership into `StockIssueService`. It should orchestrate existing MOD12 ledger methods.

- [x] **Step 5: Run tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- stock-issue.service.spec.ts stock-ledger.service.spec.ts --runInBand
```

---

## Task 4: Portal `Salidas` workspace

**Objetivo:** Separar salidas de la vista de auditoria de movimientos.

**Files:**
- Modify `InventoryClient.tsx`.
- Create `StockIssuesWorkspace.tsx`.
- Create `StockIssueFormDrawer.tsx`.
- Create `StockIssueDetailDrawer.tsx`.
- Modify `api-client.ts`.
- Modify labels.
- Tests portal.

- [x] **Step 1: Write failing portal tests**

Cover:

```text
InventoryClient renders Salidas tab
Salidas lists issue rows
Crear salida opens drawer
TECHNICIAN_CUSTODY filters destinations to mobile technician locations
SALE_DISPATCH hides destination location and requires commercial reference
CUSTOMER_SITE does not appear as destination
```

- [x] **Step 2: Add `Salidas` tab**

Add tab between `Bodegas` and `Activos`. Keep `Movimientos` as audit/history.

- [x] **Step 3: Implement workspace table** *(la columna "Número" muestra UUID truncado mientras no exista `issueNumber`; ver desviación en informe vivo)*

Columns:

```text
Numero, tipo, estado, origen, destino, lineas, referencia, fecha, accion
```

- [x] **Step 4: Implement create drawer** *(MVP con una sola línea por salida; multi-línea y serial/lote quedan diferidos, ver informe vivo)*

MVP steps in one drawer:

1. tipo + origen/destino;
2. lineas;
3. evidencia + confirmar.

Use existing portal design language. Keep density operational.

- [x] **Step 5: Implement dispatch action**

For `REQUESTED` or `APPROVED`, allow `Despachar` with confirmation and handoff evidence.

- [x] **Step 6: Run portal tests**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient StockIssuesWorkspace --runInBand
```

---

## Task 5: E2E y documentacion viva

**Objetivo:** Validar flujo feliz y dejar trazabilidad documental.

**Files:**
- Modify `e2e/tests/portal-inventory-scm.spec.ts`.
- Update `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`.

- [x] **Step 1: Add E2E scenarios** *(2026-07-10: agregados `crea salida por venta y despacha` y `no ofrece CUSTOMER_SITE como destino de salida manual`; los tres escenarios del plan están cubiertos)*

Scenarios:

```text
crear salida a tecnico desde bodega principal -> despachar -> ver movimiento TRANSFER
crear salida por venta -> despachar -> ver movimiento SALE
bloquear CUSTOMER_SITE como destino manual
```

- [x] **Step 2: Run E2E** *(2026-07-10: 17/17 ✅ — `portal-inventory-scm.spec.ts` pasa completo contra instancia real)*

Run:

```powershell
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

- [x] **Step 3: Update live report** *(actualizado 2026-07-09 con evidencia de gates y desviaciones)*

Add section `Salidas de bodega principal` with:

- spec and plan links;
- final implemented evidence;
- test commands;
- any deferred scope.

- [x] **Step 4: Run final gates** *(2026-07-10: lint ✅, typecheck ✅, API 1413/1413 ✅, portal 489/489 ✅, E2E 17/17 ✅)*

Run:

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm --filter @iwana/api test -- inventory --runInBand
corepack pnpm --filter @iwana/portal test -- InventoryClient StockIssuesWorkspace --runInBand
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

---

## Gates antes de merge

- [x] Sin FK cross-module nuevas. *(migración 057 solo crea FKs internas MOD12)*
- [x] `CUSTOMER_SITE` sigue bloqueado en salidas manuales. *(servicio + DTO + UI + test unitario dedicado)*
- [x] `StockIssue.dispatch` es idempotente. *(short-circuit por `stockMovementId` + `idempotencyKey`; test unitario dedicado)*
- [x] Ledger conserva movimientos inmutables.
- [x] OpenAPI actualizado para endpoints nuevos. *(6 endpoints `issues` con `@ApiOperation` y `@Roles`)*
- [x] `OFFICE_STOCK` y `NODE_STOCK` documentados y etiquetados en portal. *(`inventory-labels.ts`)*
- [x] Tests API y portal en verde. *(2026-07-10: API 1413/1413; portal 489/489 ✅ — `SchedulingClient.spec.tsx` "mueve un evento a pendientes" corregido con `findByRole` asíncrono)*
- [x] E2E al menos con tecnico y venta en verde. *(2026-07-10: 17/17 ✅ — técnico ✅, venta ✅, bloqueo CUSTOMER_SITE ✅, todos los escenarios pasan contra instancia real)*
- [x] Informe MOD12 actualizado. *(2026-07-09)*

---

## Riesgos y mitigaciones

| Riesgo | Mitigacion |
| --- | --- |
| Duplicar logica de ledger dentro de salidas | `StockIssueService` solo orquesta `StockLedgerService` |
| Crear nodos/oficinas como bodegas innecesarias | UI debe mostrar `OFFICE_STOCK` / `NODE_STOCK` solo si existen ubicaciones activas |
| Venta sin referencia comercial | DTO debe exigir `originRefId` / `commercialRefId` para `SALE_DISPATCH` |
| Despacho doble por reintento | `stockMovementId` + `idempotencyKey = stock-issue:${issueId}` |
| Confundir salidas con movimientos | Portal separa `Salidas` como proceso y `Movimientos` como auditoria |
| Violacion ADR-048 | No leer tablas externas; usar refs opacas y puertos futuros |

---

## Notas para fullstack

Implementar en orden. No empezar por UI si no existe el contrato de API y migracion. La UX puede consumir mocks solo despues de que los DTOs esten definidos, para evitar que el formulario invente campos fuera del modelo.

El primer slice mergeable deberia ser:

1. enums + migracion + entidades;
2. API create/list/get/cancel;
3. dispatch para `TECHNICIAN_CUSTODY` y `SALE_DISPATCH`;
4. portal `Salidas` con esos dos tipos;
5. ampliar oficina/nodo en el siguiente commit si el tiempo aprieta.



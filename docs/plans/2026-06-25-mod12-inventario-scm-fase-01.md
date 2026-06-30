# MOD12 Inventario / SCM Fase 01 Implementation Plan

**Estado:** Aprobado  
**Aprobado por:** CTO

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MOD12 Inventario / SCM end-to-end for purchasing, receiving, inventory ledger, stock locations, serialized assets, exits, comodato integration, returns and write-offs.

**Architecture:** Implement a new NestJS modulith bounded context isolated from MOD11, MOD09, CRM, Parties, Commercial and Billing. MOD12 owns stock and serials; MOD11 interacts only through a typed inventory movement port and stores `stockMovementId`.

**Tech Stack:** NestJS, TypeScript strict, TypeORM migrations, PostgreSQL tenant schemas, Zod, OpenAPI, Next.js App Router, Jest, Supertest, Playwright, pnpm.

---

## File Map

- Create `packages/shared/src/enums/inventory/*` for stable MOD12 enums.
- Create `packages/database/src/entities/*inventory*`, `*stock*`, `*purchase*`, `*goods*`, `*asset*` entities.
- Create `packages/database/src/migrations/tenant/047_create_inventory_scm_module.ts`.
- Modify `packages/database/src/entities/index.ts` to export MOD12 entities.
- Modify `packages/database/src/migrations/tenant/runner.ts` to include migration 047.
- Create `apps/api/src/modules/inventory/**` for controllers, DTOs, services, ports and tests.
- Modify `apps/api/src/app.module.ts` to register `InventoryModule`.
- Create `apps/portal/src/app/dashboard/inventory/page.tsx`.
- Create `apps/portal/src/components/inventory/**`.
- Modify `apps/portal/src/lib/api-client.ts` and portal navigation only as needed.
- Create `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md` during implementation.

## Task 1: Shared Enums

**Files:**
- Create: `packages/shared/src/enums/inventory/inventory-item-category.enum.ts`
- Create: `packages/shared/src/enums/inventory/inventory-tracking-mode.enum.ts`
- Create: `packages/shared/src/enums/inventory/stock-location-type.enum.ts`
- Create: `packages/shared/src/enums/inventory/stock-movement-origin.enum.ts`
- Create: `packages/shared/src/enums/inventory/serialized-asset-status.enum.ts`
- Create: `packages/shared/src/enums/inventory/purchase-status.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`

- [ ] **Step 1: Add enum tests if local pattern exists**

Run:

```powershell
rg -n "InventoryDisposition|SerializedAssetStatus|PurchaseOrderStatus" packages/shared apps packages
```

Expected: existing `InventoryDisposition` is exported and must remain compatible.

- [ ] **Step 2: Add enums**

Use string enums with stable uppercase values:

```ts
export enum InventoryTrackingMode {
  CONSUMABLE = 'CONSUMABLE',
  SERIALIZED = 'SERIALIZED',
  FIXED_ASSET = 'FIXED_ASSET',
}
```

Repeat for categories, location types, movement origins, asset statuses and purchase statuses defined in the PRD/HLD.

- [ ] **Step 3: Export enums**

Update `packages/shared/src/enums/inventory/index.ts` to export every new enum while keeping `inventory-disposition.enum.ts`.

- [ ] **Step 4: Verify types**

Run:

```powershell
corepack pnpm typecheck
```

Expected: no enum export errors. If unrelated existing errors appear, document them in the phase report.

## Task 2: Database Entities And Migration

**Files:**
- Create: `packages/database/src/entities/inventory-item.entity.ts`
- Create: `packages/database/src/entities/stock-location.entity.ts`
- Create: `packages/database/src/entities/stock-balance.entity.ts`
- Create: `packages/database/src/entities/stock-lot.entity.ts`
- Create: `packages/database/src/entities/serialized-asset.entity.ts`
- Create: `packages/database/src/entities/stock-movement.entity.ts`
- Create: `packages/database/src/entities/stock-movement-line.entity.ts`
- Create: purchasing and lifecycle entities listed in the HLD
- Create: `packages/database/src/migrations/tenant/047_create_inventory_scm_module.ts`
- Modify: `packages/database/src/entities/index.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] **Step 1: Write migration tests if migration test pattern is available**

Run:

```powershell
rg -n "create_.*module|runner|migration" packages/database apps/api/src/modules -g "*.spec.ts"
```

Expected: identify local migration test pattern. Follow it for migration 047 if present.

- [ ] **Step 2: Create entities**

Create TypeORM entities with `tenantId`, UUID PKs, timestamps, indexes from HLD section 5 and FKs only inside MOD12-owned tables.

- [ ] **Step 3: Create migration 047**

Migration must create:

```text
inventory_items
stock_locations
stock_lots
stock_balances
serialized_assets
stock_movements
stock_movement_lines
purchase_requests
supplier_quotes
purchase_orders
purchase_order_lines
goods_receipts
goods_receipt_lines
asset_lifecycle_events
asset_loan_assignments
inventory_write_offs
```

Down migration must drop tables in reverse dependency order and then drop MOD12 enums/types.

- [ ] **Step 4: Register migration and entities**

Update entity exports and tenant migration runner.

- [ ] **Step 5: Verify migration compiles**

Run:

```powershell
corepack pnpm --filter @iwana/db typecheck
```

Expected: database package compiles.

## Task 3: Backend Module Skeleton

**Files:**
- Create: `apps/api/src/modules/inventory/inventory.module.ts`
- Create: `apps/api/src/modules/inventory/inventory.controller.ts`
- Create: `apps/api/src/modules/inventory/purchasing.controller.ts`
- Create: `apps/api/src/modules/inventory/dto/*.ts`
- Create: `apps/api/src/modules/inventory/services/*.ts`
- Create: `apps/api/src/modules/inventory/ports/*.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create failing module smoke test**

Create `apps/api/src/modules/inventory/tests/inventory.module.spec.ts` asserting the module compiles with mocked dependencies.

- [ ] **Step 2: Implement module providers**

Register services:

```ts
InventoryItemService
StockLocationService
StockLedgerService
StockBalanceService
SerializedAssetService
PurchasingService
GoodsReceiptService
AssetLifecycleService
InventoryDashboardService
```

- [ ] **Step 3: Register module in app**

Add `InventoryModule` to `apps/api/src/app.module.ts`.

- [ ] **Step 4: Verify module test**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory.module.spec.ts
```

Expected: module compiles.

## Task 4: Purchasing And Receiving

**Files:**
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts`
- Modify: `apps/api/src/modules/inventory/services/purchasing.service.ts`
- Modify: `apps/api/src/modules/inventory/services/goods-receipt.service.ts`
- Test: `apps/api/src/modules/inventory/tests/purchasing.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Cover:

```text
create purchase request
add supplier quote
approve request
create purchase order
receive order and create stock movement
reject receipt with duplicated serial
```

- [ ] **Step 2: Implement Zod DTOs**

DTOs must validate quantities as positive numbers, strings trimmed, provider references as logical `partyRefId`, and no free-form PII fields.

- [ ] **Step 3: Implement services**

Receiving must call `StockLedgerService.recordMovement` with origin `PURCHASE_RECEIPT`.

- [ ] **Step 4: Run purchasing tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- purchasing.service.spec.ts
```

Expected: purchasing flow passes.

## Task 5: Stock Ledger, Balances And Serialized Assets

**Files:**
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-balance.service.ts`
- Modify: `apps/api/src/modules/inventory/services/serialized-asset.service.ts`
- Test: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`
- Test: `apps/api/src/modules/inventory/tests/serialized-asset.service.spec.ts`

- [ ] **Step 1: Write failing ledger tests**

Cover no negative balance, idempotency key reuse, serial uniqueness, append-only behavior and reversal movement.

- [ ] **Step 2: Implement transaction boundary**

Use TypeORM transaction manager for movement header, lines, balance updates and serial status updates.

- [ ] **Step 3: Implement state transition guard**

Allowed transitions must match HLD section 6.

- [ ] **Step 4: Run ledger tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- stock-ledger.service.spec.ts serialized-asset.service.spec.ts
```

Expected: ledger invariants pass.

## Task 6: Operational Exits And MOD11 Port

**Files:**
- Create: `apps/api/src/modules/inventory/ports/inventory-movement.port.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/tasks/services/execution-order-inventory.service.ts`
- Test: `apps/api/src/modules/inventory/tests/inventory-movement.port.spec.ts`
- Test: `apps/api/src/modules/tasks/tests/execution-orders.service.spec.ts`

- [ ] **Step 1: Write contract test**

Test that MOD11 calls a port with execution order id, technician custody id, item/serial, quantity, action and final disposition, then receives `stockMovementId`.

- [ ] **Step 2: Implement MOD12 port**

The port must expose:

```ts
consumeFromExecutionOrder(input, actor): Promise<{ stockMovementId: string }>
```

- [ ] **Step 3: Replace MOD11 stub behavior**

Update `ExecutionOrderInventoryService` to delegate to the MOD12 port when available and preserve existing stub only as explicit fallback if the module is not wired in the current test.

- [ ] **Step 4: Run contract tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory-movement.port.spec.ts execution-orders.service.spec.ts
```

Expected: MOD11 records returned `stockMovementId`.

## Task 7: API Controllers And OpenAPI

**Files:**
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts`
- Test: `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`

- [ ] **Step 1: Write controller tests**

Cover auth, RBAC, validation errors, list endpoints and core POST endpoints.

- [ ] **Step 2: Implement controllers**

Use REST paths from PRD section 7. Add Swagger decorators for DTOs and responses.

- [ ] **Step 3: Run controller tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory.controller.http.spec.ts
```

Expected: endpoints validate and authorize correctly.

## Task 8: Portal UI

**Files:**
- Create: `apps/portal/src/app/dashboard/inventory/page.tsx`
- Create: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Create: inventory components listed in HLD section 3
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: portal sidebar/navigation if local pattern requires it

- [ ] **Step 1: Write UI tests**

Create tests for dashboard labels, purchase desk, goods receipt, transfer dialog and asset detail drawer.

- [ ] **Step 2: Implement API client methods**

Add typed methods for `/inventory/*` and `/purchasing/*`.

- [ ] **Step 3: Implement page and components**

Use dense operational UI, Spanish labels, no enum raw rendering, and no marketing/landing layout.

- [ ] **Step 4: Run portal tests**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient
```

Expected: MOD12 UI tests pass.

## Task 9: E2E And Documentation

**Files:**
- Create: `e2e/tests/portal-inventory-scm.spec.ts`
- Create: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`
- Update: `docs/quality/CHECKLIST-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`

- [ ] **Step 1: Write E2E smoke**

Cover purchase request, purchase order, goods receipt, stock transfer and asset detail. Do not include OT installation here because that UI belongs to MOD11 / Operaciones.

- [ ] **Step 2: Run focused E2E**

Run:

```powershell
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Expected: core UI journey passes or blocked dependency is documented.

- [ ] **Step 3: Update report and checklist**

Record commands run, results, known gaps and stop/go decision.

- [ ] **Step 4: Document cross-module OT coverage**

Record that comodato via OT is covered by `apps/api/src/modules/inventory/tests/inventory-movement.port.spec.ts` and related MOD11 contract/integration tests, and leave future E2E ownership under MOD11 / Operaciones.

## Verification Commands

Run before handoff:

```powershell
corepack pnpm --filter @iwana/api test -- inventory
corepack pnpm --filter @iwana/portal test -- Inventory
corepack pnpm typecheck
corepack pnpm lint
```

Expected: all pass or any unrelated pre-existing failures are documented with exact command output and owner.

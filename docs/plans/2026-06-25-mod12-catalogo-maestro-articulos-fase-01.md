# MOD12 Catalogo Maestro de Articulos Fase 01 Implementation Plan

**Estado:** Aprobado
**Aprobado por:** CTO

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `inventory_items` en un Catalogo Maestro de Articulos operativo y usarlo como origen controlado del selector de productos de Compras en MOD12.

**Architecture:** La implementacion se mantiene dentro de `apps/api/src/modules/inventory`, `apps/portal/src/components/inventory`, `packages/database/src/entities` y `packages/shared/src/enums/inventory`. No se crea nuevo bounded context ni se mueve ownership a MOD06.

**Tech Stack:** NestJS, TypeScript strict, TypeORM, PostgreSQL tenant schema, Zod, OpenAPI, Next.js App Router, Jest, Playwright, pnpm.

---

## File Map

- Create `packages/shared/src/enums/inventory/inventory-item-kind.enum.ts`.
- Modify `packages/shared/src/enums/inventory/index.ts`.
- Modify `packages/database/src/entities/inventory-item.entity.ts`.
- Create `packages/database/src/migrations/tenant/051_expand_inventory_item_master_catalog.ts`.
- Modify `apps/api/src/modules/inventory/dto/index.ts`.
- Modify `apps/api/src/modules/inventory/inventory.controller.ts`.
- Modify `apps/api/src/modules/inventory/services/inventory-item.service.ts`.
- Update inventory tests in `apps/api/src/modules/inventory/tests/*`.
- Modify `apps/portal/src/lib/api-client.ts`.
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx`.
- Modify `apps/portal/src/components/inventory/InventoryItemsTable.tsx`.
- Create `apps/portal/src/components/inventory/InventoryCatalogSummary.tsx`.
- Create `apps/portal/src/components/inventory/InventoryCatalogFilters.tsx`.
- Create `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx`.
- Modify `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`.
- Update `apps/portal/src/components/inventory/*.spec.tsx`.
- Update `e2e/tests/portal-inventory-scm.spec.ts`.

## Task 1: Shared contracts and persistence

**Files:**
- Create: `packages/shared/src/enums/inventory/inventory-item-kind.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`
- Modify: `packages/database/src/entities/inventory-item.entity.ts`
- Create: `packages/database/src/migrations/tenant/051_expand_inventory_item_master_catalog.ts`

- [ ] **Step 1: Inspect current inventory item entity and migration numbering**

Run:

```powershell
rg -n "inventory_items|InventoryItem" packages/database/src/entities apps/api/src/modules/inventory
Get-ChildItem packages/database/src/migrations/tenant | Sort-Object Name | Select-Object -ExpandProperty Name
```

Expected: confirm current entity shape and reserve migration `051`.

- [ ] **Step 2: Add the item kind enum and exports**

Run:

```powershell
corepack pnpm typecheck
```

Expected: new enum compiles and exports cleanly.

- [ ] **Step 3: Refine `inventory_items`**

Implement at least:

- `description`
- `brand`
- `model`
- `itemKind`
- `purchasable`
- `inventoryControlled`
- `assetControlled`
- `preferredSupplierRefId`
- `supplierSku`
- `purchaseUnitOfMeasure`
- `purchaseToBaseUomFactor`
- `standardCost`
- `lastPurchaseCost`
- `reorderPoint`
- `targetStock`
- `minimumOrderQty`
- `orderMultiple`
- `leadTimeDays`
- `commercialReferenceId`

- [ ] **Step 4: Write and review migration 051**

Migration must:

- add the new columns with safe defaults;
- backfill conservative values;
- keep rollback reversible.

- [ ] **Step 5: Verify DB package**

Run:

```powershell
corepack pnpm --filter @iwana/db typecheck
```

Expected: DB entities and migration compile.

## Task 2: Backend DTOs and service layer

**Files:**
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Modify: `apps/api/src/modules/inventory/services/inventory-item.service.ts`
- Update: `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`
- Create or update: `apps/api/src/modules/inventory/tests/inventory-item.service.spec.ts`

- [ ] **Step 1: Write failing tests for catalog filtering and create/update**

Focus on:

- list with `search`;
- list with `purchasable = true`;
- create item with purchase fields;
- reject invalid UoM conversion;
- update item state and flags.

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory.controller.http.spec.ts inventory-item.service.spec.ts
```

Expected: FAIL on missing fields, filters or routes.

- [ ] **Step 2: Expand DTO schemas**

Add DTO coverage for:

- `search`
- `itemKind`
- `purchasable`
- purchase attributes
- inventory attributes
- lifecycle attributes

Keep Zod as single validation truth.

- [ ] **Step 3: Refine `InventoryItemService`**

Implement:

- search by SKU and name;
- active/purchasable filtering;
- get by id;
- create and update with the new fields;
- lightweight `catalog/options` payload for purchase selectors.

- [ ] **Step 4: Refine inventory endpoints**

Add or refine:

- `GET /inventory/items`
- `GET /inventory/items/:id`
- `POST /inventory/items`
- `PATCH /inventory/items/:id`
- `GET /inventory/items/catalog/options`

- [ ] **Step 5: Verify backend compile**

Run:

```powershell
corepack pnpm --filter @iwana/api typecheck
```

Expected: controller, DTOs and service compile with strict types.

## Task 3: Portal catalog UI

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryItemsTable.tsx`
- Create: `apps/portal/src/components/inventory/InventoryCatalogSummary.tsx`
- Create: `apps/portal/src/components/inventory/InventoryCatalogFilters.tsx`
- Create: `apps/portal/src/components/inventory/InventoryCatalogDrawer.tsx`

- [ ] **Step 1: Write failing UI tests for catalog experience**

Cover:

- KPI summary render;
- search and filters;
- open drawer and inspect fields;
- create or edit article flow.

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx
```

Expected: FAIL because current UI has no dedicated catalog experience.

- [ ] **Step 2: Extend typed client contracts**

Add list filters, detail, create, update and `catalog/options` before touching components.

- [ ] **Step 3: Build the catalog shell**

Implement:

- KPI strip,
- filter bar,
- dense table,
- drawer with General, Compras, Inventario, Activos y Relacion comercial.

- [ ] **Step 4: Keep visual language operational**

Do not expose technical copy such as `partyRefId` or internal enum names in visible UI.

- [ ] **Step 5: Verify portal test slice**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx
corepack pnpm --filter @iwana/portal typecheck
```

Expected: catalog UI compiles and tests pass for the inventory slice.

## Task 4: Purchase selector migration

**Files:**
- Modify: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Update: relevant inventory labels or helper files
- Update: purchasing-related specs

- [ ] **Step 1: Write failing tests for the new selector behavior**

Cover:

- list only active and purchasable items;
- search by SKU and name;
- prefill unit of measure;
- optional preferred supplier suggestion.

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx InventoryClient.spec.tsx
```

Expected: FAIL on missing filtered options or helper behavior.

- [ ] **Step 2: Replace the flat item options**

The composer must stop using the raw all-items list and instead consume catalog options prepared for Compras.

- [ ] **Step 3: Preserve existing request creation contract**

The payload for request creation must stay compatible with `PurchasingService` while the selector becomes richer.

- [ ] **Step 4: Verify purchase UI slice**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- PurchaseRequestComposer.spec.tsx PurchaseWorkspaceSummary.spec.tsx
```

Expected: composer tests pass.

## Task 5: E2E and final verification

**Files:**
- Modify: `e2e/tests/portal-inventory-scm.spec.ts`

- [ ] **Step 1: Add focused E2E flows**

Cover:

- create an active purchasable article;
- find it in Catalogo;
- create a purchase request using that article from the selector.

- [ ] **Step 2: Run focused E2E**

Run:

```powershell
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Expected: catalog and purchase selection flows pass or blocking dependencies are documented.

- [ ] **Step 3: Final quality slice**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory
corepack pnpm --filter @iwana/api typecheck
corepack pnpm --filter @iwana/portal typecheck
```

Expected: no missing contract in catalog filtering or purchase selector integration.

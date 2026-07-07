# MOD12 Bodegas Gap Closure Implementation Plan

**Version:** 1.0  
**Fecha:** 2026-07-06  
**Estado:** Borrador  

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los gaps MVP del slice de bodegas de MOD12 para que rutas, ubicaciones, transferencias, custodia y dashboard queden alineados con PRD, HLD y ADR-048.

**Architecture:** Mantener MOD12 dentro del modulith actual. La correccion se concentra en cuatro capas: navegacion/routing del portal, gestion de ubicaciones, reglas de ledger/custodia y consultas segmentadas del dashboard. No se cambian boundaries ni stack; se endurecen contratos y UX sobre las piezas ya existentes.

**Tech Stack:** Next.js App Router, React, TypeScript estricto, NestJS, Zod, TypeORM, PostgreSQL multi-tenant por schema, Jest, Supertest, Playwright, pnpm.

---

## File Map

- Modify `apps/portal/src/app/dashboard/inventory/page.tsx` to admitir deep-link del slice de bodegas.
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx` to sincronizar tab, filtros y nuevas acciones de ubicaciones.
- Create `apps/portal/src/components/inventory/StockLocationFormDialog.tsx` for crear/editar bodegas.
- Modify `apps/portal/src/components/inventory/StockLocationsMatrix.tsx` to agregar filtros, columnas de responsable/capacidad y acciones por fila.
- Modify `apps/portal/src/components/inventory/StockTransferDialog.tsx` to endurecer validaciones, evidencia y disponibilidad visible.
- Modify `apps/portal/src/components/inventory/InventoryClient.spec.tsx` and `e2e/tests/portal-inventory-scm.spec.ts`.
- Modify `apps/portal/src/lib/api-client.ts` to soportar update/archive location y dashboard segmentado.
- Modify `apps/api/src/modules/inventory/dto/index.ts` to endurecer DTOs de locations, transfer y dashboard.
- Modify `apps/api/src/modules/inventory/inventory.controller.ts`.
- Modify `apps/api/src/modules/inventory/services/stock-location.service.ts`.
- Modify `apps/api/src/modules/inventory/services/stock-ledger.service.ts`.
- Modify `apps/api/src/modules/inventory/services/serialized-asset.service.ts`.
- Modify `apps/api/src/modules/inventory/services/inventory-dashboard.service.ts`.
- Add or modify tests in `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`, `stock-ledger.service.spec.ts`, `serialized-asset.service.spec.ts`.
- Update live report `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md` as tasks close.

## Task 1: Convertir Bodegas En Slice Navegable Del Portal

**Files:**
- Modify: `apps/portal/src/app/dashboard/inventory/page.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Test: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that renders `InventoryClient` with initial tab derived from URL search params and expects `Bodegas` to be active.

```tsx
it('abre bodegas cuando tab=locations viene en la URL', async () => {
  render(<InventoryClient initialTab="locations" />);
  expect(await screen.findByRole('tab', { name: 'Bodegas', selected: true })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm --filter @iwana/portal test -- InventoryClient --runInBand`

Expected: FAIL because `InventoryClient` today no recibe `initialTab`.

- [ ] **Step 3: Implement minimal route-to-tab contract**

Pass `searchParams.tab` from `page.tsx` and teach `InventoryClient` to initialize `activeTab` from a validated value set.

```tsx
type InventoryPageProps = {
  searchParams?: Promise<{ tab?: string }>;
};

const INVENTORY_TABS = new Set(['summary', 'catalog', 'purchasing', 'locations', 'assets', 'movements', 'writeoffs']);
```

- [ ] **Step 4: Keep refresh-safe tab behavior**

When the user changes tabs, update URL search params instead of keeping the state only in memory. Use the existing router/navigation pattern already used in portal if present; otherwise use a narrow client-side sync local to `InventoryClient`.

- [ ] **Step 5: Run test to verify it passes**

Run: `corepack pnpm --filter @iwana/portal test -- InventoryClient --runInBand`

Expected: PASS and no regressions in existing inventory client tests.

## Task 2: Habilitar CRUD Basico De Bodegas En Portal Y API

**Files:**
- Create: `apps/portal/src/components/inventory/StockLocationFormDialog.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/StockLocationsMatrix.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-location.service.ts`
- Test: `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`
- Test: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Write failing API tests**

Cover update and archive of a stock location.

```ts
it('updates stock location name and capacity', async () => { /* PATCH /inventory/locations/:id */ });
it('archives stock location', async () => { /* PATCH status=ARCHIVED */ });
```

- [ ] **Step 2: Run API tests to verify they fail**

Run: `corepack pnpm --filter @iwana/api test -- inventory.controller.http.spec.ts --runInBand`

Expected: FAIL because no update endpoint exists.

- [ ] **Step 3: Add DTOs and controller endpoints**

Create `UpdateStockLocationSchema` with fields:

```ts
name?: string;
status?: StockLocationStatus;
responsibleRefId?: string | null;
maxCapacity?: number | null;
```

Add `PATCH /inventory/locations/:id`.

- [ ] **Step 4: Enforce mobile location ownership**

In `StockLocationService`, reject `MOBILE_TECHNICIAN` and `MOBILE_CREW` without `responsibleRefId`.

```ts
if (isMobileType(validated.type) && !validated.responsibleRefId) {
  throw new BadRequestException('La bodega móvil requiere responsable.');
}
```

- [ ] **Step 5: Add portal create/edit flow**

Add button `Crear bodega` and row action `Editar`. Reuse location labels, visible Spanish copy, and CTA from the current empty state.

- [ ] **Step 6: Run API and portal tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory.controller.http.spec.ts --runInBand
corepack pnpm --filter @iwana/portal test -- InventoryClient --runInBand
```

Expected: CRUD básico de ubicaciones passing in HTTP and component tests.

## Task 3: Endurecer Transferencias, Custodia Y Topes

**Files:**
- Modify: `apps/portal/src/components/inventory/StockTransferDialog.tsx`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-location.service.ts`
- Test: `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`
- Test: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Write failing ledger tests**

Cover:

```text
serialized transfer to quarantine does not assign technician custody
mobile destination over capacity is rejected
transfer requires evidence/acta metadata
source balance cannot be exceeded
```

- [ ] **Step 2: Run ledger tests to verify they fail**

Run: `corepack pnpm --filter @iwana/api test -- stock-ledger.service.spec.ts --runInBand`

Expected: FAIL because current transfer always maps serialized assets to technician custody and does not validate capacity.

- [ ] **Step 3: Extend transfer DTO**

Add explicit evidence fields that do not introduce PII:

```ts
handoffReference: z.string().trim().min(1).max(160);
handoffNotes: optionalTrimmedString(1000);
```

- [ ] **Step 4: Map serialized custody by destination type**

Replace hardcoded technician assignment with rules based on destination location type:

```ts
MAIN_WAREHOUSE -> WAREHOUSE
MOBILE_TECHNICIAN -> TECHNICIAN
MOBILE_CREW -> CREW
QUARANTINE -> WAREHOUSE
REPAIR -> WAREHOUSE
SCRAP -> NONE
CUSTOMER_SITE -> CUSTOMER
```

- [ ] **Step 5: Validate visible availability and capacity**

Reject transfer if requested quantity exceeds source on-hand or if destination mobile location exceeds `maxCapacity`.

- [ ] **Step 6: Mirror validations in UI**

In `StockTransferDialog`, restrict origin options to locations that actually have visible positive balance for the selected item, show available quantity, and block submit when the request exceeds it.

- [ ] **Step 7: Run tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- stock-ledger.service.spec.ts --runInBand
corepack pnpm --filter @iwana/portal test -- InventoryClient --runInBand
```

Expected: transfer and custody rules pass without regressing the current transfer flow.

## Task 4: Alinear Retornos Y Dashboard Segmentado Con El HLD

**Files:**
- Modify: `apps/api/src/modules/inventory/services/inventory-dashboard.service.ts`
- Modify: `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/portal/src/components/inventory/InventoryDashboard.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Test: `apps/api/src/modules/inventory/tests/serialized-asset.service.spec.ts`
- Test: `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts`
- Test: `apps/portal/src/components/inventory/InventoryClient.spec.tsx`

- [ ] **Step 1: Write failing return-state tests**

Cover only allowed return targets from warehouse return flows.

```text
customer return enters IN_TRANSIT / IN_TESTING flow
UI cannot choose arbitrary terminal states
returned-to-warehouse no longer resolves directly to AVAILABLE unless rule says so
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm --filter @iwana/api test -- serialized-asset.service.spec.ts inventory.controller.http.spec.ts --runInBand`

Expected: FAIL because target status is too permissive.

- [ ] **Step 3: Constrain return transitions**

Replace free selection with a curated allowed subset derived from the documented flow. The UI should render only those options and backend must reject anything else.

- [ ] **Step 4: Expand dashboard response**

Add segmented aggregates:

```ts
balancesByLocation
balancesByCategory
serializedAssetsByStatus
serializedAssetsByResponsibleType
```

- [ ] **Step 5: Render segmented dashboard cards or tables**

Keep `InventoryDashboard` dense and operational. Do not create ornamental cards; add compact sections that answer “qué bodega”, “qué estado” y “qué responsable” quickly.

- [ ] **Step 6: Run tests**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory.controller.http.spec.ts serialized-asset.service.spec.ts --runInBand
corepack pnpm --filter @iwana/portal test -- InventoryClient --runInBand
```

Expected: dashboard contract and constrained return flow pass.

## Task 5: Completar E2E, Reporte Vivo Y Verificacion Final

**Files:**
- Modify: `e2e/tests/portal-inventory-scm.spec.ts`
- Modify: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md`

- [x] **Step 1: Add failing E2E scenarios**

Add scenarios for:

```text
abrir /dashboard/inventory?tab=locations
crear bodega desde UI
editar capacidad/responsable
rechazar transferencia que excede saldo
rechazar transferencia a bodega móvil sin cupo
```

- [x] **Step 2: Run E2E to verify failures**

Run: `corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts`

Expected: FAIL until the new portal and API flows are implemented.

- [x] **Step 3: Update live report after green runs**

Mark DT-INV-05 a DT-INV-14 as `Resuelto` only if evidence exists in code, tests and E2E.

- [x] **Step 4: Run final verification suite**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- inventory
corepack pnpm --filter @iwana/portal test -- InventoryClient GoodsReceiptPanel
corepack pnpm --filter @iwana/db typecheck
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Expected: PASS in all commands, or explicit documentation of any unrelated pre-existing failure.

- [ ] **Step 5: Commit**

```bash
git add apps/api apps/portal e2e docs/informes/INFORME-MOD12-INVENTARIO-SCM-FASE-01-v1.0.md docs/plans/2026-07-06-mod12-bodegas-gap-closure.md
git commit -m "docs: plan mod12 bodegas gap closure"
```

## Self-Review

- PRD/HLD coverage included: ruta, CRUD de ubicaciones, transferencias, topes, dashboard segmentado, retornos y pruebas.
- No placeholders left intentionally; every task has files, commands and expected result.
- Boundaries preserved: no cambio de stack ni cruce directo a tablas de otros modulos.

## Execution Handoff

Plan complete and saved to `docs/plans/2026-07-06-mod12-bodegas-gap-closure.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

# MOD12 Compras Workspace Hibrido Fase 02 Implementation Plan

**Estado:** Aprobado
**Aprobado por:** CTO

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolucionar el submodulo de Compras de MOD12 desde el flujo CRUD actual hacia un workspace hibrido con solicitudes por lineas, politicas por tipo + monto, proveedor desde Parties y recepciones parciales trazables.

**Architecture:** La implementacion se mantiene dentro de `apps/api/src/modules/inventory` y `apps/portal/src/components/inventory`, sin crear nuevo bounded context. Se agregan lineas de solicitud y adjudicaciones tenant-aware, un puerto de proveedor contra MOD08 y una UI operativa con KPIs, tabla y drawer de trabajo.

**Tech Stack:** NestJS, TypeScript strict, TypeORM, PostgreSQL tenant schema, Zod, OpenAPI, Next.js App Router, Jest, Supertest, Playwright, pnpm.

---

## File Map

- Create `packages/shared/src/enums/inventory/purchase-request-type.enum.ts`.
- Create `packages/shared/src/enums/inventory/purchase-request-priority.enum.ts`.
- Create `packages/shared/src/enums/inventory/purchase-request-line-status.enum.ts`.
- Modify `packages/shared/src/enums/inventory/index.ts`.
- Create `packages/database/src/entities/purchase-request-line.entity.ts`.
- Create `packages/database/src/entities/purchase-request-line-award.entity.ts`.
- Modify `packages/database/src/entities/purchase-request.entity.ts`.
- Modify `packages/database/src/entities/purchase-order-line.entity.ts`.
- Modify `packages/database/src/entities/supplier-quote.entity.ts`.
- Create `packages/database/src/migrations/tenant/049_refine_inventory_purchasing_workspace.ts`.
- Modify `apps/api/src/modules/inventory/dto/index.ts`.
- Modify `apps/api/src/modules/inventory/purchasing.controller.ts`.
- Modify `apps/api/src/modules/inventory/services/purchasing.service.ts`.
- Modify `apps/api/src/modules/inventory/services/goods-receipt.service.ts`.
- Create `apps/api/src/modules/inventory/services/purchasing-policy.service.ts`.
- Create `apps/api/src/modules/inventory/services/purchasing-query.service.ts`.
- Create `apps/api/src/modules/inventory/ports/supplier-party.port.ts`.
- Update purchasing tests in `apps/api/src/modules/inventory/tests/*`.
- Modify `apps/portal/src/lib/api-client.ts`.
- Replace the purchase workspace composition in `apps/portal/src/components/inventory/*`.
- Update `e2e/tests/portal-inventory-scm.spec.ts`.
- Update phase report and checklist in `docs/informes/` and `docs/quality/`.

## Task 1: Shared contracts and persistence

**Files:**
- Create: `packages/shared/src/enums/inventory/purchase-request-type.enum.ts`
- Create: `packages/shared/src/enums/inventory/purchase-request-priority.enum.ts`
- Create: `packages/shared/src/enums/inventory/purchase-request-line-status.enum.ts`
- Create: `packages/database/src/entities/purchase-request-line.entity.ts`
- Create: `packages/database/src/entities/purchase-request-line-award.entity.ts`
- Modify: `packages/database/src/entities/purchase-request.entity.ts`
- Modify: `packages/database/src/entities/purchase-order-line.entity.ts`
- Modify: `packages/database/src/entities/supplier-quote.entity.ts`
- Create: `packages/database/src/migrations/tenant/049_refine_inventory_purchasing_workspace.ts`

- [ ] **Step 1: Inspect current purchasing entities and migration numbering**

Run:

```powershell
rg -n "purchase_request|supplier_quote|purchase_order_line|048_harden_inventory_write_off_status" packages/database/src/entities packages/database/src/migrations/tenant
```

Expected: confirm current purchase entities and reserve migration `049`.

- [ ] **Step 2: Add the new shared enums and export them**

Run:

```powershell
corepack pnpm typecheck
```

Expected: new enums compile and no export errors are introduced by `packages/shared/src/enums/inventory/index.ts`.

- [ ] **Step 3: Add the new persistence model**

Implement:

- request header refinements in `purchase_requests`,
- `purchase_request_lines`,
- `purchase_request_line_awards`,
- `purchase_request_line_id` reference in `purchase_order_lines`.

Do not add FKs to MOD08 or MOD06 tables.

- [ ] **Step 4: Write and review migration 049**

Migration must:

- add columns to `purchase_requests`,
- create the two new purchasing tables,
- backfill safe defaults where needed,
- keep rollback reversible.

- [ ] **Step 5: Verify database package**

Run:

```powershell
corepack pnpm --filter @iwana/db typecheck
```

Expected: DB entities and migration references compile.

## Task 2: Backend DTOs, policy and query layer

**Files:**
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts`
- Modify: `apps/api/src/modules/inventory/services/purchasing.service.ts`
- Create: `apps/api/src/modules/inventory/services/purchasing-policy.service.ts`
- Create: `apps/api/src/modules/inventory/services/purchasing-query.service.ts`
- Create: `apps/api/src/modules/inventory/ports/supplier-party.port.ts`

- [ ] **Step 1: Write failing tests for the new purchasing behaviors**

Focus on:

- create request with lines,
- approval blocked by policy,
- exception allowed for urgent type,
- request detail query,
- provider summary lookup.

Run:

```powershell
corepack pnpm --filter @iwana/api test -- purchasing.service.spec.ts purchasing.http.integration.spec.ts
```

Expected: FAIL on missing DTO fields, missing services or outdated assertions.

- [ ] **Step 2: Expand DTO schemas**

Add DTO coverage for:

- request type,
- priority,
- requesting area,
- justification,
- operational reference,
- line array,
- line award payload,
- list filters for workspace.

Keep Zod as the single source of validation truth.

- [ ] **Step 3: Add policy and query services**

Implement `PurchasingPolicyService` for type + amount + exception decisions and `PurchasingQueryService` for detail and workspace list composition.

- [ ] **Step 4: Refine controller endpoints**

Add or refine:

- `GET /purchasing/requests/:id`,
- `POST /purchasing/requests/:id/awards`,
- `GET /purchasing/providers/:partyRefId/summary`.

Preserve current endpoints unless replacement is required by the PRD.

- [ ] **Step 5: Verify backend compile**

Run:

```powershell
corepack pnpm --filter @iwana/api typecheck
```

Expected: DTOs, services and controller compile with strict types.

## Task 3: Order generation and receipt semantics

**Files:**
- Modify: `apps/api/src/modules/inventory/services/purchasing.service.ts`
- Modify: `apps/api/src/modules/inventory/services/goods-receipt.service.ts`
- Modify: `packages/database/src/entities/goods-receipt.entity.ts` if receipt status semantics require persistence changes
- Test: `apps/api/src/modules/inventory/tests/purchasing.flow.integration.spec.ts`

- [ ] **Step 1: Write failing tests for award-driven order creation and partial receipt**

Scenarios:

- one request produces multiple OCs,
- partial receipt updates line state,
- shortages or damages do not overstate stock,
- only received quantities update balances.

Run:

```powershell
corepack pnpm --filter @iwana/api test -- purchasing.flow.integration.spec.ts
```

Expected: FAIL on missing line-award logic or receipt semantics.

- [ ] **Step 2: Implement order creation from selected lines**

Support one or more OCs from awarded lines while preserving traceability to `purchase_request_line_id`.

- [ ] **Step 3: Refine goods receipt semantics**

Treat receipt status as operational behavior, not decorative state. Quantities not physically received must not create stock, lots or serial ownership.

- [ ] **Step 4: Verify purchasing test slice**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- purchasing
```

Expected: purchasing suites pass; if unrelated failures appear, document them in the phase report.

## Task 4: Portal API client and workspace UI

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Replace or split: `apps/portal/src/components/inventory/PurchaseDesk.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseWorkspaceSummary.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseRequestsTable.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`
- Create: `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`
- Create: `apps/portal/src/components/inventory/SupplierSummaryCard.tsx`
- Create: `apps/portal/src/components/inventory/QuoteComparisonPanel.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseOrderDrawer.tsx`
- Modify: `apps/portal/src/components/inventory/GoodsReceiptPanel.tsx`

- [ ] **Step 1: Write failing UI tests for the new purchase workspace**

Cover:

- KPI summary render,
- request type filters,
- create request with lines,
- contextual action gating,
- supplier summary display.

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient GoodsReceiptPanel
```

Expected: FAIL because the current `PurchaseDesk` does not expose the new workflow.

- [ ] **Step 2: Extend typed client contracts**

Add request detail, provider summary, award payloads and refined request creation types before touching components.

- [ ] **Step 3: Build the workspace shell**

Implement:

- upper KPI strip,
- table with filters,
- workbench drawer,
- composer with mixed line sources.

- [ ] **Step 4: Replace technical supplier copy**

Do not expose "partyRefId" or internal module names in visible UI. Use business copy only.

- [ ] **Step 5: Verify portal test slice**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx GoodsReceiptPanel.spec.tsx
```

Expected: portal inventory tests pass.

## Task 5: End-to-end and documentation

**Files:**
- Modify: `e2e/tests/portal-inventory-scm.spec.ts`
- Create: `docs/informes/INFORME-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md`
- Modify: `docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md`
- Modify: `docs/quality/CHECKLIST-MOD12-COMPRAS-WORKSPACE-HIBRIDO-FASE-02-v1.0.md`

- [ ] **Step 1: Add focused E2E flows**

Cover:

- reposicion with catalog line,
- urgent request with justified exception,
- project request with multiple lines,
- order creation and partial receipt.

- [ ] **Step 2: Run focused E2E**

Run:

```powershell
corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts
```

Expected: purchase flows pass or blocked dependency is documented.

- [ ] **Step 3: Update report and checklist**

Record:

- commands run,
- outcomes,
- known gaps,
- stop/go decision,
- residual risks.

## Task 6: Final verification

**Files:**
- Verify all files changed in Tasks 1-5

- [ ] **Step 1: Run backend quality commands**

Run:

```powershell
corepack pnpm --filter @iwana/api test -- purchasing
corepack pnpm --filter @iwana/api typecheck
```

Expected: tests and typecheck pass for the API slice.

- [ ] **Step 2: Run portal quality commands**

Run:

```powershell
corepack pnpm --filter @iwana/portal test -- InventoryClient.spec.tsx GoodsReceiptPanel.spec.tsx
corepack pnpm --filter @iwana/portal typecheck
```

Expected: portal tests and typecheck pass for the inventory UI slice.

- [ ] **Step 3: Re-read spec coverage**

Reconcile implementation against:

- `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/hlds/HLD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`

Expected: no missing requirement in request lines, policies, provider summary or receipt semantics.

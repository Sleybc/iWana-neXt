# MOD12 Existencias Fase 03A — Conteo físico Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documento de conteo físico por bodega que congela esperado, captura contado y al cerrar reconcilia saldo vía ledger (`ADJUSTMENT` + `CYCLE_COUNT`).

**Architecture:** Entidades `stock_counts`/`stock_count_lines` (migración 071) + `CycleCountService` orquesta; stock solo vía `StockLedgerService.recordMovementWithManager`. Portal: tab primer nivel `counts`. Tracks §3bis: Backend ⟂ Frontend contra contrato API congelado (spec §5).

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant, Next.js portal, Jest.

---

### Task 1: Enum + entidades + migración 071

**Files:**
- Create: `packages/shared/src/enums/inventory/stock-count-status.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`
- Create: `packages/database/src/entities/stock-count.entity.ts`
- Create: `packages/database/src/entities/stock-count-line.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/071_create_stock_counts.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts` (append import + array)

- [ ] Implementar según prompt §3.1 / ADR-054 / plantilla `057_create_stock_issues`
- [ ] `down()` elimina tablas + enum
- [ ] Build `@iwana/shared` + `@iwana/db`

### Task 2: CycleCountService + DTOs + controller + module

**Files:**
- Create: `apps/api/src/modules/inventory/services/cycle-count.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts` (append schemas)
- Modify: `apps/api/src/modules/inventory/inventory.controller.ts` (6 endpoints)
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] create/list/getById/update/close/cancel per prompt §3.2
- [ ] close: delta = counted − onHand vivo; idempotent; ADMIN only at controller
- [ ] Uncounted lines: no adjust (CA-F3A-06)

### Task 3: API tests + swagger + HTTP mocks

**Files:**
- Create: `apps/api/src/modules/inventory/tests/cycle-count.service.spec.ts`
- Modify: `inventory.controller.http.spec.ts`, `inventory.swagger.spec.ts`, `inventory.module.spec.ts`, any controller testing modules (B1 lesson)

- [ ] Cover CA freeze/consumable/close/idempotent/serialized exclusion
- [ ] Full `pnpm --filter @iwana/api test -- src/modules/inventory` green

### Task 4: Portal API client + labels + tab

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`
- Modify: `apps/portal/src/components/inventory/inventory-tab-params.ts`
- Modify: `InventoryClient.tsx` (append tab Conteos)

### Task 5: StockCountsWorkspace UI + specs

**Files:**
- Create: `StockCountsWorkspace.tsx` + composer/detail/table as needed (template StockIssues*)
- Specs portal

### Task 6: Docs + gates

- Informe fase + informe vivo
- lint + typecheck + migrate

# MOD12 Existencias Fase 02 — Reposición sugerida y valor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subvista Reposición con sugerencias netas (anti doble pedido) → composer de compras prellenado; valor estimado en Resumen.

**Architecture:** `ReplenishmentService` en InventoryModule (mismo boundary que purchasing). Dashboard aditivo. Portal: panel nuevo + estado `pendingComposerPrefill` en `InventoryClient` (sin URL). Sin migraciones (D-F2-1…5).

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL multi-tenant, Next.js portal, Jest.

**Gate entrada:** G7 Fase 1 GO (`INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md`). Working tree limpio.

**Contrato congelado:** PRD §7 + `docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md`.

**Protocolo:** tracks Backend ⟂ Frontend; integración `InventoryClient` al final. Solo append en archivos compartidos. **No commits** salvo petición explícita del usuario.

---

## Mapa de archivos

| Archivo | Acción |
| --- | --- |
| `apps/api/src/modules/inventory/services/replenishment.service.ts` | Crear |
| `apps/api/src/modules/inventory/tests/replenishment.service.spec.ts` | Crear |
| `apps/api/src/modules/inventory/services/inventory-dashboard.service.ts` | Extender valor |
| `apps/api/src/modules/inventory/tests/inventory-dashboard.service.spec.ts` | Crear |
| `apps/api/src/modules/inventory/inventory.controller.ts` | Append GET suggestions |
| `apps/api/src/modules/inventory/inventory.module.ts` | Append provider |
| `apps/api/src/modules/inventory/tests/inventory.controller.http.spec.ts` | Append roles GET |
| `apps/api/src/modules/inventory/inventory.swagger.spec.ts` | Append path |
| `apps/api/src/modules/inventory/tests/inventory.module.spec.ts` | Append provider |
| `apps/portal/src/lib/api-client.ts` | Tipos + método |
| `apps/portal/src/components/inventory/StockReplenishmentPanel.tsx` | Crear |
| `apps/portal/src/components/inventory/StockReplenishmentPanel.spec.tsx` | Crear |
| `apps/portal/src/components/inventory/StockWorkspace.tsx` | Subvista replenishment |
| `apps/portal/src/components/inventory/PurchaseWorkspace.tsx` | `createInitialValues` |
| `apps/portal/src/components/inventory/PurchaseWorkspace.spec.tsx` | Prefill create |
| `apps/portal/src/components/inventory/PurchaseSelectionBar.tsx` | Label CTA opcional |
| `apps/portal/src/components/inventory/InventoryClient.tsx` | `pendingComposerPrefill` |
| `apps/portal/src/components/inventory/InventoryDashboard.tsx` | KPI valor |
| `apps/portal/src/components/inventory/InventoryDashboard.spec.tsx` | Crear/extender |
| `apps/portal/src/components/inventory/inventory-labels.ts` | Labels criticidad / REPLENISHMENT |

---

### Task 1: Backend — ReplenishmentService + tests

**Files:** create service + spec

- [ ] TDD: disparo `disponible + pendiente < reorderPoint`; anti doble pedido OC + líneas solicitud; piso MOQ; redondeo `orderMultiple`; costo D-F2-4; batch proveedor; orden criticidad `out` → `below-minimum` → `below-reorder`.
- [ ] Implementar con `@InjectDataSource`, `TenantContext.getOrThrow()`, `runInTenantSchema`.
- [ ] Disponible: Σ balances `onHand − reserved` por ítem (agregar en servicio; `StockBalanceService.list` opcional o query directa en misma transacción).
- [ ] Pendiente OC: líneas de OC `APPROVED`/`PARTIALLY_RECEIVED`, `Σ (quantity − receivedQuantity)` con cast numeric.
- [ ] Pendiente solicitud: `Σ quantityRequested` donde `lineStatus ∈ {OPEN, PENDING_QUOTE, AWARDED}` (excluir `ORDERED`).
- [ ] Elegibles: `purchasable=true`, `status=ACTIVE`, `reorderPoint > 0`.
- [ ] `suggestedQty = ceil_to_multiple(max(target − (avail+pend), moq ?? 0), orderMultiple)`.
- [ ] Shape PRD §7; `estimatedUnitCost` null si fallback es `'0.00'`/`0` para label; cálculo de línea usa el número.
- [ ] `preferredSupplier`: batch `SupplierPartyPort.getSupplierSummariesBatch`.

### Task 2: Backend — Dashboard valor + controller + module + HTTP/Swagger

- [ ] Extender `getSummary`: `estimatedTotalValue` string/number coherente con totales existentes; `estimatedValue` por categoría. Costo unitario D-F2-4 × `quantityOnHand`.
- [ ] Spec dashboard valor total y por categoría.
- [ ] Append controller: `GET replenishment/suggestions` roles ADMIN/NOC/SUPPORT.
- [ ] Append module providers + module.spec + http.spec mock + swagger path.

### Task 3: Frontend — api-client + labels + StockReplenishmentPanel

- [ ] Tipo `ReplenishmentSuggestionRecord`; extender `InventoryDashboardSummary` / category; `listReplenishmentSuggestions`.
- [ ] Labels español sentence case (criticidad, sin enums crudos).
- [ ] Panel: fetch, empty/loading/error, tabla + qty editable, selección (out preselected), CTA vía `PurchaseSelectionBar` con label custom, construir `PurchaseComposerInitialValues` (`REPLENISHMENT`, líneas `REPLENISHMENT_SUGGESTION`, `requestingArea: 'Existencias'`, justificación ≥ 10).
- [ ] Specs panel.

### Task 4: Frontend — StockWorkspace + PurchaseWorkspace prefill + Dashboard

- [ ] `StockSubview += 'replenishment'`; tab Reposición; callback `onGeneratePurchaseRequest(values)`.
- [ ] `PurchaseWorkspace`: prop `createInitialValues?; onCreateInitialValuesConsumed?`; al montar/presente → `openCreateMode()` + usar como `composerInitialValues`; consumir/limpiar; tras create OK → `openWorkbench(requestId)` (vía callback existente del parent).
- [ ] KPI valor + valor en breakdown categorías.
- [ ] Specs PurchaseWorkspace prefill + dashboard.

### Task 5: Integración InventoryClient + gates

- [ ] Estado `pendingComposerPrefill`; StockWorkspace onGenerate → set + `handleTabChange('purchasing')`; pasar a PurchaseWorkspace; limpiar al consumir; tras create → openWorkbench.
- [ ] `pnpm --filter @iwana/api test -- src/modules/inventory`
- [ ] `pnpm --filter @iwana/portal test` (inventario)
- [ ] `pnpm lint && pnpm typecheck`
- [ ] Informe fase + vivo.

---

## Self-review

- CA-F2-01…07 cubiertos por Tasks 1–5.
- Sin DDL; sin POST nuevo de creación.
- Sin placeholders.

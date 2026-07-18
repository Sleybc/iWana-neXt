# MOD12 Existencias Fase 01 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kardex consultable, ajustes tipificados y pestaña Existencias en portal (Por producto / Por bodega / Kardex); Bodegas reducida a gestión.

**Architecture:** Reutiliza ledger existente (`StockMovement`/`StockBalance`). Razón de ajuste en `originRefId` (D1, sin DDL). Query service nuevo + `recordAdjustment` en ledger. Portal consume contrato tipado; integración mínima en archivos compartidos con Compras F07.

**Tech Stack:** NestJS 11, TypeORM, Zod DTOs, `@iwana/shared`, Next.js portal, Jest.

**Contrato congelado:** `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md`  
**Protocolo:** tracks paralelos §3bis — Backend ⟂ Frontend (mocks tipados); integración `InventoryClient` al final.

**Restricción F07:** solo append en `dto/index.ts`, `inventory.module.ts`, `inventory.controller.http.spec.ts`, `InventoryClient.tsx` (+specs). No reformatear ni revertir cambios ajenos. **No commits** salvo petición explícita del usuario.

---

## Tracks

| Track | Agente | Archivos |
| --- | --- | --- |
| **B** Backend | AI-SR-FULL | shared enum, DTOs append, query service, ledger, controller append, module provider, tests API |
| **F** Frontend | AI-FE-PLATFORM | api-client, labels, helpers+specs, 6 componentes+specs, tab-params; **no** tocar `InventoryClient` hasta Task I |
| **I** Integración | AI-SR-FULL | `InventoryClient` + redirect + Bodegas panel; specs; informe |

---

### Task B1: Enum compartido

**Files:**
- Create: `packages/shared/src/enums/inventory/stock-adjustment-reason.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts` (export)

- [ ] Crear enum `StockAdjustmentReason`: `CYCLE_COUNT`, `DAMAGE`, `INITIAL_LOAD`, `CORRECTION`, `LOSS`, `FOUND`, `OTHER`
- [ ] Exportar en barrel
- [ ] `pnpm --filter @iwana/shared build`

### Task B2: DTOs (append final de dto/index.ts)

- [ ] Importar `StockAdjustmentReason` si hace falta
- [ ] Append `ListStockMovementsQuerySchema` + Dto (filtros + page/limit como ListSuppliers)
- [ ] Append `CreateStockAdjustmentSchema` + Dto (`quantityDelta` ≠ 0, `idempotencyKey` required 8–160)

### Task B3: StockMovementQueryService

- [ ] Crear `services/stock-movement-query.service.ts` (patrón StockBalanceService)
- [ ] `list` + `getById` con enriquecimiento y `adjustmentReason` si origin=ADJUSTMENT
- [ ] Spec `tests/stock-movement-query.service.spec.ts`
- [ ] Provider en `inventory.module.ts` (una línea, sin reordenar)

### Task B4: recordAdjustment + controller

- [ ] `recordAdjustment` en `stock-ledger.service.ts` (patrón recordSale; rechazar SERIALIZED)
- [ ] Append GET movements / GET movements/:id / POST adjustments en controller
- [ ] Specs ledger + HTTP append + swagger mock paths

### Task F1: API client + labels + helpers

- [ ] Tipos y métodos en `api-client.ts`
- [ ] `STOCK_ADJUSTMENT_REASON_LABELS` en inventory-labels
- [ ] `stock-overview.ts` + `stock-kardex-filters.ts` (+specs)

### Task F2: Componentes hoja

- [ ] StockByProductTable, StockItemDetailDrawer, StockAdjustmentDialog(+spec), StockKardexPanel(+spec), StockLocationsPanel, StockWorkspace(+smoke)
- [ ] `inventory-tab-params.ts` += `'stock'` (+spec)

### Task I: Integración + verificación + docs

- [ ] InventoryClient: tab stock, Bodegas sin matriz, redirect custody, canAdjust
- [ ] Actualizar InventoryClient.spec
- [ ] Gates: jest inventario API + portal; lint/typecheck si viable
- [ ] `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-v1.0.md` + actualizar informe vivo

---

## Criterios de aceptación (evidencia)

CA-01…CA-07 del prompt §7. Stop/go si DDL, contrato inviable, append insuficiente o boundary.

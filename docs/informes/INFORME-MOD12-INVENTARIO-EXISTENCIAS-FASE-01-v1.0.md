# Informe de fase — MOD12 Existencias Fase 01

**Version:** 1.0  
**Fecha:** 2026-07-18  
**Estado:** G6 GO — pendiente G7 (recomendación EM-ARCH + aprobación CTO)  
**Rol ejecutor:** AI-SR-FULL (+ track FE-PLATFORM en la misma sesión)  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-KARDEX-AJUSTES-FASE-01-v1.0.md`  
**Plan:** `docs/plans/2026-07-18-mod12-existencias-fase-01.md`  
**PRD:** `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md`
**Auditoría G5:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-AUDITORIA-ARCH-v1.0.md`
**Review G6:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-G6-REVIEW-v1.0.md`

---

## 1. Resumen

Se implementó el kardex consultable, el ajuste manual tipificado y la pestaña **Existencias** (Por producto / Por bodega / Kardex). La pestaña **Bodegas** quedó reducida a gestión. Sin migraciones (D1). Contratos API alineados al PRD §7.

Protocolo multiagente: tracks Backend ⟂ Frontend contra contrato congelado; integración de `InventoryClient` al final (archivos compartidos con Compras F07: solo append / cambios mínimos).

## 2. Entregables técnicos

### Backend

| Pieza | Ruta |
| --- | --- |
| Enum `StockAdjustmentReason` | `packages/shared/src/enums/inventory/stock-adjustment-reason.enum.ts` |
| DTOs (append) | `apps/api/src/modules/inventory/dto/index.ts` |
| Query kardex | `apps/api/src/modules/inventory/services/stock-movement-query.service.ts` |
| `recordAdjustment` | `apps/api/src/modules/inventory/services/stock-ledger.service.ts` |
| Endpoints | `GET /inventory/movements`, `GET /inventory/movements/:id`, `POST /inventory/adjustments` |
| Module provider | `StockMovementQueryService` en `inventory.module.ts` |

### Frontend portal

| Pieza | Ruta |
| --- | --- |
| API client | tipos + `listMovements` / `getMovement` / `createAdjustment` |
| Labels | `STOCK_ADJUSTMENT_REASON_LABELS` |
| Helpers | `stock-overview.ts`, `stock-kardex-filters.ts` |
| UI | `StockByProductTable`, `StockItemDetailDrawer`, `StockAdjustmentDialog`, `StockKardexPanel`, `StockLocationsPanel`, `StockWorkspace` |
| Tabs | `'stock'` en `inventory-tab-params` + integración `InventoryClient` |
| Compat | redirect `tab=locations&custody=mobile` → `tab=stock&custody=mobile` |

### Migraciones

No aplica (decisión D1 confirmada).

## 3. Evidencia de criterios de aceptación

| CA | Evidencia |
| --- | --- |
| CA-01 | Query service enriquece líneas; origen recepción reutiliza ledger existente |
| CA-02 | `recordAdjustment` con delta ±; saldo negativo vía `applyDeltaWithManager` (mensaje español existente) |
| CA-03 | Rechazo `SERIALIZED` con mensaje a retorno/baja — test ledger |
| CA-04 | Replay idempotente — test ledger |
| CA-05 | HTTP: SUPPORT/NOC 403 en POST adjustments; ADMIN 201; GET kardex permitido a SUPPORT |
| CA-06 | Pestaña Existencias + 3 subvistas; Bodegas sin matriz; redirect custody — specs portal + E2E Playwright |
| CA-07 | Swagger documenta 3 paths; suites inventario nuevas en verde |

## 4. Gates de verificación (ejecutor)

| Gate | Resultado |
| --- | --- |
| Jest API: query + ledger + swagger + HTTP kardex/ajustes + module | PASS (56 tests) |
| Jest portal: helpers + dialogs + workspace + tab-params + InventoryClient | PASS (39 tests) |
| Typecheck `@iwana/shared` + `@iwana/api` + `@iwana/portal` | PASS |
| Lint monorepo completo | No corrido en esta sesión (typecheck de paquetes afectados en verde) |
| E2E Playwright `portal-inventory-scm` — Existencias | PASS (6/6): tab=stock, redirect custody, kardex seed, ajuste OK, ajuste negativo 400, drill-down Por bodega |
| E2E Playwright `portal-inventory-scm` — Bodegas (regresión) | PASS (5/5): título Bodegas, crear/editar, bloqueos de salida |
| Remediación B1 — `counter-purchase.http.integration.spec.ts` | PASS (2/2): mock `StockMovementQueryService` añadido |
| `/api/v1/docs` visual | Cubierto por swagger spec de los 3 endpoints |

## 5. Deuda / bloqueos

| Tipo | Descripción |
| --- | --- |
| Resuelto | Test de adjudicación en `InventoryClient`: `openWorkbench` ahora abre en la pestaña sugerida por `getPurchaseNextAction` |
| Resuelto | Smoke E2E Playwright Existencias (+ mocks movements/adjustments) en `e2e/tests/portal-inventory-scm.spec.ts` |
| Resuelto | B1 auditoría G5: mock `StockMovementQueryService` en `counter-purchase.http.integration.spec.ts` |
| Resuelto | G6 UX: sin Ajustar en serializados; custody→Por bodega; Editar solo con handler |
| Pendiente G7 | Recomendación EM-ARCH + aprobación CTO |
| Deuda | Skeleton Existencias, foco custom, drawer a11y, lot label, rol→canAdjust |

Sin stop/go técnico: no se requirió DDL ni cambio de contrato.

## 6. Desvíos del prompt

Ninguno material sobre el contrato §7 ni D1–D6. `canAdjust` queda habilitado en UI (fallback 403 mapeado); no se cableó rol de sesión para ocultar la acción.

Fix colateral F07 (necesario para suite portal en verde): al abrir el workbench de compras sin `initialTab` explícito, se navega a la pestaña sugerida por el next-action (p. ej. Adjudicación si la solicitud está aprobada con líneas awardables).

## 7. Recomendación G5 → G6 → G7

**G5 cumplido** (B1 remedado). **G6 GO** (informe `…-G6-REVIEW-v1.0.md`). Siguiente: **G7** con deuda residual no bloqueante registrada.

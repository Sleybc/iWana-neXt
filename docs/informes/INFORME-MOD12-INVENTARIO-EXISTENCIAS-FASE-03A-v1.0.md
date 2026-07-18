# Informe de fase — MOD12 Existencias Fase 03A

**Version:** 1.0  
**Fecha:** 2026-07-18  
**Estado:** G6 GO · G7 GO — ver `INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-CIERRE-G7-v1.0.md`  
**Rol ejecutor:** AI-SR-FULL (backend + portal; tracks multiagente abortados por límite API — ejecución inline)  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-CONTEO-FISICO-FASE-03A-v1.0.md`  
**Plan:** `docs/plans/2026-07-18-mod12-existencias-fase-03a.md`  
**PRD:** `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 Fase 3A  
**ADR:** `docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md`  
**Spec:** `docs/specs/2026-07-18-mod12-existencias-conteo-fisico-fase03A-design.md`  
**Review G6:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-03A-G6-REVIEW-v1.0.md`

---

## 1. Resumen

Se implementó el documento de **conteo físico** (migración 071, `CycleCountService`, 6 endpoints, pestaña Conteos) que congela esperado, captura contado y al cerrar reconcilia el saldo vía ledger (`ADJUSTMENT` + `originContext=inventory.cycle-count` + razón CYCLE_COUNT en kardex). Sin tocar reservas (3B).

También se cerró la **deuda residual F2** (vocabulario Agotado, `tabular-nums`, `canAdjust` por rol ADMIN, a11y drawer, timeout SupplierPicker, label de lote).

## 2. Entregables técnicos

### BD

| Pieza | Ruta |
| --- | --- |
| Enum `StockCountStatus` | `packages/shared/src/enums/inventory/stock-count-status.enum.ts` |
| Entidades | `stock-count.entity.ts`, `stock-count-line.entity.ts` |
| Migración 071 | `packages/database/src/migrations/tenant/071_create_stock_counts.ts` + runner |

### Backend

| Pieza | Ruta |
| --- | --- |
| `CycleCountService` | `apps/api/src/modules/inventory/services/cycle-count.service.ts` |
| DTOs | append en `dto/index.ts` |
| Endpoints | `GET/POST /counts`, `GET/PATCH /counts/:id`, `POST .../close` (ADMIN), `POST .../cancel` |
| Kardex | `originContext === inventory.cycle-count` → `adjustmentReason = CYCLE_COUNT` |

### Frontend

| Pieza | Ruta |
| --- | --- |
| Tab `counts` | `inventory-tab-params.ts` + `InventoryClient` |
| Workspace | `StockCountsWorkspace.tsx` |
| API client + labels | tipos/métodos + `STOCK_COUNT_STATUS_*` |

### Migraciones

071 reversible (`down` elimina tablas + enum). **Aplicada en dev** (`tenant_iwana`: tablas + fila `CreateStockCounts0710000000000`).

## 3. Evidencia CA

| CA | Evidencia |
| --- | --- |
| CA-F3A-01 | Spec + servicio: congelado consumibles `expectedQty = onHand` |
| CA-F3A-02 | Spec + UI: filtro categoría; categorías se cargan en tab Conteos |
| CA-F3A-03 | Spec: variance = counted − expected |
| CA-F3A-04 | Spec: close delta = counted − onHand vivo; ledger ADJUSTMENT |
| CA-F3A-05 | Spec: idempotencia + sin movimiento si sin variación |
| CA-F3A-06 | Serializados excluidos; líneas sin countedQty no ajustan |
| CA-F3A-07 | HTTP: close 403 NOC/SUPPORT; UI `canClose`; E2E NOC sin botón |
| CA-F3A-08 | Migración 071 + runner + tablas en DB |
| CA-F3A-09 | Suites + lint/typecheck + Playwright |

## 4. Gates

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` | **32 suites / 245 tests PASS** |
| Jest portal (StockCounts + InventoryClient + deuda) | PASS |
| Typecheck API + portal | PASS |
| Lint API + portal | PASS (sin errores) |
| Migración 071 en Docker | **Aplicada y verificada** |
| Playwright Existencias | **8/8 PASS** |
| Playwright Conteos | **2/2 PASS** (ADMIN cierre + NOC cancelar) |

## 5. Deuda / notas

| Tipo | Descripción |
| --- | --- |
| Protocolo | Subagentes Backend/Frontend fallaron por límite API; implementación consolidada en sesión SR-FULL |
| UX-D1 | Confirmaciones con `window.confirm` (no bloqueante G6) |
| Fuera de alcance | 3B reservas; conteo serializados; freeze de bodega |

## 6. Recomendación

**G5 cumplido. G6 GO. G7 GO.** Fase 03A lista para producción; siguiente definición: **Fase 3B** (reservas).

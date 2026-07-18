# Informe de fase — MOD12 Existencias Fase 02

**Version:** 1.1  
**Fecha:** 2026-07-18  
**Estado:** G6 GO (condiciones remediadas) · **G7 GO confirmado por CTO (2026-07-18)**  
**Rol ejecutor:** AI-SR-FULL (backend) + AI-FE-PLATFORM (portal), orquestados en sesión multiagente §3bis  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-REORDEN-FASE-02-v1.0.md`  
**Plan:** `docs/plans/2026-07-18-mod12-existencias-fase-02.md`  
**PRD:** `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 Fase 2 (congelado)  
**Spec:** `docs/specs/2026-07-18-mod12-existencias-reorden-fase02-design.md`  
**Entrada:** G7 Fase 1 GO (`INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-01-CIERRE-G7-v1.0.md`)  
**Review G6:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-G6-REVIEW-v1.0.md`  
**Cierre G7:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-02-CIERRE-G7-v1.0.md`  
**Commit:** `33cd6ecd` en `main`

---

## 1. Resumen

Se implementó la subvista **Reposición** con sugerencias netas (anti doble pedido), generación de solicitud de compra **prellenada** vía composer existente (`POST /purchasing/requests`), y valor estimado de inventario en el Resumen. Sin migraciones (D-F2-1). Sin endpoint de creación propio de existencias.

Protocolo multiagente: tracks Backend ⟂ Frontend contra contrato congelado; G6 paralelo; remediación de condiciones G6 en la misma sesión.

## 2. Entregables técnicos

### Backend

| Pieza | Ruta |
| --- | --- |
| `ReplenishmentService.listSuggestions` | `apps/api/src/modules/inventory/services/replenishment.service.ts` |
| Valor estimado dashboard | `inventory-dashboard.service.ts` (`estimatedTotalValue` + `estimatedValue` por categoría) |
| Endpoint | `GET /inventory/replenishment/suggestions` (ADMIN/NOC/SUPPORT) |
| Module | `ReplenishmentService` en providers/exports |

### Frontend portal

| Pieza | Ruta |
| --- | --- |
| API client | tipo `ReplenishmentSuggestionRecord` + `listReplenishmentSuggestions` + campos valor |
| Subvista | `StockReplenishmentPanel` + tab en `StockWorkspace` |
| Prefill | `pendingComposerPrefill` → `createInitialValues` (+ `supplierLabels`) |
| Resumen | KPI «Valor estimado de inventario» + valor por categoría |
| Labels / a11y | criticidad; CTA opcional; `aria-live` en barra; foco a `#purchase-title` |

### Migraciones

No aplica (confirmado).

## 3. Evidencia de criterios de aceptación

| CA | Evidencia |
| --- | --- |
| CA-F2-01 | `replenishment.service.spec.ts`: disparo + fórmula D-F2-3 |
| CA-F2-02 | Spec anti doble pedido OC + líneas solicitud |
| CA-F2-03 | Prefill REPLENISHMENT / REPLENISHMENT_SUGGESTION + `supplierLabels`; E2E composer |
| CA-F2-04 | E2E: crear → workbench con líneas Cable drop |
| CA-F2-05 | Dashboard + KPI portal; «Sin costo» cuando unit cost null |
| CA-F2-06 | HTTP spec roles GET; creación vía purchasing |
| CA-F2-07 | Suites + lint/typecheck monorepo + Swagger + Playwright Existencias 8/8 |

## 4. Gates de verificación (ejecutor)

| Gate | Resultado |
| --- | --- |
| Jest API `src/modules/inventory` | PASS — 31 suites / 235 tests (sesión G5) |
| Jest portal F2 | PASS (incl. remediación) |
| Typecheck + lint monorepo | PASS (`pnpm lint` + `pnpm typecheck`) |
| Playwright Existencias | PASS — 8/8 |
| `/api/v1/docs` path nuevo | Cubierto por `inventory.swagger.spec.ts` |

## 5. Desvíos

| Tema | Detalle |
| --- | --- |
| Menor | Pendiente de solicitud por `inventoryItemId` (campo real). |
| Remediación G6 | DS-H1/H2, UX-H1/H2/H3 cerrados en código (ver §6). |

## 6. Remediación post-G6

| Condición G6 | Remedio |
| --- | --- |
| DS-H1 barra anunciada | `role="status"` + `aria-live="polite"` en `PurchaseSelectionBar` |
| DS-H2 foco composer | focus `#purchase-title` al consumir `createInitialValues` |
| UX-H1 proveedor visible | `supplierLabels` en `PurchaseComposerInitialValues` |
| UX-H2 Sin costo | BE `estimatedLineValue: null` si unit cost 0; UI mira `estimatedUnitCost` |
| UX-H3 pluralización | «1 ítem» / «1 producto» |
| QA E2E | Playwright F2 en verde |

## 7. Deuda residual (no bloqueante)

| Tipo | Descripción |
| --- | --- |
| Deuda | UX-D1 criticidad «Sin stock» vs «Agotado»; skeleton/drawer a11y Fase 1 |
| Bloqueo | Ninguno |

## 8. Recomendación G5 → G6 → G7

**G5 cumplido.** **G6 GO** tras remediación de condiciones. **G7 GO confirmado por CTO (2026-07-18)** — fase cerrada en producción (`33cd6ecd`).

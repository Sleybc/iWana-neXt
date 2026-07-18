# INFORME — MOD12 Compras · Pulido UX / UI / vocabulario — Fase 23

**Versión:** 1.0  
**Estado:** Implementado  
**Fecha:** 2026-07-17  
**Módulo:** MOD12 Inventario / SCM — Compras  
**Ejecutor:** AI-FE-PLATFORM + AI-SR-QA  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMPRAS-PULIDO-UX-VOCABULARIO-FASE-23-v1.0.md`  
**Spec:** `docs/specs/2026-07-17-mod12-compras-pulido-ux-vocabulario-fase23-design.md`  
**Auditoría origen:** `docs/informes/INFORME-MOD12-COMPRAS-UX-UI-VOCABULARIO-AUDITORIA-v1.0.md`

## Objetivo

Remediación G6 de Compras: copy humano, quick wins de identidad/a11y y CTAs/overlay mínimos para cerrar fricción del happy path sin rediseñar el shell (stepper → Fase 24).

## Cambios

### Vocabulario (CA-23-01)

- Convención aplicada en UI: cotización, ronda de cotización, orden de compra, total con envío.
- Fallbacks con `getSupplierDisplayLabel` / `getApprovalLevelLabel` en `inventory-labels.ts`.
- Paneles tocados: `RfqInvitationsPanel`, `PurchaseRequestWorkbenchDrawer`, `GoodsReceiptPanel`, `PurchaseWorkspaceSummary`, `QuoteShippingFields`, `SupplierQuoteLinesEditor`, `ApprovalDecisionPanel`, `AwardLinesPanel`.

### Comparación + a11y (CA-23-02 / CA-23-03)

- `QuoteComparisonPanel`: título = proveedor + número; `supplierLabels`; foco en «Usar esta cotización».
- `AwardLinesPanel`: `interactiveFocusClassName` en chips de cotización.

### CTA next-action (CA-23-04)

- Footer del workbench muestra CTA de `getPurchaseNextAction` aunque la pestaña activa sea otra (`getPurchaseNextActionCtaLabel`).
- En sugerencia `orders` con solicitud aprobada, el CTA abre el flujo de órdenes.

### Un solo overlay (CA-23-05)

- `PurchaseWorkspace`: workbench `open` exige `!orderDrawerOpen`.
- Al cerrar OC: reabre workbench en `orders` (cancel) o `receipts` (éxito).

### Primitives (CA-23-06)

- Textareas del workbench → `portalTextareaClassName`.
- `tabular-nums` en montos/KPIs (comparación, summary, monto estimado).
- `window.confirm` de descarte de líneas → `Dialog` del sistema.

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-23-01 Copy sin landed/RFQ/OC/`partyRefId` visibles; cotización unificada | Implementado + RTL |
| CA-23-02 Comparación muestra proveedor | Implementado + RTL |
| CA-23-03 Foco visible en chips/links | Implementado |
| CA-23-04 CTA next-action fuera de tab | Implementado + RTL |
| CA-23-05 Nunca workbench + OC a la vez | Implementado |
| CA-23-06 Textareas + tabular-nums + confirm Dialog | Implementado |
| CA-23-07 RTL sin regresión F20–F22 | Verificado en suite local |

## Verificación

| Suite | Resultado |
| --- | --- |
| Portal Jest (ApprovalDecisionPanel, QuoteComparisonPanel, AwardLinesPanel, PurchaseOrderDrawer, PurchaseRequestWorkbenchDrawer, RfqInvitationsPanel, GoodsReceiptPanel, SupplierQuoteLinesEditor, purchase-workbench) | **51/51 pass** |
| `tsc --noEmit` `@iwana/portal` | **OK** |

## Fuera de alcance (Fase 24)

- Stepper / gramática de 7 tabs.
- Progressive disclosure de Cotizar.
- Primitive «fila operativa» en `portal-ui`.
- Side-peek Firma iWana completo.

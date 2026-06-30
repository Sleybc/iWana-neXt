# Informe - MOD12 Compras Workspace Hibrido Fase 02

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Ejecutado  
**Modo activo:** EM  
**Responsable:** AI-SR-FULL  
**Aprobado por:** CTO  
**Clasificacion:** Uso interno

---

## Identificacion

- **Modulo base:** MOD12 Inventario / SCM
- **Submodulo:** Compras
- **Fase:** Fase 02 - Workspace hibrido y refinamiento operativo
- **Origen:** `docs/specs/2026-06-25-mod12-compras-workspace-hibrido-design.md`
- **Plan de ejecucion:** `docs/plans/2026-06-25-mod12-compras-workspace-hibrido-fase-02.md`

## 1. Resumen de implementacion

Se evoluciono el submodulo de Compras hacia un workspace hibrido con solicitudes por lineas, politica de aprobacion por tipo + monto, puerto de proveedor contra MOD08 Parties, adjudicacion por linea y recepciones parciales trazables.

### Backend

- Enums: `PurchaseRequestType`, `PurchaseRequestPriority`, `PurchaseRequestLineStatus`, `PurchaseRequestLineSourceKind`
- Entidades: `PurchaseRequestLine`, `PurchaseRequestLineAward`
- Migraciones: `049_refine_inventory_purchasing_workspace`, `050_extend_goods_receipt_status_for_purchasing`
- Servicios: `PurchasingPolicyService`, `PurchasingQueryService`, `SupplierPartyPort`
- Endpoints nuevos/refinados: detalle de solicitud, adjudicaciones, resumen de proveedor

### Frontend

- Workspace: `PurchaseWorkspace`, KPIs, tabla con filtros, compositor con lineas mixtas, drawer de trabajo
- Cliente API ampliado con contratos tipados del workspace
- `InventoryClient` migra de `PurchaseDesk` a `PurchaseWorkspace`

## 2. Comandos ejecutados y resultados

| Comando | Resultado |
| --- | --- |
| `corepack pnpm --filter @iwana/db typecheck` | OK |
| `corepack pnpm --filter @iwana/api test -- purchasing` | 3 suites, 13 tests OK |
| `corepack pnpm --filter @iwana/api typecheck` | OK |
| `corepack pnpm --filter @iwana/portal test -- InventoryClient GoodsReceiptPanel` | 2 suites, 6 tests OK |
| `corepack pnpm --filter @iwana/portal typecheck` | OK |
| `corepack pnpm test:e2e:portal -- portal-inventory-scm.spec.ts` | 3 tests OK |

## 3. Criterios de aceptacion

| ID | Estado | Evidencia |
| --- | --- | --- |
| CA-CMP-01 | Cubierto | `CreatePurchaseRequestSchema` + compositor con `lines[]` |
| CA-CMP-02 | Cubierto | `sourceKind` INVENTORY_ITEM / REPLENISHMENT_SUGGESTION / FREE_TEXT |
| CA-CMP-03 | Cubierto | `PurchasingPolicyService.evaluateApproval` |
| CA-CMP-04 | Cubierto | `exceptionReason` en aprobacion + tests backend |
| CA-CMP-05 | Cubierto | `GET /purchasing/providers/:id/summary` + `SupplierSummaryCard` |
| CA-CMP-06 | Cubierto | `createLineAwards` + OC con `purchaseRequestLineId` |
| CA-CMP-07 | Cubierto | `GoodsReceiptService` solo impacta cantidades recibidas |
| CA-CMP-08 | Cubierto | estados `PARTIAL`, `WITH_SHORTAGES`, `WITH_DAMAGES` |
| CA-CMP-09 | Cubierto | KPIs, tabla, filtros, drawer y compositor en portal |

## 4. Deuda tecnica residual

Ninguna pendiente en el alcance de Fase 02.

### Cierre de deuda (2026-06-25)

- Eliminado `PurchaseDesk.tsx`; `PurchaseWorkspace` es la única superficie activa.
- `SupplierPicker` con búsqueda `GET /purchasing/providers` reemplaza inputs técnicos en cotización, OC y compositor.
- E2E ampliados: proyecto multi-línea y urgencia con excepción (5/5 OK).
- Scoring de proveedor, portal proveedor y contratos marco siguen fuera de alcance (PRD).

## 5. Decision stop/go

**GO** para integracion en rama de trabajo. No se detectaron violaciones de boundary ni FKs cross-module. La recepcion parcial mantiene consistencia con el ledger.

## 6. Riesgos residuales

| Riesgo | Severidad | Mitigacion |
| --- | --- | --- |
| Parametrizacion fina de politica por tenant | Media | defaults claros en `PurchasingPolicyService` |
| Scoring y portal proveedor | Baja | fuera de alcance PRD Fase 02 |
| Brecha visual vs identidad iWana (KPIs, badges, drawer) | Media | spec **aprobado** EM-ARCH: `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`; ejecucion Fase A autorizada |

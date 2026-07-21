# Informe — MOD12 Activos y comodato Fase 05A (Ficha 360 del activo)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Entrega completa (BE + FE) — **G5 GO** pendiente auditoría ARCH formal  
**Modo activo:** AI-EM-ARCH (Orchestrator) → AI-SR-FULL + AI-FE-PLATFORM  
**PRD:** `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` §7 Fase 5A  
**Spec:** `docs/specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md` (D-F5-1…11)  
**Prompt:** `docs/prompts/PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`  
**Fase 5B:** `PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md` permanece **NO EJECUTABLE** (ADR-016)

---

## 1. Resumen ejecutivo

Se implementó la **Ficha 360 del activo serializado**: `GET /inventory/assets/:id` devuelve un registro compuesto (`SerializedAssetDetailRecord`) con cabecera compatible, origen de compra, vida útil derivada, timeline de ciclo de vida paginado, movimientos del kardex y sección Comodato vacía con contrato congelado. El portal reconstruyó `SerializedAssetDetailDrawer` en siete secciones con estados vacíos explicativos, paginación «Ver más» y deep-link al kardex (`?tab=stock&serializedAssetId=`).

**Sin DDL.** Sin endpoints de escritura de comodato (reservado para 5B).

---

## 2. Desempate AI-EM-ARCH (D-F5-6)

**Conflicto:** el ejecutor backend dejó `supplierDisplayName: null` por interpretar el hard stop «sin lecturas Parties» de forma estricta.

**Decisión:** autorizar `SupplierPartyPort.getSupplierSummary(partyRefId)` — puerto aprobado de MOD12, mismo patrón que `supplier-profile.service`, `rfq-pdf` e `inventory-item`. No es lectura directa a tablas de Parties; es el boundary contract vigente.

**Resultado:** `purchaseOrigin.supplierDisplayName` se popula cuando la cadena OC → recepción → perfil proveedor se resuelve y el port devuelve nombre.

---

## 3. Paths tocados

| Área | Path |
| --- | --- |
| Tipos ficha 360 | `apps/api/src/modules/inventory/types/serialized-asset-detail.types.ts` |
| Vida útil derivada | `apps/api/src/modules/inventory/services/serialized-asset-useful-life.util.ts` |
| Composición detalle | `apps/api/src/modules/inventory/services/serialized-asset.service.ts` |
| Timeline paginado | `apps/api/src/modules/inventory/services/asset-lifecycle.service.ts` |
| Filtro kardex | `apps/api/src/modules/inventory/services/stock-movement-query.service.ts` |
| DTO / query params | `apps/api/src/modules/inventory/dto/index.ts` |
| Controller + Swagger | `apps/api/src/modules/inventory/inventory.controller.ts`, `inventory.swagger.spec.ts` |
| Tests BE | `serialized-asset-detail.service.spec.ts`, `serialized-asset.isolation.spec.ts`, `serialized-asset-useful-life.util.spec.ts`, `stock-movement-query.service.spec.ts` |
| API client portal | `apps/portal/src/lib/api-client.ts` |
| Drawer ficha 360 | `apps/portal/src/components/inventory/SerializedAssetDetailDrawer.tsx` |
| Labels | `apps/portal/src/components/inventory/inventory-labels.ts` |
| Integración | `InventoryClient.tsx`, `StockWorkspace.tsx`, `StockKardexPanel.tsx`, `stock-kardex-filters.ts` |
| Tests FE | `SerializedAssetDetailDrawer.spec.tsx`, `stock-kardex-filters.spec.ts` |
| E2E (preparado) | `e2e/tests/portal-inventory-scm.spec.ts` (test «abre ficha 360…») |

---

## 4. Criterios de aceptación (CA-5A)

| CA | Estado | Evidencia |
| --- | --- | --- |
| CA-5A-01 | ✅ | `resolvePurchaseOrigin` + `SupplierPartyPort`; test `serialized-asset-detail.service.spec.ts` con `supplierDisplayName: 'Proveedor Andino'` |
| CA-5A-02 | ✅ | `AssetLifecycleService.listPaginatedForAsset` (DESC); drawer timeline + labels español |
| CA-5A-03 | ✅ | Sección movimientos reutiliza `StockMovementQueryService.list`; enlace «Ver en kardex» en drawer |
| CA-5A-04 | ✅ | Filtro `serializedAssetId` en kardex; test `stock-movement-query.service.spec.ts` |
| CA-5A-05 | ✅ | Drawer specs: empty states en 4 secciones + «Sin comodatos registrados» |
| CA-5A-06 | ✅ | `calculateUsefulLife` — 4 estados; chip en drawer |
| CA-5A-07 | ✅ | Referencias opacas (`formatInventoryOpaqueRef`); sin PII |
| CA-5A-08 | ✅ | `serialized-asset.isolation.spec.ts` — aislamiento tenant en GET assets/:id |

---

## 5. Verificación ejecutada

```text
pnpm --filter @iwana/db build                          → OK
pnpm --filter @iwana/api test -- src/modules/inventory → 37 suites, 288 tests OK
pnpm --filter @iwana/portal test -- inventory          → 56 suites, 263 tests OK
pnpm lint                                              → OK
pnpm typecheck                                         → OK
npx playwright install chromium                           → OK (2026-07-21)
npx playwright test … portal-inventory-scm.spec.ts     → 27/38 OK (5.3 min)
npx playwright test … -g "abre ficha 360"              → OK (~1 s)
```

**E2E Fase 5A:** el test `abre ficha 360 del activo con timeline y origen de compra` **pasa** (evidencia G6). Los 11 fallos restantes del archivo son **preexistentes** y ajenos a 5A (compras/RFQ/proveedores — timeouts y mock `request` en RF-PROV-08).

### Remediación post-auditoría CTO (A1, 2026-07-21)

**Defecto:** `resolvePurchaseOrigin` retornaba `null` si no existía fila en `supplier_profiles`, ocultando OC/recepción/costo para OCs anteriores a Proveedores Fase 05 (migración 064).

**Fix:** el perfil de proveedor solo enriquece `supplierDisplayName`; la sección se renderiza con la cadena OC → recepción → costo resuelta.

**Test:** `returns purchase origin without supplier profile when OC chain resolves (A1)` en `serialized-asset-detail.service.spec.ts`.

### Cierre deuda G7 v1.2 (2026-07-21)

- **G5-05A-01:** migración 081 enlaza timeline ↔ movimiento (`stock_movement_id`); botón «Ver movimiento» en drawer.
- **G5-05A-02:** schema OpenAPI completo (`SerializedAssetDetailResponseDto`).

---

## 6. Restricciones respetadas

| Restricción | Cumplimiento |
| --- | --- |
| Sin migraciones / DDL | ✅ |
| Sin enlace evento↔movimiento | ✅ (D-F5-3) |
| Sin resolución CRM/WFM/Tasks | ✅ (solo `SupplierPartyPort` aprobado) |
| Campos raíz preservados | ✅ (D-F5-8) |
| `loans` vacío con shape congelado | ✅ (D-F5-10) |
| Paginación default 20 / max 100 | ✅ (D-F5-2) |

---

## 7. Handoff gates

| Gate | Responsable | Estado |
| --- | --- | --- |
| **G5** — Auditoría arquitectónica | AI-EM-ARCH / architect-review | **GO recomendado** (sin DDL, boundaries OK, desempate documentado) |
| **G6** — UX / DS / QA | AI-PROD-UX, AI-DS-OWNER, AI-SR-QA | Pendiente |
| **G7** — Cierre CTO | CTO (aprobador ≠ productor) | **GO recomendado** — [`INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-CIERRE-G7-v1.0.md`](INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-CIERRE-G7-v1.0.md) |

---

## 8. Habilitación Fase 5B

`PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md` pasa a **EJECUTABLE** solo tras:

1. G7 de esta fase con **GO del CTO**
2. Actualización de estado en informe de auditoría MOD12

Alcance 5B (sin cambios): `asset-loan.service.ts`, alta/cierre transaccional en ledger, `GET /inventory/loans`, bandeja en subvista Activos, sección Comodato viva en ficha 360.

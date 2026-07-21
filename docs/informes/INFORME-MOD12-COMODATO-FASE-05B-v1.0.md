# Informe — MOD12 Activos y comodato Fase 05B (Comodato con ciclo de vida)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ Entrega completa (BE + FE) — **G5 GO** pendiente auditoría ARCH formal  
**Modo activo:** AI-EM-ARCH (Orchestrator) → AI-SR-FULL + AI-FE-PLATFORM  
**Prerequisito:** Fase 5A G7 GO provisional (instrucción operador 2026-07-21)  
**PRD:** `docs/prds/PRD-MOD12-ACTIVOS-COMODATO-v1.0.md` §7 Fase 5B  
**Spec:** `docs/specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md` (D-F5-12…14)  
**Prompt:** `docs/prompts/PROMPT-MOD12-COMODATO-FASE-05B-v1.0.md`

---

## 1. Resumen ejecutivo

Se activó el ciclo de vida del comodato: al instalar un activo serializado en cliente desde OT (`INSTALLED_AT_CUSTOMER`) se crea un registro en `asset_loan_assignments` en la **misma transacción** del ledger; al retornar o dar de baja se cierra el comodato abierto sin bloquear la operación si no existía registro previo. Nuevo `GET /inventory/loans` paginado con filtros. Portal: subvista **Comodatos** dentro de la pestaña Activos y sección viva en la ficha 360.

**Sin DDL.** Sin endpoints de escritura manual de comodato.

---

## 2. Paths tocados

| Área | Path |
| --- | --- |
| Servicio comodato | `apps/api/src/modules/inventory/services/asset-loan.service.ts` |
| Integración ledger | `apps/api/src/modules/inventory/services/stock-ledger.service.ts` |
| Ficha 360 loans | `apps/api/src/modules/inventory/services/serialized-asset.service.ts` |
| API | `apps/api/src/modules/inventory/inventory.controller.ts` |
| DTO | `apps/api/src/modules/inventory/dto/index.ts` (`contractRefId` en OT, `ListLoansQuerySchema`) |
| Module | `apps/api/src/modules/inventory/inventory.module.ts` |
| Tests BE | `asset-loan.service.spec.ts`, `asset-loan.isolation.spec.ts`, `stock-ledger.service.spec.ts` |
| Subvista portal | `apps/portal/src/components/inventory/AssetsWorkspace.tsx` |
| Bandeja | `apps/portal/src/components/inventory/AssetLoansPanel.tsx` |
| Integración | `InventoryClient.tsx`, `api-client.ts`, `SerializedAssetDetailDrawer.tsx` |
| Tests FE | `AssetLoansPanel.spec.tsx`, `SerializedAssetDetailDrawer.spec.tsx` |
| E2E | `e2e/tests/portal-inventory-scm.spec.ts` |

---

## 3. Comportamiento implementado

| Evento | Acción |
| --- | --- |
| OT instala en cliente (serial + `subscriberId`) | `openLoanWithManager` — idempotente por `stockMovementId` |
| Retorno de activo serializado | `closeOpenLoanWithManager` — no-op si no hay comodato abierto |
| Baja de activo serializado | Cierre de comodato abierto (misma TX) |
| `GET /inventory/loans` | Filtros: status, subscriberRefId, contractRefId, serializedAssetId + paginación |
| Ficha 360 | `loans` desde `asset_loan_assignments`, orden `installed_at DESC` |

**Limitación declarada:** activos instalados antes de 5B no tienen comodato histórico (sin backfill).

---

## 4. Criterios de aceptación (CA-5B)

| CA | Estado | Evidencia |
| --- | --- | --- |
| RF-ACT-08 / CA-5B-01 | ✅ | `asset-loan.service.spec.ts` + `stock-ledger.service.spec.ts` |
| RF-ACT-09 / CA-5B-02 | ✅ | Cierre en retorno y write-off |
| RF-ACT-10 / CA-5B-03 | ✅ | `GET /inventory/loans` + `asset-loan.isolation.spec.ts` |
| RF-ACT-11 / CA-5B-04 | ✅ | Idempotencia por `stockMovementId` |
| RF-ACT-12 / CA-5B-05 | ✅ | `AssetLoansPanel` + E2E comodato |
| Sin escritura manual | ✅ | D-F5-14 — solo lectura vía GET |
| Misma TX | ✅ | Hooks en `recordExecutionOrderMovement` / `recordReturn` / `recordWriteOff` |

---

## 5. Verificación

```text
pnpm --filter @iwana/api test -- src/modules/inventory     → 303 passed
pnpm --filter @iwana/api test -- asset-loan                → 8 passed
pnpm --filter @iwana/portal test -- inventory              → 266 passed
pnpm lint / pnpm typecheck                                 → OK
E2E ficha 360                                              → PASS
E2E comodato OT→retorno                                    → PASS (cableado UI; mocks page.route)
```

### EV-1 — Smoke transaccional real (obligatorio G7 post-auditoría A2)

Suite: `apps/api/src/modules/inventory/tests/asset-loan.transactional.ev1.spec.ts`

```text
EV1_REAL_DB=1 pnpm --filter @iwana/api test -- asset-loan.transactional.ev1.spec.ts --coverage=false
→ 3/3 passed (2026-07-21)
```

Cubre: alta en OT, idempotencia por movimiento, cierre en retorno, cierre en baja (LOST), retorno sin comodato abierto (D-F5-13).

**Remediación A1 (5A):** origen de compra visible sin fila en `supplier_profiles` — ver informe 5A y test `serialized-asset-detail.service.spec.ts`.

**Fix colateral EV-1:** `WriteOffReason.LOST`/`STOLEN` → estado `LOST` (HLD), permitiendo baja desde comodato instalado.

### Cierre deuda G7 v1.2 (2026-07-21)

| ID | Entrega |
| --- | --- |
| G5-05A-01 | Migración **081**: `asset_lifecycle_events.stock_movement_id`; ledger persiste enlace; drawer «Ver movimiento» |
| G5-05A-02 | `SerializedAssetDetailResponseDto` + `@ApiOkResponse` |
| G5-05B-01 | Índice único parcial `uq_asset_loan_assignments_tenant_movement` (migración 081) |

---

## 6. Handoff gates

| Gate | Responsable | Estado |
| --- | --- | --- |
| **G5** — Auditoría ARCH | AI-EM-ARCH | **GO** — [`…G5-AUDITORIA-ARCH…`](INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G5-AUDITORIA-ARCH-v1.0.md) |
| **G6** — UX / DS / QA | PROD-UX, DS-OWNER, SR-QA | **GO** — [`…G6-REVIEW…`](INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-G6-REVIEW-v1.0.md) |
| **G7** — Cierre EM-ARCH | AI-EM-ARCH | **Recomendación técnica GO** — [`…CIERRE-G7…`](INFORME-MOD12-ACTIVOS-COMODATO-FASE-05-CIERRE-G7-v1.0.md) (auditoría CTO independiente 2026-07-21) |

---

## 7. Cierre submódulo Activos y comodato

Con G7 de 5A y 5B, el submódulo MOD12 Activos y comodato queda cerrado en MVP (RF-ACT-01…12). RF-ACT-13 (fecha esperada de recuperación) permanece en fase futura — **exige ADR/migración**.

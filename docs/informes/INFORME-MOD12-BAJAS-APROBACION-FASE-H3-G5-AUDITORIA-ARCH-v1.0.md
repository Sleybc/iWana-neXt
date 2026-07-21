# Informe — MOD12 Bajas con aprobación Fase H3 — Auditoría ARCH (G5)

**Version:** 1.0  
**Fecha:** 2026-07-21  
**Estado:** ✅ **G5 GO** — habilita G6 (UX / DS / QA)  
**Modo activo:** Architect (review de segunda capa)  
**Auditor:** AI-EM-ARCH (aprobador ≠ productor)  
**Alcance:** Fase H3 — documento `inventory_write_offs` + aprobación antes de ledger  
**PRD:** `docs/prds/PRD-MOD12-BAJAS-APROBACION-v1.0.md`  
**Spec:** `docs/specs/2026-07-21-mod12-bajas-aprobacion-fase-h3-design.md`  
**ADR:** ADR-048 — migración 082 aditiva, sin ADR nuevo

---

## 1. Veredicto

**G5 GO** — sin bloqueantes de arquitectura.

---

## 2. Checklist

| Ítem | Resultado | Evidencia |
| --- | --- | --- |
| Boundaries Modulith | ✅ | Ledger solo vía `StockLedgerService`; sin lecturas cross-module |
| Multi-tenant | ✅ | `runInTenantSchema`; filtros `tenantId` en queries |
| TX documento + ledger | ✅ | `approve()` lock pessimista + `recordWriteOffWithManager` misma TX (D-H3-03) |
| Separación solicitud/aplicación | ✅ | `POST /write-offs` → `PENDING_APPROVAL`; ledger en `approve` |
| Idempotencia approve | ✅ | Retorno idempotente si `COMPLETED` + `stock_movement_id` |
| Aprobador ≠ solicitante | ✅ | `400` explícito |
| Breaking change controlado | ✅ | BE+FE+tests en misma entrega |
| Migración reversible | ✅ | `082_extend_inventory_write_offs_payload.ts` |
| Regresión comodato/B1 | ✅ | Test LOST + cierre loan en `write-off.service.spec.ts` |

---

## 3. Evidencia de tests

| Suite | Resultado |
| --- | --- |
| `write-off.service.spec.ts` | 9/9 |
| `stock-ledger.service.spec.ts` | 25/25 |
| Inventario API (total) | 317/317 passed (6 skipped) |
| Portal `InventoryClient.spec.tsx` | 31/31 |

---

## 4. Observaciones (no bloqueantes)

| ID | Severidad | Nota |
| --- | --- | --- |
| G5-H3-01 | Info | RBAC sigue `@Roles(ADMIN,NOC,SUPPORT)` sin permiso granular `inventory.stock.manage` — paridad con resto del módulo |
| G5-H3-02 | Info | Tenant mono-ADMIN: separación de funciones requiere usuario NOC como aprobador (documentado en PRD §11) |
| G5-H3-03 | Baja | E2E Playwright solicitud→aprobación pendiente para G6/G7 |

---

## 5. Decisión

Habilita **G6** (PROD-UX / DS-OWNER / SR-QA) y posterior **G7** de cierre H3.

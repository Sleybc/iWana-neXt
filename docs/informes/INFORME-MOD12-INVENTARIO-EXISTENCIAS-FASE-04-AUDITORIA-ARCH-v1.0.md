# Informe — MOD12 Existencias Fase 04 — Auditoría ARCH (G5)

**Version:** 1.0  
**Fecha:** 2026-07-20  
**Estado:** ✅ **G5 GO** — pasa a G6  
**Modo activo:** Architect (review de segunda capa)  
**Auditor:** AI-EM-ARCH (aprobador ≠ productor)  
**Entrega:** [backend](77ff51b4-aa6b-4952-89b2-27321889a6ea) + [portal](4eb898b6-94a4-49da-aa15-87eda6447b94)  
**ADR:** ADR-059 (Aprobado CTO) · Spec D-F4 · Prompt F4 EJECUTABLE

---

## 1. Resumen ejecutivo

Fase 04 implementa costeo promedio móvil por ítem conforme ADR-059. Se releyó el motor de costeo, el sellado en ledger, la migración 080 y la UI de labels/KPI/kardex. Gates Jest y typecheck re-ejecutados de forma independiente.

**Veredicto: G5 GO.** Sin hallazgos bloqueantes de boundary, multi-tenant ni stop conditions del prompt (sin FIFO/DIAN; lock presente).

**Nota de gate:** el typecheck de API falló inicialmente porque `@iwana/db` no estaba rebuildado tras añadir `averageCost`. Se ejecutó `pnpm --filter @iwana/db build` en la auditoría; typecheck limpio después. Incluir build de `@iwana/db` en el handoff de migración es deuda operativa menor (no bloquea G6).

---

## 2. Conformidad ADR-059 / D-F4

| Decisión | Resultado | Evidencia |
| --- | --- | --- |
| D-F4-1 promedio por ítem | ✅ | `inventory_items.average_cost`; sin avg por bodega |
| D-F4-2 mig 080 | ✅ | `080_add_inventory_item_average_cost.ts` + `runner.ts` |
| D-F4-3 recepción TX + lock | ✅ | `applyReceiptCostingWithManager` + advisory lock key |
| D-F4-4 fórmula | ✅ | `computeMovingAverage` |
| D-F4-5 sellado salidas | ✅ | `stock-ledger.service` → `resolveSealedUnitCostWithManager` |
| D-F4-6 ajustes no recalculan avg | ✅ | Solo sellado vía ledger |
| D-F4-8 cadena valoración | ✅ | `resolveValuationUnitCost` + dashboard/replenishment |
| D-F4-9 vocabulario | ✅ | `INVENTORY_AVERAGE_COST_LABEL = 'Costo promedio'` |
| D-F4-10 sin DIAN | ✅ | Sin claim fiscal en DTO/UI |
| Boundary Modulith | ✅ | Costeo dentro de InventoryModule |

---

## 3. Gates re-ejecutados (auditor)

| Gate | Resultado |
| --- | --- |
| Jest API costing/dashboard/replenishment/ledger | ✅ **43/43 PASS** |
| Jest portal F4 (labels/drawer/dashboard/kardex) | ✅ **9/9 PASS** |
| Typecheck `@iwana/db` + `@iwana/api` + `@iwana/portal` | ✅ Limpio (tras rebuild db) |

---

## 4. Condiciones / deuda

| ID | Severidad | Nota |
| --- | --- | --- |
| G5-O1 | Baja | Documentar en DoD: rebuild `@iwana/db` tras migraciones de entity |
| — | — | Migración 080 no re-aplicada en DB real en esta auditoría (patrón F2/F3A: G6/G7 si aplica smoke) |

---

## 5. Decisión

**G5 GO** → habilita G6 (PROD-UX / DS-OWNER / SR-QA).

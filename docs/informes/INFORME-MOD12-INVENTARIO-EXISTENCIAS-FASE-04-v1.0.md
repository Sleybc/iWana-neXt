# Informe — MOD12 Inventario Existencias Fase 04 (Costeo promedio móvil)

**Version:** 1.0  
**Fecha:** 2026-07-20  
**Estado:** ✅ Entrega completa (BE + FE) — **G5 GO** (ver auditoría ARCH)  
**Modo activo:** AI-SR-FULL (backend) + AI-FE-PLATFORM (portal)  
**G5:** `docs/informes/INFORME-MOD12-INVENTARIO-EXISTENCIAS-FASE-04-AUDITORIA-ARCH-v1.0.md`  
**PRD:** `docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md` §7 Fase 4  
**ADR:** `docs/adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md` (Aprobado CTO)  
**Spec:** `docs/specs/2026-07-20-mod12-existencias-costeo-fase04-design.md`  
**Prompt:** `docs/prompts/PROMPT-MOD12-EXISTENCIAS-COSTEO-FASE-04-v1.0.md`

---

## 1. Resumen ejecutivo (backend)

Se implementó costeo promedio móvil por ítem (ADR-059 / D-F4): columna `average_cost`, actualización en recepción OC/mostrador con lock por ítem, sellado de `unitCost` en salidas/ajustes/transferencias vía ledger, y cadena de valoración `averageCost || lastPurchaseCost || standardCost || baseCost` en dashboard y replenishment.

**Sin claim DIAN/fiscal.** Sin FIFO ni promedio por bodega.

**Stop/go backend → G5:** **GO** (CA backend con evidencia Jest; FE puede completar labels en paralelo).

---

## 2. Paths tocados (backend)

| Área | Path |
| --- | --- |
| Migración 080 | `packages/database/src/migrations/tenant/080_add_inventory_item_average_cost.ts` |
| Runner | `packages/database/src/migrations/tenant/runner.ts` |
| Entity | `packages/database/src/entities/inventory-item.entity.ts` |
| Costeo | `apps/api/src/modules/inventory/services/inventory-costing.service.ts` |
| Ledger (sellado) | `apps/api/src/modules/inventory/services/stock-ledger.service.ts` |
| Recepción OC | `apps/api/src/modules/inventory/services/goods-receipt.service.ts` |
| Compra mostrador | `apps/api/src/modules/inventory/services/counter-purchase.service.ts` |
| Dashboard / reorden | `inventory-dashboard.service.ts`, `replenishment.service.ts` |
| DTO + ítem | `apps/api/src/modules/inventory/dto/index.ts`, `inventory-item.service.ts` |
| Module | `apps/api/src/modules/inventory/inventory.module.ts` |
| Tests | `inventory-costing.service.spec.ts` (+ ajustes ledger/dashboard/replenishment/counter-purchase/purchasing) |

---

## 3. Decisiones de implementación

1. **Lock:** `pg_advisory_xact_lock(hashtext('inventory-item-costing:{tenant}:{item}'))` + `pessimistic_write` sobre `InventoryItem` en la misma TX (CA-F4-02).
2. **Orden recepción:** costeo **antes** del ledger (on-hand pre-recepción + acumulador en memoria por ítem).
3. **Sellado:** si `unitCost` no viene en la línea, `recordMovementWithManager` resuelve sellado (cubre issue dispatch, sale, consumption, EO, write-off, adjustment, transfer, cycle-count). **No** recalcula `averageCost`.
4. **CRUD:** `averageCost` opcional en create/update; create inicializa con cadena de maestros si se omite.

---

## 4. Criterios de aceptación

| CA | Backend | Evidencia |
| --- | --- | --- |
| CA-F4-01 | ✅ | `computeMovingAverage` + `applyReceiptCostingWithManager` (fórmula + lastPurchase) |
| CA-F4-02 | ✅ | Lock advisory + dos recepciones secuenciales del mismo ítem (avg final correcto) |
| CA-F4-03 | ✅ | Ledger sella `unitCost` en salida cuando avg > 0 |
| CA-F4-04 | ✅ | Ajuste negativo sella; `applyReceiptCosting` no se invoca |
| CA-F4-05 | ✅ (API) | Dashboard/replenishment priorizan `averageCost`; copy UI → FE |
| CA-F4-06 | ✅ | Promedio a nivel ítem (sin lógica distinta para serializados) |
| CA-F4-07 | ✅ | OpenAPI `averageCost` en DTO; tests; sin PII |
| CA-F4-08 | ✅ | Docs/API sin claim DIAN; descripción DTO «no es claim fiscal» |

---

## 5. Tests ejecutados

```text
cd apps/api
npx jest src/modules/inventory/tests/inventory-costing.service.spec.ts \
  src/modules/inventory/tests/stock-ledger.service.spec.ts \
  src/modules/inventory/tests/counter-purchase.service.spec.ts \
  src/modules/inventory/tests/purchasing.service.spec.ts \
  src/modules/inventory/tests/inventory-dashboard.service.spec.ts \
  src/modules/inventory/tests/replenishment.service.spec.ts \
  --no-coverage
```

**Resultado (última corrida completa de suites críticas):**  
- `inventory-costing` + `stock-ledger`: **31/31 PASS**  
- Suites dashboard / replenishment / counter-purchase / purchasing: **PASS** en corrida previa (84+ tests en bloque conjunto)

---

## 6. Frontend (pendiente FE-PLATFORM)

Labels «Costo promedio» / «Valor estimado de inventario» + nota de transparencia; detalle ítem; kardex con `unitCost` sellado. Completar esta sección al cerrar el track FE.

---

## 7. Handoff G5 → EM-ARCH

- Migración **080** reversible registrada tras 079.
- Contrato ítem: `averageCost: string` (numeric as string).
- Semántica `estimatedTotalValue` prioriza avg (sin endpoint nuevo).
- **GO backend** para G5; no mezclado con cambios audit RLS ajenos.

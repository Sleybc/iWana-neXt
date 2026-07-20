# ADR-059: Costeo promedio móvil y valoración operativa de inventario

**Version:** 1.0  
**Estado:** ✅ Aprobado  
**Aprobado por:** CTO Humano (2026-07-20)  
**Fecha:** 2026-07-20  
**Fecha de aprobación CTO:** 2026-07-20  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD12 Inventario / SCM (submodulo Existencias)  
**PRD relacionado:** docs/prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md  
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md  
**Factibilidad:** consulta AI-SR-FULL 2026-07-20 (promedio por ítem; sin FIFO/DIAN en MVP)  
**Spec de diseño:** docs/specs/2026-07-20-mod12-existencias-costeo-fase04-design.md  
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-EXISTENCIAS-COSTEO-FASE-04-v1.0.md (**ejecutable**)

---

## Contexto

El ledger (`StockMovement` / `StockMovementLine`) ya persiste `unitCost` en **ingresos** (recepción OC y compra de mostrador). Las **salidas** (despacho, venta, consumo, transferencia, ajuste, conteo, baja) dejan `unitCost = null`. Los maestros `lastPurchaseCost`, `standardCost` y `baseCost` existen en `inventory_items`, pero `lastPurchaseCost` **solo** se escribe por CRUD manual del ítem — la recepción no lo actualiza.

La Fase 2 valora inventario con la heurística:

`qtyOnHand × (lastPurchaseCost ?? standardCost ?? baseCost)`

Eso es un valor estimado operativo, no un promedio móvil. El vacío confirmado en el PRD (sección 1) y la factibilidad 2026-07-20: no hay `averageCost`, no hay capas FIFO, no hay sellado de costos en salidas.

La industria (ERPNext AVCO, Odoo average) separa: (1) costo promedio del producto, (2) costo sellado en cada movimiento de salida, (3) valoración = existencia × promedio. Este ADR adopta ese patrón en alcance MVP **operativo**, sin pretender contabilidad fiscal.

**RNF-07 / regulación:** cualquier claim de impacto DIAN, asientos contables o retención fiscal queda **fuera de alcance** y marcado «requiere verificación con fuente oficial». Esta fase no emite documentos fiscales.

---

## Decision

Se adopta **costeo promedio móvil a nivel ítem** (opción 1 de factibilidad; se descartan promedio por bodega y capas FIFO en esta fase).

1. **Nueva columna** `inventory_items.average_cost` (`numeric(14,2) NOT NULL DEFAULT 0`), migración tenant **080**. Backfill inicial: `COALESCE(last_purchase_cost, standard_cost, base_cost, 0)`.

2. **Fórmula en recepción** (OC y compra de mostrador), en la **misma transacción** del ledger y con lock de ítem / saldo agregado on-hand del ítem:

   ```
   onHand = Σ quantity_on_hand del ítem (todas las bodegas/lotes/condiciones)
   avg' = (averageCost × onHand + unitCostRecepción × qtyIn) / (onHand + qtyIn)
   ```

   Si `onHand + qtyIn = 0`, no dividir: conservar `averageCost` previo.  
   Además: `lastPurchaseCost = unitCostRecepción`.

3. **Sellado de salidas:** toda ruta que descuenta existencia escribe `StockMovementLine.unitCost` con `averageCost` vigente (fallback: cadena `averageCost || lastPurchaseCost || standardCost || baseCost`; si todo es 0 → `null` y UI «Sin costo»). **No** se recalcula el promedio al salir.

4. **Ajustes y conteos:**  
   - Delta negativo: sellar `unitCost = averageCost` (o fallback); **no** recalcular promedio.  
   - Delta positivo (sobrante / conteo al alza): **no** mezclar costo de compra desconocido en el promedio; sellar con `averageCost` vigente sin recalcular (política MVP). Documentar; no introducir costo manual de ajuste en v1.

5. **Transferencias:** copiar el mismo `unitCost` (avg vigente) en pierna origen y destino; no cambia el promedio del ítem.

6. **Valoración:** dashboard y reposición priorizan `averageCost` en la cadena:

   `averageCost || lastPurchaseCost || standardCost || baseCost`

   El KPI conserva el nombre F2 **«Valor estimado de inventario»** con nota de transparencia (ahora basado en costo promedio). Detalle de ítem muestra promedio y último costo de compra.

7. **Sin endpoints fiscales.** Opcional aditivo: campos en `GET /inventory/dashboard` (`inventoryValuation` mirror de `estimatedTotalValue` o reutilizar el campo con semántica documentada). Sin `GET /valuation` separado en MVP salvo que G2/G3 lo exijan.

8. **Fuera de alcance:** capas FIFO; promedio por bodega/lote; recosteo masivo de movimientos históricos outbound; DIAN/asientos; depreciación de serializados/activos; cambio de boundary Modulith.

---

## Reglas de boundary

1. Costeo vive en `InventoryModule`; purchasing ya está en el mismo módulo Nest — no hay hop cross-module nuevo.
2. El único writer de `average_cost` / `last_purchase_cost` automático es el servicio de costeo invocado desde recepción (y CRUD manual sigue permitido para maestros).
3. `unitCost` de líneas solo se escribe vía `StockLedgerService.recordMovementWithManager` (patrón vigente).
4. Sin CQRS / event sourcing; consistencia por transacción PostgreSQL + lock de ítem en recepción concurrente.

---

## Alternativas descartadas

1. **Promedio por ítem × bodega** — más fiel, más DDL y mutaciones en `applyDelta`; overkill MVP.  
2. **Capas FIFO / valuation ledger** — alcance grande y backfill; el PRD lo deja para decisión futura.  
3. **Solo actualizar `lastPurchaseCost` sin promedio** — no permite costear salidas de forma estable ni valorar stock mezclado de varias compras.  
4. **Recalcular promedio en ajustes positivos con costo libre** — introduce sesgo y UI compleja; aplazado.

---

## Consecuencias

- Migración tenant reversible con backfill.  
- Recepción concurrente del mismo ítem exige lock — riesgo alto si se omite (stop condition de implementación).  
- Kardex de salidas pasa a mostrar costo; históricos outbound quedan `null` (no reescritura silenciosa).  
- Semántica de `estimatedTotalValue` (F2) cambia a priorizar promedio — FE debe alinear copy.  
- Habilita Fase 4 de ejecución tras aprobación CTO + prompt G4.

---

## Criterio de aceptación del ADR

- ✅ CTO aprobó el alcance (promedio por ítem; sin FIFO/fiscal en MVP) — 2026-07-20.  
- Spec D-F4 y contrato PRD §7 alineados a esta decisión.  
- Prompt de ejecución marcado **EJECUTABLE**.

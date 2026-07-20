# SPEC — MOD12 Existencias · Costeo promedio móvil y valoración — Fase 04

**Versión:** 1.0  
**Estado:** Diseño aprobado — G4 ejecutable (ADR-059 aprobado CTO 2026-07-20)  
**Fecha:** 2026-07-20  
**Módulo:** MOD12 Inventario / SCM — Existencias  
**Autor:** AI-EM-ARCH (consolida factibilidad SR-FULL + viabilidad PROD-UX)  
**PRD:** [PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md](../prds/PRD-MOD12-INVENTARIO-EXISTENCIAS-v1.0.md)  
**ADR:** [ADR-059](../adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md) (**Aprobado**)  
**Prompt:** [PROMPT Fase 04](../prompts/PROMPT-MOD12-EXISTENCIAS-COSTEO-FASE-04-v1.0.md) (**ejecutable**)

## 1. Problema

Las compras dejan costo en el ledger de ingreso, pero el maestro no actualiza `lastPurchaseCost`, no existe promedio móvil, y las salidas no sellan `unitCost`. El valor de inventario (F2) es una heurística de costos maestros manuales.

## 2. Objetivo

Operar con **costo promedio** por ítem: actualizarlo en cada recepción, sellar el costo en salidas del kardex, y valorizar existencias con ese promedio — sin contabilidad fiscal.

## 3. Decisiones (D-F4)

| ID | Decisión |
| --- | --- |
| D-F4-1 | Promedio móvil **por ítem** (`average_cost`); no por bodega; no FIFO |
| D-F4-2 | Migración tenant **080**: columna + backfill; `down()` drop |
| D-F4-3 | Recepción OC + mostrador: misma TX → `lastPurchaseCost` + recalcular `averageCost` con lock |
| D-F4-4 | Fórmula: `avg' = (avg×onHand + cost×qtyIn) / (onHand+qtyIn)`; onHand = suma global del ítem |
| D-F4-5 | Salidas sellan `unitCost` con avg (fallback cadena); **no** recalculan avg |
| D-F4-6 | Ajustes/conteos: sellan costo; no recalculan avg (ni en delta positivo) |
| D-F4-7 | Transferencias: copian `unitCost` en ambas piernas |
| D-F4-8 | Valoración: `averageCost \|\| lastPurchaseCost \|\| standardCost \|\| baseCost` |
| D-F4-9 | Vocabulario UI: **«Costo promedio»** (no «móvil»/«medio»); KPI permanece **«Valor estimado de inventario»** con nota de que usa costo promedio; detalle ítem muestra promedio + último costo de compra |
| D-F4-10 | Sin DIAN / asientos / claim fiscal (RNF-07) |
| D-F4-11 | Sin recosteo de históricos outbound; sin pantalla/reporte nueva en MVP |

## 4. Flujo UX

1. Recepción / compra mostrador: el operador no ve fórmula; el sistema actualiza costos en segundo plano.
2. Catálogo / drawer de ítem: muestra **Costo promedio**, último costo de compra, costo estándar (lectura; maestros editables como hoy).
3. Kardex: líneas de salida muestran costo unitario sellado (no «—» vacío cuando hay promedio).
4. Resumen: KPI **«Valor estimado de inventario»** (se mantiene el nombre F2) con nota/tooltip de que ahora se basa en costo promedio; detalle de ítem muestra **Costo promedio** y **Último costo de compra** juntos.
5. Estados: «Sin costo» cuando la cadena resuelve a 0/null (paridad F2).

Sin subvista nueva. Sin export masivo en MVP.

## 5. Contrato API (borrador congelable)

| Cambio | Detalle |
| --- | --- |
| Shape ítem | `averageCost: string` (numeric as string) en create/update/get |
| Dashboard | Misma shape `estimatedTotalValue`; semántica documentada → prioriza avg |
| Replenishment | `estimatedUnitCost` prioriza avg |
| Kardex | Sin cambio de shape; `unitCost` poblado en salidas nuevas |
| Endpoints nuevos | Ninguno en MVP |

## 6. CA

| CA | Descripción |
| --- | --- |
| CA-F4-01 | Tras recepción con costo C y qty Q, `lastPurchaseCost = C` y `averageCost` cumple la fórmula D-F4-4 |
| CA-F4-02 | Dos recepciones concurrentes del mismo ítem no corrompen avg (lock/TX) |
| CA-F4-03 | Despacho / venta / consumo / baja / transferencia sellan `unitCost` no nulo si hay avg>0 |
| CA-F4-04 | Ajuste negativo no cambia `averageCost`; sí sella `unitCost` |
| CA-F4-05 | Dashboard «Valor estimado de inventario» usa avg en la cadena; UI «Costo promedio» + nota de transparencia; detalle muestra promedio y último compra |
| CA-F4-06 | Ítem serializado: mismo promedio a nivel ítem (sin depreciación de activo) |
| CA-F4-07 | OpenAPI + tests fórmula/concurrencia; lint/typecheck; sin PII |
| CA-F4-08 | Ningún texto de producto afirma cumplimiento DIAN/fiscal |

## 7. Fuera de alcance

FIFO/capas; promedio por bodega; job de backfill de salidas históricas; reportes exportables; DIAN; UI de «revaluar inventario».

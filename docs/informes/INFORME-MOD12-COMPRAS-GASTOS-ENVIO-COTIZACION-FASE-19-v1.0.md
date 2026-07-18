# INFORME — MOD12 Compras · Gastos de envío en cotización — Fase 19

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Ejecutores:** AI-EM-ARCH · AI-SR-FULL · AI-FE-PLATFORM
**Spec:** [2026-07-17-mod12-compras-gastos-envio-cotizacion-fase19-design.md](../specs/2026-07-17-mod12-compras-gastos-envio-cotizacion-fase19-design.md)
**Prompt:** [PROMPT Fase 19](../prompts/PROMPT-MOD12-COMPRAS-GASTOS-ENVIO-COTIZACION-FASE-19-v1.0.md)
**ADR:** Addendum [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md)

## Contexto

Las ofertas se comparaban solo por productos (`amount`). El flete podía invertir la elección.

## Cambios

### Backend
- Migración `070_add_supplier_quote_shipping_cost` (`shipping_cost NUMERIC NOT NULL DEFAULT 0`).
- DTO `shippingCost` (≥ 0, default 0).
- `addSupplierQuote` persiste flete; `amount` sigue siendo solo productos.
- `estimatedAmount` (detail + approve) = suma de `amount + shippingCost`.

### Frontend
- `QuoteShippingFields` (checkbox «Envío gratis» + monto).
- RFQ por invitación y «Nueva oferta» envían `shippingCost`.
- `QuoteComparisonPanel`: productos, envío (o «Gratis»), total landed; orden por landed.

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-19-01 Envío > 0 sin alterar amount | Implementado + unit |
| CA-19-02 Gratis → 0 + label | Implementado + RTL |
| CA-19-03 Comparación landed | Implementado + RTL |
| CA-19-04 estimatedAmount landed | Implementado |
| CA-19-05 Validación / migración | Cumplido (migrada en `tenant_iwana`) |
| CA-19-06 RFQ + Nueva oferta | Cumplido |

## Verificación

| Suite | Resultado |
| --- | --- |
| Migración tenant 070 | OK (`tenant_iwana`) |
| API purchasing.service + flow | **34/34 pass** |
| Portal RFQ + comparación + drawer | **24/24 pass** |
| `tsc` api + portal | OK |

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 / G5 | Cumplido |
| G6 / G7 | Pendiente |

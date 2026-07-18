# SPEC — MOD12 Compras · Gastos de envío en cotización — Fase 19

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Autor:** AI-EM-ARCH
**ADR:** Addendum [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md)
**Prompt:** [PROMPT Fase 19](../prompts/PROMPT-MOD12-COMPRAS-GASTOS-ENVIO-COTIZACION-FASE-19-v1.0.md)

## 1. Problema

Las ofertas se comparan solo por `amount` (productos). El flete puede invertir la elección (productos baratos + envío caro).

## 2. Objetivo

Registrar **gastos de envío** por oferta (`shippingCost`, `0` = gratis), mostrar **total landed** en comparación y usarlo en `estimatedAmount` de aprobación.

## 3. Decisiones

- Cabecera `SupplierQuote.shipping_cost` (no por línea).
- `amount` = solo productos; landed = `amount + shipping_cost`.
- UI: «Envío gratis» → `shippingCost: 0`; si no, monto ≥ 0.
- Legacy: DEFAULT 0.

## 4. CA

| CA | Descripción |
| --- | --- |
| CA-19-01 | Envío > 0 persiste; `amount` de productos intacto |
| CA-19-02 | Gratis → `shippingCost: 0` + label «Gratis» |
| CA-19-03 | Comparación: subtotal, envío, total landed |
| CA-19-04 | `estimatedAmount` = suma landed |
| CA-19-05 | shipping < 0 rechazado; migración reversible |
| CA-19-06 | Mismo control en RFQ y Nueva oferta |

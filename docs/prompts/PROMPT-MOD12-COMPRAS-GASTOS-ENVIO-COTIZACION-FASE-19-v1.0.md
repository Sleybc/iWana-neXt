# PROMPT DE EJECUCIÓN — MOD12 Compras · Gastos de envío — Fase 19

**Versión:** 1.0
**Gate:** G4 — AI-EM-ARCH
**Ejecutores:** AI-SR-FULL + AI-FE-PLATFORM
**Spec:** [2026-07-17-mod12-compras-gastos-envio-cotizacion-fase19-design.md](../specs/2026-07-17-mod12-compras-gastos-envio-cotizacion-fase19-design.md)

## Objetivo

`shippingCost` (≥ 0) en alta de oferta; comparación landed; `estimatedAmount` incluye flete.

## STOP

- No envío por línea, no prefill OC, no tokens nuevos en `@iwana/ui`.
- Migración `070` reversible.

## Backend

- `070_add_supplier_quote_shipping_cost.ts` + entidad `shippingCost`
- DTO `shippingCost: z.coerce.number().min(0)` (default 0 si se omite en legacy clients: preferir required con default 0)
- Persistencia en `addSupplierQuote`; landed en query + approve

## Frontend

- `QuoteShippingFields` + wire RFQ / Nueva oferta
- `QuoteComparisonPanel` subtotal / envío / total
- Tipos en `api-client`

## Informe

`docs/informes/INFORME-MOD12-COMPRAS-GASTOS-ENVIO-COTIZACION-FASE-19-v1.0.md`

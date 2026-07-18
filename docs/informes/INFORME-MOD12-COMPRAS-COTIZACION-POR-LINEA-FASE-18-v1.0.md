# INFORME — MOD12 Compras · Cotización por línea — Fase 18

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Ejecutores:** AI-EM-ARCH (ADR/spec/prompt) · AI-SR-FULL (backend) · AI-FE-PLATFORM (frontend)
**ADR:** [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md)
**Spec:** [2026-07-17-mod12-compras-cotizacion-por-linea-fase18-design.md](../specs/2026-07-17-mod12-compras-cotizacion-por-linea-fase18-design.md)
**Prompt:** [PROMPT Fase 18](../prompts/PROMPT-MOD12-COMPRAS-COTIZACION-POR-LINEA-FASE-18-v1.0.md)
**Antecede:** [Fase 17](INFORME-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md)

## Contexto

Registrar oferta solo permitía un **monto total**. Con N productos no había precio unitario por ítem. ADR-051 lo defería; esta fase introduce `supplier_quote_lines`.

## Cambios

### Backend
- Migración tenant `069_create_supplier_quote_lines` (reversible).
- Entidad `SupplierQuoteLine` + registro en module/runner.
- `AddSupplierQuoteSchema.lines[]`; si la PR tiene líneas, `lines` obligatorio; `amount` derivado.
- Detail: `quotes[].lines`.
- Tests unit de persistencia/derivación.

### Frontend
- `SupplierQuoteLinesEditor` (tabla qty readonly + unitCost + subtotal + total).
- RFQ por invitación y «Nueva oferta» usan el editor cuando hay líneas.
- `QuoteComparisonPanel` desglose; `AwardLinesPanel` muestra unitCost de la línea (sin prefill OC).

## Criterios de aceptación

| CA | Estado |
| --- | --- |
| CA-18-01 Persistencia lines + amount suma | Implementado + unit |
| CA-18-02 Parcial ≥1 línea | Implementado (UI omite unitCost vacío) |
| CA-18-03 Línea ajena / unitCost inválido | Implementado + unit (línea ajena) + zod |
| CA-18-04 Form RFQ + rfqInvitationId + lines | Implementado + RTL |
| CA-18-05 Comparación con desglose | Implementado + RTL |
| CA-18-06 Award muestra unitCost | Implementado |
| CA-18-07 Migración reversible / OpenAPI DTO / español | Cumplido |

## Verificación

| Suite | Resultado |
| --- | --- |
| `@iwana/db` build | OK |
| API `purchasing.service` + `purchasing.flow.integration` | **33/33 pass** |
| Portal editor + RFQ + comparación + drawer | **25/25 pass** |
| `tsc` api + portal | OK |

## Protocolo

| Gate | Estado |
| --- | --- |
| G4 | Cumplido (prompt Fase 18) |
| G5 | Cumplido (este informe) |
| G6 | Pendiente review formal AI-SR-QA / PROD-UX |
| G7 | Pendiente |

## Fuera de alcance (consciente)

- Prefill `unitCost` en OC.
- Editar oferta ya registrada.
- Portal proveedor / envío automático.

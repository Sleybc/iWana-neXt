# SPEC — MOD12 Compras · Cotización por línea de solicitud — Fase 18

**Versión:** 1.0
**Estado:** Diseño aprobado — habilita G4/G5
**Fecha:** 2026-07-17
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Autor:** AI-EM-ARCH
**ADR:** [ADR-053](../adrs/ADR-053-Supplier-Quote-Lines.md)
**Prompt:** [PROMPT Fase 18](../prompts/PROMPT-MOD12-COMPRAS-COTIZACION-POR-LINEA-FASE-18-v1.0.md)
**Antecede:** [Fase 17 — Registro oferta por invitación](../informes/INFORME-MOD12-COMPRAS-RFQ-REGISTRO-OFERTA-FASE-17-v1.0.md)

## 1. Problema

Al registrar una oferta (RFQ o manual) solo hay un campo **Monto**. Con N productos de la solicitud no se captura precio unitario por ítem.

## 2. Objetivo

Permitir registrar ofertas con **líneas** ligadas a `purchaseRequestLineId` + `unitCost`, total derivado, en RFQ y en «Nueva oferta». Mostrar desglose en comparación y `unitCost` de ayuda en adjudicación.

## 3. Alcance

**Dentro:** migración `supplier_quote_lines`, contrato API, editor UI compartido, comparación, award (lectura), tests, OpenAPI, informe.

**Fuera:** prefill `unitCost` en OC; editar oferta ya registrada; portal proveedor; tokens nuevos en `@iwana/ui`.

## 4. UX

- Editor tabla: producto | cantidad (readonly) | costo unitario | subtotal.
- Línea con unitCost vacío = no incluida (parcial OK si ≥1 válida).
- Total oferta = suma subtotales (readonly).
- Misma UI en form RFQ por invitación y «Nueva oferta».
- Comparación: total + desglose; legacy solo total.
- Award: al vincular quote, mostrar unitCost de esa línea si existe.

## 5. Contrato

```
POST /purchasing/requests/:id/quotes
{
  partyRefId, quoteNumber, currency,
  rfqInvitationId?,
  lines?: [{ purchaseRequestLineId, unitCost }]  // obligatorio si PR tiene líneas
  amount?: number  // legacy si PR sin líneas; ignorado/derivado si hay lines
}
→ 201 SupplierQuote + lines[]
```

## 6. CA

| CA | Descripción |
| --- | --- |
| CA-18-01 | PR con N líneas → form muestra filas; save persiste lines y amount = suma |
| CA-18-02 | Parcial (≥1 línea) válida |
| CA-18-03 | Línea ajena → 400; unitCost ≤ 0 → validación |
| CA-18-04 | Form RFQ por invitación usa editor + rfqInvitationId |
| CA-18-05 | Comparación con desglose; legacy solo total |
| CA-18-06 | Award muestra unitCost de quote-line (sin escribir OC) |
| CA-18-07 | Migración reversible; OpenAPI; español; sin PII |

## 7. Protocolo

- G4: prompt Fase 18 · G5: SR-FULL + FE-PLATFORM · G6: SR-QA · G7: EM-ARCH/CTO

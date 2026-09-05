# INFORME — MOD12 Compras · Corregir cotización registrada

**Versión:** 1.0
**Estado:** Implementado — pendiente G6 formal / G7 CTO
**Fecha:** 2026-09-04
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ
**Spec:** [2026-09-04-mod12-compras-corregir-cotizacion-design.md](../specs/2026-09-04-mod12-compras-corregir-cotizacion-design.md)
**Relacionado:** [INFORME Fase 25](./INFORME-MOD12-COMPRAS-COTIZACION-IMPUESTOS-FASE-25-v1.0.md)

## Contexto

Una cotización registrada no se podía corregir: el unique por invitación devolvía 409 en un segundo POST. El operador necesita ajustar montos, envío o tributos **mientras la ronda sigue abierta y la solicitud no está aprobada**.

## Contrato

`PATCH /purchasing/requests/:id/quotes/:quoteId` — mismos campos económicos que el alta, sin proveedor ni invitación. El servidor recalcula neto y reemplaza líneas y snapshot fiscal. El segundo POST a la misma invitación sigue en 409.

## Gating

Editable si la solicitud está en `DRAFT`, `PENDING_QUOTES` o `PENDING_APPROVAL`; si hay RFQ, la ronda está en `SENT` o `RECEIVING`; y la cotización no está adjudicada.

## UX

- Invitación respondida: **Modificar cotización** → formulario prellenado → **Guardar cambios**.
- Cotización manual (sin ronda): la misma acción en la comparación, incluido `PENDING_APPROVAL`.
- Vocabulario visible: Modificar cotización, Guardar cambios. Sin `PATCH`, `quoteId` ni `RESPONDED`.

## Evidencia

- API: `purchasing.service.spec.ts` (éxito, aprobada, RFQ cerrada, adjudicada, 404)
- OpenAPI/RBAC: `purchasing.swagger.spec.ts`, `inventory-tax-boundary.spec.ts`
- Portal: `RfqInvitationsPanel.spec.tsx`, `QuoteComparisonPanel.spec.tsx`, `PurchaseRequestWorkbenchDrawer.spec.tsx`, `quote-form-hydrate.spec.ts`

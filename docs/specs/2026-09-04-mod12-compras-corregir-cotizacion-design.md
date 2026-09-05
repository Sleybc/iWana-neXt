# SPEC — MOD12 Compras · Corregir cotización registrada

**Versión:** 1.0
**Estado:** Implementado
**Fecha:** 2026-09-04
**Módulo:** MOD12 Inventario / SCM — Compras / RFQ

## Objetivo

Permitir corregir una cotización ya guardada **mientras la ronda siga abierta y la solicitud no esté aprobada**. Una sola oferta por invitación (unique intacto). El segundo POST sigue en 409.

## Contrato

`PATCH /purchasing/requests/:requestId/quotes/:quoteId`

Cuerpo: mismos campos económicos que el alta (`quoteNumber`, `amount`/`lines`, `shippingCost`, `shippingArrangement`, `currency`, `taxes`). No se cambia proveedor ni invitación.

El servidor recalcula tributos y neto; reemplaza líneas y snapshot fiscal.

## Gating

Se puede corregir si:

- la solicitud está en `DRAFT`, `PENDING_QUOTES` o `PENDING_APPROVAL`
- si la cotización está ligada a RFQ, la ronda está en `SENT` o `RECEIVING`
- no hay adjudicación que use esa cotización

Si la ronda se cerró o la solicitud se aprobó: solo lectura.

## UX

- Invitación respondida: **Modificar cotización**. Formulario prellenado. Botón **Guardar cambios**.
- Cotización manual (sin ronda): la misma acción en la comparación, con el mismo gating.
- Vocabulario visible: Modificar cotización, Guardar cambios. Sin `PATCH`, `quoteId` ni `RESPONDED`.

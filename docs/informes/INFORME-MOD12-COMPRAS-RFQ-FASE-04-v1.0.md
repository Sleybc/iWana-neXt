# INFORME — MOD12 Compras RFQ Fase 04 v1.0

**Estado:** Implementado (pendiente merge)  
**Fecha:** 2026-07-11  
**ADR:** ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones  
**Prompt:** PROMPT-MOD12-COMPRAS-RFQ-FASE-04-v1.0.md  

## Resumen

Se implementó la capa RFQ (solicitud de cotización) en MOD12 Compras: persistencia tenant 059/060, servicios backend, endpoints REST, PDF descargable y pestaña RFQ en el workbench del portal.

## Entregables

### Shared / Database
- Enums `PurchaseRfqStatus`, `PurchaseRfqInvitationStatus`.
- Entidades `PurchaseRfq`, `PurchaseRfqInvitation`; columnas `rfq_id` / `rfq_invitation_id` en `SupplierQuote`.
- Migraciones tenant `059_create_purchase_rfq`, `060_link_supplier_quotes_to_rfq` (aplicadas en dev).

### Backend
- `RfqService`: crear, invitar (idempotente), enviar, declinar, cerrar, vincular cotización.
- `RfqPdfService` con `pdfkit`.
- Endpoints en `PurchasingController` bajo `/purchasing/rfqs/*` y `POST /requests/:id/rfq`.
- Extensión de `addSupplierQuote` con `rfqInvitationId` opcional (no auto-mueve a aprobación en flujo RFQ).
- Detalle de solicitud incluye RFQ activa (`PurchasingQueryService`).

### Portal
- Pestaña **Cotización** en workbench.
- `SupplierMultiPicker`, `RfqInvitationsPanel`, labels `RFQ_INVITATION_STATUS_LABELS`.
- Cliente API + descarga PDF.

### Tests
- Unit: `rfq.service.spec.ts`, `rfq-pdf.service.spec.ts`.
- HTTP: `rfq.http.integration.spec.ts`.
- Specs existentes actualizados (purchasing, inventory module, controller).
- E2E: flujo RFQ en `portal-inventory-scm.spec.ts` (crear → invitar → enviar → PDF).

## Verificación

| Comando | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | OK (059/060) |
| `pnpm --filter @iwana/api typecheck` | OK |
| `pnpm --filter @iwana/portal typecheck` | OK |
| Jest inventario (módulo) | 123 tests OK |
| E2E `portal-inventory-scm.spec.ts` | 19/19 OK (~28 s) |

## Flujo validado (API)

1. `POST /requests/:id/rfq` → RFQ `DRAFT`
2. `POST /rfqs/:id/invitations` → invitaciones `INVITED`
3. `POST /rfqs/:id/send` → RFQ `SENT`, PR `PENDING_QUOTES`
4. `POST /requests/:id/quotes` con `rfqInvitationId` → invitación `RESPONDED`, RFQ `RECEIVING`
5. `POST /rfqs/:id/close` → invitaciones pendientes `EXPIRED`, PR `PENDING_APPROVAL`
6. `GET /rfqs/:id/pdf` → PDF descargable

## E2E — alineación suite inventario SCM

Tras la Fase 04 se re-ejecutó `e2e/tests/portal-inventory-scm.spec.ts`. Los fallos previos (16/19) eran **drift test↔UI** (labels, combobox vs input, pestañas del compositor), no regresión RFQ. Se actualizó el spec con selectores alineados a la UI vigente; la suite completa quedó **19/19 verde** (2026-07-11).

## Pendiente / fuera de alcance (ADR-051)

- Cotización por línea, matriz comparativa, envío automático de correo, portal proveedor.

## Notas

- Incluye en la misma rama Fase 03 (compra mostrador, ADR-050).
- No se añadieron estados nuevos a `PurchaseRequestStatus`.
- UX menor: toasts RFQ pueden perderse al recargar detalle del workbench; el E2E valida estado persistente, no toast.

## Remedación auditoría arquitectónica (2026-07-11)

Ver `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-AUDITORIA-ARCH-v1.0.md`. Cambios: lock idempotente mostrador, 409 en carrera RFQ, migración `061` trazabilidad actores, nota ADR-050 enum `down()`.

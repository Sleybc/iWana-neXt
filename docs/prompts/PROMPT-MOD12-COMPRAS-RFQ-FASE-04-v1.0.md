# PROMPT - MOD12 Compras RFQ (Solicitud de Cotizacion) Fase 04

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-11
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Aprobado por:** CTO
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-FASE-04-v1.0.md`

---

## 1. Objetivo exacto

Implementar la capa de RFQ (Solicitud de cotizacion) en MOD12 Compras: crear una RFQ desde una `PurchaseRequest`, invitar N proveedores con seguimiento (invitado/respondio/declino), cerrar la ronda, vincular la captura de cotizacion existente a la invitacion, y exportar la solicitud como PDF descargable. Conforme a ADR-051 y al plan Fase 04.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`
- `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md`
- `docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/plans/2026-07-11-mod12-compras-rfq-fase-04.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/informes/INFORME-MOD12-INVENTARIO-SCM-DEFINICION-v1.0.md`
- `.github/instructions/api.instructions.md`
- `.github/instructions/database.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/portal.instructions.md`
- `.github/instructions/testing.instructions.md`
- Referencia de reuso: `apps/api/src/modules/inventory/services/purchasing.service.ts`, `purchasing-query.service.ts`; `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`, `SupplierPicker.tsx`, `QuoteComparisonPanel.tsx`, `purchase-workbench.ts`, `inventory-labels.ts`.

## 3. Alcance exacto

### Si entra

- Enums `PurchaseRfqStatus`, `PurchaseRfqInvitationStatus`.
- Entidades `PurchaseRfq`, `PurchaseRfqInvitation`; alter de `SupplierQuote` (`rfq_id`, `rfq_invitation_id`).
- Migraciones tenant `059` (RFQ + invitaciones) y `060` (link supplier_quotes), reversibles.
- `RfqService` (crear, invitar idempotente, enviar, responder via cotizacion, declinar, cerrar, expirar).
- `RfqPdfService` con `pdfkit` (Nivel 2) + endpoint de descarga.
- Endpoints `/purchasing/rfqs/*` y `/purchasing/requests/:id/rfq`; extension de captura de cotizacion con `rfqInvitationId`.
- Portal: pestana RFQ con `SupplierMultiPicker`, `RfqInvitationsPanel` (seguimiento) y descarga PDF; vocabulario en espanol.
- OpenAPI, tests unit/integracion/E2E, textos en espanol.

### No entra

- Cotizacion por linea / precio unitario por item (ADR posterior).
- Matriz de comparacion por item.
- Adjudicacion con precio heredado / prefill de `unitCost` en OC.
- Envio automatico de correo a proveedores.
- Portal de proveedor / autocotizacion.
- Nuevos estados en `PurchaseRequestStatus`.

## 4. Restricciones no negociables

1. RFQ dentro de MOD12; sin bounded context nuevo.
2. No agregar estados a `PurchaseRequestStatus`; `PENDING_QUOTES` se reinterpreta.
3. Proveedor por `party_ref_id` (MOD08 Parties); sin FK cross-module; no exponer `partyRefId` en UI.
4. No romper la captura de cotizacion existente (retrocompat: `rfq_id`/`rfq_invitation_id` nullable; cotizaciones manuales siguen validas).
5. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`.
6. Idempotencia en invitar/enviar/cerrar; unico `(rfq_id, party_ref_id)` y `(rfq_invitation_id)`.
7. El PDF no envia nada al exterior; no incluye PII innecesaria ni datos sensibles.
8. Migraciones reversibles `up()`/`down()`; verificar numeracion libre antes de crear.
9. No romper endpoints existentes; actualizar cliente, OpenAPI y tests.

## 5. Entregables tecnicos obligatorios

### Shared
- Enums `PurchaseRfqStatus`, `PurchaseRfqInvitationStatus` + barrels.

### Database
- Entidades `PurchaseRfq`, `PurchaseRfqInvitation`; alter `SupplierQuote`; migraciones `059` y `060`; registro en `data-source`.

### Backend (apps/api)
- `RfqService`, `RfqPdfService`; DTOs Zod; endpoints en `purchasing.controller.ts`; dependencia `pdfkit`; extension de captura de cotizacion; registro en `inventory.module.ts`.

### Frontend (apps/portal)
- `SupplierMultiPicker`, `RfqInvitationsPanel`; pestana RFQ en el workbench; `getPurchaseNextAction` extendido; `RFQ_INVITATION_STATUS_LABELS`; cliente API + descarga PDF.

### Tests
- Unit `RfqService` (todas las transiciones, idempotencia, multi-tenant), render PDF, integracion HTTP del flujo completo, E2E portal. Cobertura core >= 80%.

## 6. Criterio stop/go

- **GO otorgado:** ADR-051 Aprobado por CTO (2026-07-11). Ejecucion de la Fase 04 habilitada.
- **STOP** y escalar a AI-EM-ARCH si aparece necesidad de: cotizacion por linea, envio automatico de correo, o cambio en la maquina de estados de la solicitud.

## 7. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core >= 80%.
- Migraciones aplican y revierten.
- OpenAPI actualizada; sin PII/secretos en logs ni en el PDF.
- Flujo verificado extremo a extremo: crear RFQ -> invitar -> enviar -> registrar cotizacion (invitacion `RESPONDED`) -> cerrar; descarga de PDF valida.
- Informe vivo y checklist del modulo actualizados al cierre.

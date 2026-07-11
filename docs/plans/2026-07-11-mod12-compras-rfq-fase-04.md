# MOD12 Compras RFQ (Solicitud de Cotizacion) Fase 04 Implementation Plan

**Estado:** Aprobado
**Aprobado por:** CTO
**ADR:** docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
**Prompt:** docs/prompts/PROMPT-MOD12-COMPRAS-RFQ-FASE-04-v1.0.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar la capa de RFQ a MOD12 Compras: crear una solicitud de cotizacion desde una `PurchaseRequest`, invitar N proveedores con seguimiento (invitado/respondio/declino), cerrar la ronda, y exportar la solicitud como PDF descargable (Nivel 2). No incluye cotizacion por linea, matriz de comparacion por item ni envio automatico de correo.

**Architecture:** Todo dentro de `apps/api/src/modules/inventory` y `apps/portal/src/components/inventory`, sin nuevo bounded context. RFQ es una sub-maquina de estados desacoplada de `PurchaseRequestStatus`; los proveedores se referencian por `party_ref_id` (MOD08 Parties) sin FK cross-module. La captura de cotizacion existente se vincula opcionalmente a una invitacion. El PDF se genera server-side con `pdfkit`, sin envio al exterior.

**Tech Stack:** NestJS, TypeScript strict, TypeORM, PostgreSQL tenant schema, Zod, OpenAPI, pdfkit, Next.js App Router, Jest, Supertest, Playwright, pnpm.

**Precondicion:** ADR-051 en estado Aprobado por CTO. Numeracion de migraciones tenant: usar los siguientes numeros libres (se asume `058` ocupado por ADR-050 compra de mostrador; RFQ toma `059` y `060`). Verificar el numero mas alto real antes de crear.

---

## File Map

- Create `packages/shared/src/enums/inventory/purchase-rfq-status.enum.ts`.
- Create `packages/shared/src/enums/inventory/purchase-rfq-invitation-status.enum.ts`.
- Modify `packages/shared/src/enums/inventory/index.ts`.
- Create `packages/database/src/entities/purchase-rfq.entity.ts`.
- Create `packages/database/src/entities/purchase-rfq-invitation.entity.ts`.
- Modify `packages/database/src/entities/supplier-quote.entity.ts`.
- Modify `packages/database/src/entities/index.ts` (o `data-source.ts`) para registrar entidades.
- Create `packages/database/src/migrations/tenant/059_create_purchase_rfq.ts`.
- Create `packages/database/src/migrations/tenant/060_link_supplier_quotes_to_rfq.ts`.
- Create `apps/api/src/modules/inventory/services/rfq.service.ts`.
- Create `apps/api/src/modules/inventory/services/rfq-pdf.service.ts`.
- Modify `apps/api/src/modules/inventory/services/purchasing.service.ts` (vincular cotizacion a invitacion).
- Modify `apps/api/src/modules/inventory/purchasing.controller.ts`.
- Modify `apps/api/src/modules/inventory/dto/index.ts`.
- Modify `apps/api/src/modules/inventory/inventory.module.ts` (proveedores nuevos).
- Modify `apps/api/package.json` (dependencia `pdfkit` + tipos).
- Create/Update purchasing tests en `apps/api/src/modules/inventory/tests/*`.
- Modify `apps/portal/src/lib/api-client.ts`.
- Create `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx`.
- Create `apps/portal/src/components/inventory/SupplierMultiPicker.tsx`.
- Modify `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx` (pestana RFQ).
- Modify `apps/portal/src/components/inventory/purchase-workbench.ts` (tab + next action + labels).
- Modify `apps/portal/src/components/inventory/inventory-labels.ts` (`RFQ_INVITATION_STATUS_LABELS`).
- Update `e2e/tests/portal-inventory-scm.spec.ts`.
- Update phase report/checklist en `docs/informes/` y `docs/quality/`.

## Task 1: Contratos compartidos y persistencia

**Files:**
- Create: `packages/shared/src/enums/inventory/purchase-rfq-status.enum.ts`
- Create: `packages/shared/src/enums/inventory/purchase-rfq-invitation-status.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`
- Create: `packages/database/src/entities/purchase-rfq.entity.ts`
- Create: `packages/database/src/entities/purchase-rfq-invitation.entity.ts`
- Modify: `packages/database/src/entities/supplier-quote.entity.ts`
- Create: `packages/database/src/migrations/tenant/059_create_purchase_rfq.ts`
- Create: `packages/database/src/migrations/tenant/060_link_supplier_quotes_to_rfq.ts`

- [ ] **Step 1: Verificar numeracion de migraciones tenant y entidades actuales**
  - Confirmar el numero mas alto en `packages/database/src/migrations/tenant/` y ajustar `059`/`060` si hay colision.
  - Revisar `supplier-quote.entity.ts` y como se registran entidades en `@iwana/db`.
- [ ] **Step 2: Crear enums `PurchaseRfqStatus` y `PurchaseRfqInvitationStatus`** y exportarlos en el barrel.
- [ ] **Step 3: Crear entidades `PurchaseRfq` y `PurchaseRfqInvitation`** con columnas, indices y unicos de ADR-051; tenant-aware.
- [ ] **Step 4: Modificar `SupplierQuote`** agregando `rfq_id` y `rfq_invitation_id` nullable + FKs.
- [ ] **Step 5: Migracion `059`** crea enums PG, tablas `purchase_rfqs` y `purchase_rfq_invitations`, indices, unicos parciales y FKs; `up()`/`down()` reversibles e idempotentes.
- [ ] **Step 6: Migracion `060`** ALTER `supplier_quotes` add `rfq_id`, `rfq_invitation_id` + FKs + unico parcial; reversible.
- [ ] **Step 7: Registrar entidades en `data-source`** y compilar `@iwana/db`; correr `migration:tenant:run`.

## Task 2: RfqService y vinculo con cotizacion

**Files:**
- Create: `apps/api/src/modules/inventory/services/rfq.service.ts`
- Modify: `apps/api/src/modules/inventory/services/purchasing.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`

- [ ] **Step 1: DTOs Zod** `CreateRfqSchema`, `InviteSuppliersSchema` (partyRefIds uuid[].min(1)), `DeclineInvitationSchema`, y extension de la captura de cotizacion con `rfqInvitationId` opcional.
- [ ] **Step 2: `RfqService.createFromRequest`** genera `rfq_number` (patron `generateSequentialNumber`), estado `DRAFT`, snapshot de contexto de la solicitud.
- [ ] **Step 3: `RfqService.invite`** idempotente (unico `(rfq_id, party_ref_id)`), estado `INVITED`.
- [ ] **Step 4: `RfqService.send`** `DRAFT -> SENT`, PR -> `PENDING_QUOTES`, lineas `OPEN -> PENDING_QUOTE`; idempotente.
- [ ] **Step 5: `RfqService.decline` / `close`** transiciones idempotentes; al cerrar, invitaciones sin respuesta -> `EXPIRED`, PR -> `PENDING_APPROVAL`.
- [ ] **Step 6: Vincular cotizacion a invitacion** en `purchasing.service.ts`: si llega `rfqInvitationId`, marcar invitacion `RESPONDED` y RFQ `SENT -> RECEIVING`; validar pertenencia tenant/rfq.
- [ ] **Step 7: Unit tests** de cada transicion, idempotencia y validaciones multi-tenant.

## Task 3: RfqPdfService (Nivel 2)

**Files:**
- Create: `apps/api/src/modules/inventory/services/rfq-pdf.service.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Agregar `pdfkit`** (+ `@types/pdfkit`) a `apps/api`.
- [ ] **Step 2: `RfqPdfService.render(rfqId)`** arma el PDF: encabezado con datos del tenant, numero de RFQ, fecha limite, proveedor destino, tabla de lineas (item, cantidad, unidad). Devuelve buffer/stream. Sin PII innecesaria.
- [ ] **Step 3: Test de render** (genera buffer no vacio, tipo `application/pdf`).

## Task 4: Endpoints y OpenAPI

**Files:**
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: Endpoints** `POST /requests/:id/rfq`, `POST /rfqs/:rfqId/invitations`, `POST /rfqs/:rfqId/send`, `POST /rfqs/:rfqId/invitations/:invId/decline`, `POST /rfqs/:rfqId/close`, `GET /rfqs/:rfqId`, `GET /rfqs/:rfqId/pdf`. Roles ADMIN/NOC/SUPPORT, Zod, `@ApiOperation`.
- [ ] **Step 2: Endpoint PDF** responde con `Content-Type: application/pdf` y `Content-Disposition` de descarga.
- [ ] **Step 3: Registrar servicios** en el modulo; actualizar OpenAPI.
- [ ] **Step 4: Integracion HTTP** del flujo completo crear -> invitar -> enviar -> responder -> cerrar, y descarga PDF.

## Task 5: Portal (pestana RFQ + seguimiento + PDF)

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Create: `apps/portal/src/components/inventory/SupplierMultiPicker.tsx`
- Create: `apps/portal/src/components/inventory/RfqInvitationsPanel.tsx`
- Modify: `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`
- Modify: `apps/portal/src/components/inventory/purchase-workbench.ts`
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`

- [ ] **Step 1: Cliente API** para los endpoints RFQ + descarga de PDF.
- [x] **Step 2: `SupplierMultiPicker`** (variante multi de `SupplierPicker`) con checkbox y chips — implementado en `SupplierMultiPicker.tsx`, consumido por `RfqInvitationsPanel.tsx`.
- [x] **Step 3: `RfqInvitationsPanel`** tablero de seguimiento con badges icono+texto (invitado/respondio/declino/vencido) y boton "Descargar PDF".
- [x] **Step 4: Pestana RFQ** en el workbench (`purchase-workbench.ts`: tab `rfq`, labels, extender `getPurchaseNextAction`).
- [x] **Step 5: Vocabulario** `RFQ_INVITATION_STATUS_LABELS` en espanol; no exponer enums crudos.
- [x] **Step 6: E2E** del flujo RFQ en `portal-inventory-scm.spec.ts` (suite SCM 19/19).

## Task 6: Cierre

- [ ] **Step 1:** Lint + typecheck + tests; cobertura core >= 80%.
- [ ] **Step 2:** Verificacion extremo a extremo del flujo RFQ y descarga PDF.
- [ ] **Step 3:** Actualizar informe vivo y checklist en `docs/informes/` y `docs/quality/`.

# PROMPT - MOD12 Compras: Cierre del flujo nucleo (Fase 06)

**Version:** 1.0
**Estado:** Activo — Ejecución autorizada
**Fecha:** 2026-07-14
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Aprobado por:** CTO (2026-07-14)
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL) + Frontend Platform (AI-FE-PLATFORM)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-COMPRAS-CIERRE-FASE-06-v1.0.md`

---

## 1. Objetivo exacto

Dejar el flujo "Trabajar solicitud" (`/dashboard/inventory?tab=purchasing`) **cerrable de punta a punta** desde el portal: (a) cablear en UI la **adjudicacion por linea** (backend ya existente), (b) implementar **rechazo y cancelacion** de solicitud (backend + UI) con cascada que cancela la RFQ activa, y (c) afirmar estados terminales + pulido de las mismas pantallas. Sin abrir capacidades nuevas fuera de este alcance. Conforme a `PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0` §Fase 06.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`, `docs/roles/Protocolo_Colaboracion_Multiagente_v1.md`
- `docs/prds/PRD-MOD12-COMPRAS-CIERRE-FLUJO-v1.0.md` (este PRD)
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md`, `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `.github/instructions/api.instructions.md`, `database.instructions.md`, `frontend.instructions.md`, `portal.instructions.md`, `testing.instructions.md`
- **Skills a leer y aplicar** (`.agents/skills/`): `nestjs-expert`, `database-migration`, `postgresql`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `core-components`, `tailwind-patterns`, `i18n-localization`, `wcag-audit-patterns`, `testing-patterns`, `e2e-testing-patterns`, `backend-security-coder`, `frontend-security-coder`.
- **Referencia de reuso — backend:** `apps/api/src/modules/inventory/services/purchasing.service.ts` (`approvePurchaseRequest`, `createLineAwards`, `requirePurchaseRequest`, helper `withTransaction`), `purchasing-query.service.ts` (`getRequestDetail`), `rfq.service.ts` (`close`, `ACTIVE_RFQ_STATUSES`), `purchasing-policy.service.ts` (`validateLineAward`), `purchasing.controller.ts`, `dto/index.ts`.
- **Referencia de reuso — datos:** `packages/database/src/entities/purchase-request.entity.ts`, `packages/database/src/migrations/tenant/061_add_purchase_rfq_actor_refs.ts` (patron de migracion aditiva), `packages/database/src/migrations/tenant/runner.ts` (registro en `TENANT_MIGRATIONS`).
- **Referencia de reuso — portal:** `apps/portal/src/components/inventory/PurchaseRequestWorkbenchDrawer.tsx`, `purchase-workbench.ts`, `QuoteComparisonPanel.tsx`, `RfqInvitationsPanel.tsx`, `SupplierPicker.tsx`, `inventory-labels.ts`, `InventoryClient.tsx`; `apps/portal/src/lib/api-client.ts` (`purchasingApi`, tipos `PurchaseRequestDetailRecord`, `PurchaseRequestLineAwardRecord`).
- **Enums:** `packages/shared/src/enums/inventory/*` (`PurchaseRequestStatus`, `PurchaseRequestLineStatus`, `PurchaseRfqStatus`, `PurchaseRfqInvitationStatus`).

## 3. Alcance exacto

### 3.1 Adjudicacion en UI (solo frontend — backend ya listo)

- Agregar pestana **"Adjudicacion"** (`awards`) al workbench, ubicada entre `approval` y `orders`, en `purchase-workbench.ts` (`PURCHASE_WORKBENCH_TAB_LABELS` + tipo `PurchaseWorkbenchTab`).
- Extender `getPurchaseNextAction` para sugerir `awards` cuando `status === APPROVED` y existan lineas awardables sin adjudicar.
- Nuevo componente `AwardLinesPanel.tsx` (patron de `QuoteComparisonPanel.tsx` / `RfqInvitationsPanel.tsx`): por cada linea awardable de `detail.lines` (con `inventoryItemId`), una fila con `SupplierPicker` (sugerir proveedores presentes en `detail.quotes`), cantidad (prellenada a `quantityRequested`; para `requestType ≠ PROJECT` bloqueada a la cantidad total, coherente con `PurchasingPolicyService.validateLineAward`), enlace opcional a `supplierQuoteId`, y notas. Renderizar `detail.awards` existentes y el estado de linea `AWARDED`.
- Envio via `purchasingApi.createAwards(requestId, { awards: [...] })` (ya existe). Nuevo handler `handleCreateAwards` en `InventoryClient.tsx` (junto a `handleApproveRequest`) que refresca el detalle. Boton "Adjudicar lineas" en el footer del drawer cuando `activeTab === 'awards'` y hay adjudicaciones validas pendientes.

### 3.2 Rechazo / Cancelacion (backend + frontend)

**Backend**
- Migracion tenant `067_add_purchase_request_resolution.ts` (aditiva, reversible): `purchase_requests` + `resolution_reason TEXT NULL`, `resolved_by_user_id UUID NULL`. Registrar la clase en `runner.ts` (`TENANT_MIGRATIONS`, tras `066`). Actualizar `purchase-request.entity.ts` con las dos columnas.
- DTOs Zod + clases Nest en `dto/index.ts`: `RejectPurchaseRequestSchema { reason: string ≥10 }` y `CancelPurchaseRequestSchema { reason: string ≥5 }`.
- `RfqService.cancelActiveForRequest(manager, tenantId, requestId, actor)`: si hay RFQ activa (`ACTIVE_RFQ_STATUSES`), pasarla a `PurchaseRfqStatus.CANCELLED` (setear `closedAt`/`closedByUserId`) y sus invitaciones `INVITED` a `PurchaseRfqInvitationStatus.CANCELLED`. Opera sobre el `EntityManager` del llamante.
- `PurchasingService.rejectPurchaseRequest` y `cancelPurchaseRequest`, con un helper privado comun `resolvePurchaseRequest`:
  - Reject: permitido desde `PENDING_QUOTES`/`PENDING_APPROVAL` → `REJECTED`.
  - Cancel: permitido desde `DRAFT`/`PENDING_QUOTES`/`PENDING_APPROVAL`/`APPROVED` → `CANCELLED`. `BadRequestException` en espanol si el estado no lo permite.
  - Ambos: cancelan la RFQ activa; marcan lineas **no comprometidas** (distintas de `ORDERED`/`RECEIVED`/`PARTIALLY_RECEIVED`) al estado de linea correspondiente (`REJECTED`/`CANCELLED`); setean `resolutionReason`/`resolvedByUserId`/`updatedAt`. Patron `runInTenantSchema` + `withTransaction` + `requirePurchaseRequest`.
- `purchasing.controller.ts`: `POST requests/:id/reject` y `POST requests/:id/cancel`, `@Roles(ADMIN, NOC, SUPPORT)`, con `@ApiOperation` (OpenAPI).

**Frontend**
- `purchasingApi.rejectRequest(id, dto)` y `cancelRequest(id, dto)` + tipos DTO en `api-client.ts`.
- Handlers `handleRejectRequest` / `handleCancelRequest` en `InventoryClient.tsx`.
- Botones contextuales en el footer del drawer: "Rechazar" (visible en `PENDING_*`) y "Cancelar solicitud" (visible mientras no sea terminal ni `CONVERTED_TO_PO`), cada uno con textarea de motivo (patron del `exceptionReason` ya presente) y validacion minima antes de habilitar el submit.

### 3.3 Estados terminales y pulido

- `getPurchaseNextAction`: afirmacion para `REJECTED`/`CANCELLED` y para `CONVERTED_TO_PO` con todo recibido; no devolver "siguiente paso" fantasma.
- Moneda seleccionable (`Select` con lista controlada `COP`/`USD`/`EUR`, `COP` por defecto) en el submit de cotizacion (`PurchaseRequestWorkbenchDrawer.tsx`) y en creacion de RFQ (`RfqInvitationsPanel.tsx`); constante compartida en `inventory-labels.ts`.
- Motivo de declinacion de invitacion editable (textarea) en `RfqInvitationsPanel.tsx`.
- Nombre real del proveedor en invitaciones RFQ: enriquecer las invitaciones en `getRequestDetail` con `displayName` via `SupplierPartyPort` (o resolucion en cliente si evita N llamadas); renderizar en `RfqInvitationsPanel.tsx`.
- Fix N+1 en `purchasing-query.service.ts`: cargar `lines` y luego consultar awards con `where: { tenantId, purchaseRequestLineId: In(lineIds) }` en vez de traer todos los awards del tenant y filtrar en memoria.

### No entra

- Edicion de solicitud, ciclo de vida de OC (Fase 07); reabastecimiento (Fase 08); metricas de proveedor (Fase 09).
- Rol RBAC nuevo; score de proveedor; cualquier migracion adicional a `067`.

## 4. Restricciones no negociables

1. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`; tenant desde JWT; nunca desde input.
2. Boundaries Modulith: Compras no accede a tablas de otros modulos; identidad de proveedor solo via `SupplierPartyPort`.
3. Migracion `067` **aditiva y reversible** (`up`/`down`); numeracion `067` verificada libre; registrada en `runner.ts`.
4. Toda operacion CUD auditada por `AuditInterceptor`; rechazo/cancelacion persisten actor y motivo; sin PII/secretos en logs.
5. `@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT)` (miembros del enum, no literales).
6. Respetar la regla de adjudicacion parcial vigente (`validateLineAward`): no relajarla en esta fase.
7. Textos visibles y comentarios de negocio en espanol, sentence case; sin enums crudos ni `partyRefId` en UI; contraste AA (`iwana-secondary-700` sobre blanco).
8. No romper el flujo de recepcion vigente ni la generacion de OC existente; actualizar cliente, OpenAPI y tests.
9. No introducir dependencias nuevas ni patrones avanzados (CQRS/eventos) — fuera de baseline.

## 5. Entregables tecnicos obligatorios

- **Database:** migracion `067`; entidad `PurchaseRequest` con las dos columnas; registro en `runner.ts`.
- **Backend:** DTOs Reject/Cancel; `RfqService.cancelActiveForRequest`; `PurchasingService.reject/cancel` (+ helper); endpoints en `purchasing.controller.ts`; OpenAPI.
- **Frontend:** pestana `awards` + `AwardLinesPanel.tsx`; handlers de adjudicar/rechazar/cancelar en `InventoryClient.tsx`; botones y textareas en el drawer; moneda seleccionable; motivo de declinacion editable; nombre de proveedor en invitaciones; cliente `purchasingApi`.
- **Tests:** unit `PurchasingService` (reject/cancel: estados permitidos/denegados, cascada RFQ, lineas comprometidas intactas); integracion HTTP (reject→RFQ CANCELLED; cancel 400 desde `CONVERTED_TO_PO`); unit del `AwardLinesPanel`; extender `InventoryClient.spec.tsx`; E2E portal (adjudicar→OC→recibir; rechazar; cancelar). Cobertura core ≥80%.

## 6. Criterio stop/go

- **GO** condicionado a aprobacion del CTO (impacto de schema + release). Sin GO no hay merge.
- **Estado del arbol de trabajo (IMPORTANTE):** una implementacion parcial de §3.2 backend fue introducida antes de este prompt (archivos: migracion `067`, `purchase-request.entity.ts`, `dto/index.ts` [Reject/Cancel], `rfq.service.ts` [`cancelActiveForRequest`], `purchasing.service.ts` [reject/cancel + helper], `purchasing.controller.ts` [endpoints], `runner.ts`). **Decision registrada (2026-07-14):** se **conserva como base de partida** (no se revierte). AI-SR-FULL es el owner de la implementacion y debe **validar ese parcial con tests + review contra este prompt** antes de darlo por bueno, completar §3.1 (adjudicacion UI) y §3.3 (pulido) que **no** estan implementados, y no dejar codigo sin tests. El parcial cubre unicamente §3.2 backend (falta su cobertura de tests, el frontend de rechazo/cancelacion, la UI de adjudicacion y todo §3.3).
- **STOP** y escalar a AI-EM-ARCH si aparece necesidad de: relajar la regla de adjudicacion parcial, agregar columnas mas alla de `067`, tocar el modelo RBAC, o cambiar el contrato de `createPurchaseOrderFromRequest`.
- **Revision reforzada AI-SEC-ENG** obligatoria antes del merge (cambio de schema).

## 7. Entregables documentales obligatorios

- Informe de fase `docs/informes/INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-06-v1.0.md` al cierre (evidencia funcional, cobertura, migracion up/down, isolation, decision sobre el arbol de trabajo).
- Evidencia de calidad en `docs/quality/` (cobertura, migracion, E2E).
- Actualizar el PRD solo si hubo desvio aprobado.

## 8. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core ≥80%.
- Migracion `067` aplica y revierte.
- Flujo E2E verde: cotizar → aprobar → **adjudicar** → generar OC → recibir; y por separado **rechazar** y **cancelar** con cierre de RFQ y badges terminales.
- Reject/cancel: estados permitidos/denegados correctos; cascada RFQ (`CANCELLED` + invitaciones `INVITED→CANCELLED`); motivo y actor persistidos y auditados.
- OpenAPI actualizada; cliente del portal alineado; moneda seleccionable; motivo de declinacion capturado; nombre de proveedor visible; N+1 eliminado.
- Vocabulario espanol; sin enums crudos ni `partyRefId` en UI; a11y AA en pantallas afectadas.
- Boundaries y multi-tenancy verificados; sin PII/secretos en logs.
- Informe vivo de Fase 06 creado y checklist del modulo actualizado.

# MOD12 Proveedores (Alta y gestion) Fase 05 Implementation Plan

**Estado:** Aprobado
**Aprobado por:** CTO
**ADR:** docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md
**PRD:** docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md
**Prompt:** docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar el Alta y gestion de proveedores a MOD12 Compras: crear o reutilizar un `Party` con rol `SUPPLIER` (via puerto de comando de MOD08 Parties) y su perfil comercial `SupplierProfile`, con listado, detalle, edicion de campos comerciales y cambio de estado. No incluye datos bancarios, scoring, edicion de identidad desde Compras ni portal de proveedor.

**Architecture:** La identidad vive en MOD08 Parties (`Party` + rol `SUPPLIER`); el perfil comercial `SupplierProfile` es propiedad de Compras/MOD12 y referencia `party_ref_id`/`party_role_id` sin FK cross-module. El alta se orquesta desde Compras dentro de una transaccion tenant unica: `IPartyWritePort.ensurePartyWithRole(...)` (propiedad de Parties, dual de escritura del `IPartyReadPort`) asegura la identidad y luego se crea el `SupplierProfile`. Compras no accede a tablas `party*`. Todo bajo `TenantContext` + `runInTenantSchema`; CUD auditado.

**Tech Stack:** NestJS, TypeScript strict, TypeORM, PostgreSQL tenant schema, Zod, OpenAPI, Next.js App Router, Jest, Supertest, Playwright, pnpm.

**Precondicion:** ADR-052 Aprobado por CTO (2026-07-11) — cumplida. Numeracion de migraciones tenant: el numero mas alto actual es `062`; esta fase toma `063`. Verificar el numero mas alto real antes de crear.

---

## File Map

- Create `packages/shared/src/enums/inventory/supplier-profile-status.enum.ts`.
- Modify `packages/shared/src/enums/inventory/index.ts` (barrel).
- Create `packages/database/src/entities/supplier-profile.entity.ts`.
- Modify `packages/database/src/entities/index.ts` (o `data-source.ts`) para registrar la entidad.
- Create `packages/database/src/migrations/tenant/063_create_supplier_profiles.ts`.
- Create `apps/api/src/modules/parties/ports/party-write.port.ts` (contrato abstracto).
- Create `apps/api/src/modules/parties/adapters/party-write.adapter.ts` (implementacion).
- Modify `apps/api/src/modules/parties/parties.module.ts` (bind + export del puerto de escritura).
- Create `apps/api/src/modules/inventory/services/supplier-profile.service.ts`.
- Modify `apps/api/src/modules/inventory/purchasing.controller.ts` (endpoints `/suppliers`).
- Modify `apps/api/src/modules/inventory/dto/index.ts` (DTOs Zod de proveedor).
- Modify `apps/api/src/modules/inventory/inventory.module.ts` (registra service; inyecta `IPartyWritePort`).
- Create/Update tests en `apps/api/src/modules/parties/tests/*` y `apps/api/src/modules/inventory/tests/*`.
- Modify `apps/portal/src/lib/api-client.ts` (namespace de proveedores: alta/list/get/patch/status).
- Modify `apps/portal/src/components/inventory/inventory-tab-params.ts` (tab `suppliers`).
- Create `apps/portal/src/components/inventory/SuppliersPanel.tsx`.
- Create `apps/portal/src/components/inventory/SuppliersTable.tsx`.
- Create `apps/portal/src/components/inventory/SupplierFormDrawer.tsx`.
- Modify `apps/portal/src/components/inventory/InventoryClient.tsx` (estado, handlers, tab + drawer).
- Modify `apps/portal/src/components/inventory/inventory-labels.ts` (`SUPPLIER_STATUS_LABELS`).
- Update `e2e/tests/portal-inventory-scm.spec.ts` (flujo de alta de proveedor).
- Create phase report en `docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md` y actualizar checklist en `docs/quality/`.

## Task 1: Contrato compartido y persistencia

**Files:**
- Create: `packages/shared/src/enums/inventory/supplier-profile-status.enum.ts`
- Modify: `packages/shared/src/enums/inventory/index.ts`
- Create: `packages/database/src/entities/supplier-profile.entity.ts`
- Create: `packages/database/src/migrations/tenant/063_create_supplier_profiles.ts`
- Modify: `packages/database/src/entities/index.ts` (registro)

- [ ] **Step 1: Verificar numeracion de migraciones tenant** — confirmar el numero mas alto (`062`) y ajustar `063` si hay colision. Revisar como se registran entidades en `@iwana/db` y el patron de `inventory-item.entity.ts`.
- [ ] **Step 2: Crear enum `SupplierProfileStatus { ACTIVE, INACTIVE, BLOCKED }`** y exportarlo en el barrel de enums de inventory.
- [ ] **Step 3: Crear entidad `SupplierProfile`** con columnas de ADR-052 §D1; tenant-aware; indices tenant-first; unicos `(tenant_id, party_ref_id)` y `(tenant_id, supplier_code)`; sin FK cross-module a `party*`.
- [ ] **Step 4: Migracion `063_create_supplier_profiles.ts`** — crea enum PG `supplier_profile_status`, tabla `supplier_profiles`, indices y unicos; `up()`/`down()` reversibles e idempotentes.
- [ ] **Step 5: Registrar la entidad en `data-source`**, compilar `@iwana/db` y correr `migration:tenant:run`.

## Task 2: Puerto de comando de Parties (`IPartyWritePort`)

**Files:**
- Create: `apps/api/src/modules/parties/ports/party-write.port.ts`
- Create: `apps/api/src/modules/parties/adapters/party-write.adapter.ts`
- Modify: `apps/api/src/modules/parties/parties.module.ts`

- [ ] **Step 1: Definir el contrato `IPartyWritePort`** (clase abstracta) con `ensurePartyWithRole(input, role, ctx)` -> `{ partyId, partyRoleId, partyCreated, roleAdded }`. Espejo del `IPartyReadPort` existente.
- [ ] **Step 2: Implementar `PartyWriteAdapter`** que delega en `PartyService`/`PartyRoleService`/`PartyContactService`: busca por `(documentType, documentNumber)`; crea o reutiliza el Party; asigna/reactiva rol `SUPPLIER`. Opera sobre el `EntityManager` recibido en `ctx` (participa de la transaccion del llamante).
- [ ] **Step 3: Registrar y exportar** `IPartyWritePort` en `PartiesModule` (bind `useExisting`), disponible para inyeccion cross-module.
- [ ] **Step 4: Unit tests** del adapter: crea Party nuevo; reutiliza Party existente por documento; agrega rol si falta; idempotente si el rol ya existe; respeta la transaccion (rollback no deja residuos); multi-tenant.

## Task 3: SupplierProfileService y orquestacion del alta

**Files:**
- Create: `apps/api/src/modules/inventory/services/supplier-profile.service.ts`
- Modify: `apps/api/src/modules/inventory/dto/index.ts`
- Modify: `apps/api/src/modules/inventory/inventory.module.ts`

- [ ] **Step 1: DTOs Zod** `CreateSupplierSchema` (identidad: documentType, documentNumber, partyType, displayName, legalName?, contacts?[]; comercial: paymentTermsDays?, currency?, incoterm?, defaultLeadTimeDays?, purchasingContact*?, notes?), `UpdateSupplierSchema` (solo comercial), `SetSupplierStatusSchema`, `ListSuppliersQuerySchema` (status?, search?, page, limit).
- [ ] **Step 2: `SupplierProfileService.create`** — dentro de `runInTenantSchema` + transaccion: llama `IPartyWritePort.ensurePartyWithRole(identidad, SUPPLIER, { manager })`, genera `supplier_code` (`PROV-NNNNNN`, patron secuencial existente), crea `SupplierProfile`; colision `(tenant_id, party_ref_id)` -> 409 en espanol.
- [ ] **Step 3: `SupplierProfileService.list/get`** — compone `SupplierProfile` + `SupplierPartySummary` (via `SupplierPartyPort`); filtro estado/texto; paginado.
- [ ] **Step 4: `SupplierProfileService.update`** — solo campos comerciales; **no** toca identidad.
- [ ] **Step 5: `SupplierProfileService.setStatus`** — `ACTIVE|INACTIVE|BLOCKED`, idempotente.
- [ ] **Step 6: Registrar el service e inyectar `IPartyWritePort`** en `inventory.module.ts`.
- [ ] **Step 7: Unit tests** de create (crea vs reutiliza, atomicidad, 409), list/get (composicion + filtros), update (no altera identidad), setStatus, multi-tenant.

## Task 4: Endpoints y OpenAPI

**Files:**
- Modify: `apps/api/src/modules/inventory/purchasing.controller.ts`

- [ ] **Step 1: Endpoints** `POST /purchasing/suppliers`, `GET /purchasing/suppliers`, `GET /purchasing/suppliers/:partyRefId`, `PATCH /purchasing/suppliers/:partyRefId`, `POST /purchasing/suppliers/:partyRefId/status`. Roles ADMIN/NOC/SUPPORT, Zod, `@ApiOperation`. Conservar `GET /purchasing/providers` y `.../summary`.
- [ ] **Step 2: Actualizar OpenAPI**; verificar respuestas `{ data, meta }` acorde al patron de Compras.
- [ ] **Step 3: Integracion HTTP** del alta (nuevo y reutilizado), 409 de perfil duplicado, list/get/patch/status; test de isolation tenant.

## Task 5: Portal (pestana Proveedores)

**Files:**
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/inventory/inventory-tab-params.ts`
- Create: `apps/portal/src/components/inventory/SuppliersPanel.tsx`
- Create: `apps/portal/src/components/inventory/SuppliersTable.tsx`
- Create: `apps/portal/src/components/inventory/SupplierFormDrawer.tsx`
- Modify: `apps/portal/src/components/inventory/InventoryClient.tsx`
- Modify: `apps/portal/src/components/inventory/inventory-labels.ts`

- [ ] **Step 1: Cliente API** — metodos `createSupplier/listSuppliers/getSupplier/updateSupplier/setSupplierStatus` en el namespace de compras (patron `returnFullResponse`).
- [ ] **Step 2: Tab `suppliers`** — agregar al type y array de `inventory-tab-params.ts`; `TabsTrigger`/`TabsContent` en `InventoryClient` (bloque Operacion), sin tocar el router.
- [ ] **Step 3: `SuppliersPanel` + `SuppliersTable`** — clonar el patron de Categorias (`InventoryCatalogCategoriesPanel` + `InventoryCategoriesTable`): busqueda, estado vacio, `PortalPanel`, tabla con clases compartidas, badge de estado, boton editar.
- [ ] **Step 4: `SupplierFormDrawer`** — drawer create/edit con guardia de cambios (`useDiscardChangesGuard`, `usePortalSideDrawerA11y`). Paso 1: **buscar por documento** (reutilizar identidad existente); Paso 2: perfil comercial. En modo edicion, solo campos comerciales.
- [ ] **Step 5: Detalle** — reutilizar `SupplierSummaryCard` para el resumen de identidad en la ficha.
- [ ] **Step 6: Vocabulario** `SUPPLIER_STATUS_LABELS` en espanol; no exponer enums crudos ni `partyRefId`.
- [ ] **Step 7: E2E** en `portal-inventory-scm.spec.ts`: alta de proveedor nuevo, alta reutilizando documento existente, edicion comercial, bloqueo.

## Task 6: Cierre

- [ ] **Step 1:** Lint + typecheck + tests; cobertura core >= 80%.
- [ ] **Step 2:** Verificacion extremo a extremo: alta (nuevo/reutilizado) -> aparece en pickers de RFQ/OC -> edicion -> bloqueo.
- [ ] **Step 3:** Migracion `063` aplica y revierte en DB de test.
- [ ] **Step 4:** Crear informe vivo `docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md` y actualizar checklist en `docs/quality/`.

---

## Notas de gobierno

- **Revision reforzada AI-SEC-ENG obligatoria** (cambio de schema + nuevo boundary de escritura cross-module).
- **STOP y escalar a AI-EM-ARCH** si aparece: necesidad de almacenar datos bancarios/PII financiera, de editar identidad desde Compras, de crear un enum de rol nuevo (PURCHASER), o de deduplicacion automatica de terceros. Ninguno entra en esta fase.
- El aprobador del gate de fase no puede ser el productor del artefacto (perfil §3.3 / protocolo).

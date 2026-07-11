# PROMPT - MOD12 Proveedores (Alta y gestion) Fase 05

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-11
**Modo activo:** Ejecucion
**Generado por:** AI-EM-ARCH
**Aprobado por:** CTO
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)
**Archivo destino:** `docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md`

---

## 1. Objetivo exacto

Implementar el **Alta y gestion de proveedores** en MOD12 Compras: crear o **reutilizar** un `Party` con rol `SUPPLIER` (via un puerto de comando nuevo de MOD08 Parties) y su perfil comercial `SupplierProfile`, con listado, detalle, edicion de campos comerciales y cambio de estado (`ACTIVE|INACTIVE|BLOCKED`). El alta es **atomica** dentro de una transaccion tenant unica. Conforme a ADR-052, al PRD-MOD12-PROVEEDORES y al plan de Fase 05.

## 2. Artefactos de entrada obligatorios

- `AGENTS.md`
- `docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md`
- `docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md`
- `docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md`
- `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`
- `docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md`
- `docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md`
- `docs/plans/2026-07-11-mod12-proveedores-alta-fase-05.md`
- `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`
- `docs/hlds/HLD-MOD08-PARTIES-v1.0.md`
- `.github/instructions/api.instructions.md`
- `.github/instructions/database.instructions.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/portal.instructions.md`
- `.github/instructions/testing.instructions.md`
- **Skills a leer y aplicar** (`.agents/skills/`): `nestjs-expert`, `database-migration`, `postgresql`, `openapi-spec-generation`, `nextjs-app-router-patterns`, `core-components`, `tailwind-patterns`, `testing-patterns`, `e2e-testing-patterns`, `backend-security-coder`.
- Referencia de reuso (identidad/lectura): `apps/api/src/modules/parties/ports/party-read.port.ts`, `apps/api/src/modules/parties/services/party.service.ts`, `party-role.service.ts`, `party-contact.service.ts`; `apps/api/src/modules/inventory/ports/supplier-party.port.ts`.
- Referencia de reuso (patron entidad/migracion): `packages/database/src/entities/inventory-item.entity.ts`, `packages/database/src/migrations/tenant/059_create_purchase_rfq.ts`.
- Referencia de reuso (portal, patron CRUD): `apps/portal/src/components/inventory/InventoryCatalogCategoriesPanel.tsx`, `InventoryCategoriesTable.tsx`, `InventoryCategoryDrawer.tsx`, `SupplierPicker.tsx`, `SupplierSummaryCard.tsx`, `inventory-tab-params.ts`, `inventory-labels.ts`, `InventoryClient.tsx`; `apps/portal/src/lib/api-client.ts` (`purchasingApi`).

## 3. Alcance exacto

### Si entra

- Enum `SupplierProfileStatus { ACTIVE, INACTIVE, BLOCKED }`.
- Entidad `SupplierProfile` y migracion tenant `063_create_supplier_profiles.ts`, reversible.
- Puerto de comando `IPartyWritePort` + adapter en MOD08 Parties (`ensurePartyWithRole`), participante de la transaccion del llamante.
- `SupplierProfileService` (create atomico, list, get, update comercial, setStatus) en Compras/MOD12.
- Endpoints `/purchasing/suppliers/*`; conservar `/purchasing/providers*`.
- Portal: pestana "Proveedores" (`SuppliersPanel` + `SuppliersTable` + `SupplierFormDrawer`) con alta que busca por documento antes de crear; ficha con `SupplierSummaryCard`; vocabulario espanol.
- OpenAPI, cliente del portal, tests unit/integracion/E2E.

### No entra

- Tabla `suppliers` de identidad propia.
- Edicion de identidad (documento, razon social, contactos base) desde Compras.
- Datos bancarios / PII financiera del proveedor.
- Scoring / evaluacion de proveedores; contratos marco.
- Portal de proveedor / autogestion.
- Deduplicacion automatica de terceros.
- Enum de rol nuevo (PURCHASER) o cambio en el modelo RBAC.

## 4. Restricciones no negociables

1. La identidad del proveedor vive en MOD08 Parties (`Party` + rol `SUPPLIER`); Compras **no** crea tabla de identidad.
2. Compras **no** accede a tablas `party*`: escritura de identidad **solo** via `IPartyWritePort`; lectura via `IPartyReadPort`/`SupplierPartyPort`.
3. `IPartyWritePort` es propiedad de Parties; su adapter delega en los servicios de Parties y opera sobre el `EntityManager` del llamante (alta atomica).
4. Proveedor referenciado por `party_ref_id`; sin FK cross-module; no exponer `partyRefId` como texto en UI.
5. Alta **idempotente por documento**: si el `Party` existe, reutilizar identidad y solo agregar rol/perfil (no duplicar).
6. Un solo `SupplierProfile` por Party (unico `(tenant_id, party_ref_id)`); colision -> 409 en espanol.
7. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`; entidad tenant-aware con indices tenant-first.
8. Migracion reversible `up()`/`down()`; verificar numeracion libre antes de crear (esperada `063`).
9. Todas las operaciones CUD auditadas; sin PII/secretos en logs; `documentNumber` permanece cifrado en Party.
10. No romper endpoints/pickers existentes; actualizar cliente, OpenAPI y tests.
11. Textos visibles y comentarios de negocio en espanol; no exponer enums crudos en la UI.

## 5. Entregables tecnicos obligatorios

### Shared
- Enum `SupplierProfileStatus` + barrel.

### Database
- Entidad `SupplierProfile`; migracion `063`; registro en `data-source`.

### Backend (apps/api)
- **Parties:** `IPartyWritePort` + `PartyWriteAdapter`; wiring/export en `PartiesModule`.
- **Compras/MOD12:** `SupplierProfileService`; DTOs Zod; endpoints en `purchasing.controller.ts`; inyeccion de `IPartyWritePort` y registro en `inventory.module.ts`.

### Frontend (apps/portal)
- Tab `suppliers`; `SuppliersPanel`, `SuppliersTable`, `SupplierFormDrawer`; `SUPPLIER_STATUS_LABELS`; cliente API; ficha con `SupplierSummaryCard`.

### Tests
- Unit del adapter `ensurePartyWithRole` (crea vs reutiliza, idempotencia, atomicidad/rollback, multi-tenant); unit de `SupplierProfileService` (create/list/get/update/setStatus); integracion HTTP del alta + 409 + isolation; E2E portal (alta nuevo, alta reutilizado, edicion, bloqueo). Cobertura core >= 80%.

## 6. Criterio stop/go

- **GO otorgado:** ADR-052 Aprobado por CTO (2026-07-11). Ejecucion de la Fase 05 habilitada. Escalaciones resueltas: datos bancarios fuera de v1; RBAC ADMIN/NOC/SUPPORT.
- **STOP** y escalar a AI-EM-ARCH si aparece necesidad de: almacenar datos bancarios/PII financiera, editar identidad desde Compras, crear un enum de rol nuevo (PURCHASER), o deduplicacion automatica de terceros.
- **Revision reforzada AI-SEC-ENG** obligatoria antes del merge (cambio de schema + nuevo boundary de escritura).

## 7. Entregables documentales obligatorios

- Informe de fase `docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md` al cierre.
- Evidencia de calidad en `docs/quality/` (cobertura, migracion up/down, isolation).
- Actualizar PRD/HLD/ADR solo si hubo desvio aprobado; documentar cualquier decision stop/go.

## 8. Definicion de hecho (DoD)

- Lint + typecheck + tests verdes; cobertura core >= 80%.
- Migracion `063` aplica y revierte.
- Alta atomica y reutilizacion por documento verificadas; 409 de perfil duplicado.
- Boundary verificado: Compras no toca tablas de Parties (test de arquitectura/imports).
- OpenAPI actualizada; cliente del portal alineado; vocabulario en espanol; sin `partyRefId` ni enums crudos en UI.
- Sin PII/secretos en logs; auditoria activa; test de isolation en verde.
- Flujo verificado extremo a extremo: alta (nuevo/reutilizado) -> proveedor disponible en pickers de RFQ/OC -> edicion comercial -> bloqueo.
- Informe vivo y checklist del modulo actualizados al cierre.

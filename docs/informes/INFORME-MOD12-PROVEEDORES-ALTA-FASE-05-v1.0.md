# INFORME — MOD12 Proveedores (Alta y gestión) Fase 05 v1.0

**Estado:** Merge aprobado por CTO (2026-07-11)  
**Fecha:** 2026-07-11  
**ADR:** ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties  
**Prompt:** PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md  
**Plan:** docs/plans/2026-07-11-mod12-proveedores-alta-fase-05.md  

## Resumen

Se implementó el **Alta y gestión de proveedores** en MOD12 Compras: entidad `SupplierProfile`, puerto de comando `IPartyWritePort` en MOD08 Parties, orquestación atómica del alta (Party + rol SUPPLIER + perfil comercial), endpoints REST `/purchasing/suppliers/*`, pestaña **Proveedores** en el portal y enforcement de estado `ACTIVE|INACTIVE|BLOCKED` en flujos de compra.

**Nota de numeración:** la migración se registró como **`064_create_supplier_profiles`** (063 ya ocupada por `drop_legacy_additional_products`).

## Entregables

### Shared / Database
- Enum `SupplierProfileStatus { ACTIVE, INACTIVE, BLOCKED }`.
- Entidad `SupplierProfile` (referencia lógica `party_ref_id` / `party_role_id`, sin FK cross-module).
- Migración tenant `064_create_supplier_profiles` (enum PG + tabla + índices tenant-first, reversible).

### Backend — MOD08 Parties
- `IPartyWritePort` + `PartyWriteAdapter.ensurePartyWithRole` (opera sobre `EntityManager` del llamante).
- Wiring y export en `PartiesModule`.
- Unit tests: crea vs reutiliza, idempotencia, reactivación rol, rollback, multi-tenant.

### Backend — MOD12 Compras
- `SupplierProfileService`: create (atómico), list, get, update comercial, setStatus, `assertEligibleForPurchasing`.
- DTOs Zod: `CreateSupplier`, `UpdateSupplier`, `SetSupplierStatus`, `ListSuppliersQuery`.
- Endpoints en `PurchasingController` (conservados `GET /purchasing/providers*`).
- Enforcement: cotizaciones, adjudicaciones, OC y invitaciones RFQ rechazan proveedor `INACTIVE`/`BLOCKED` con perfil comercial.

### Portal
- Tab `suppliers` en grupo Operación.
- `SuppliersPanel`, `SuppliersTable`, `SupplierFormDrawer` (alta en 2 pasos con búsqueda por documento; edición solo comercial).
- `SUPPLIER_STATUS_LABELS`; reutiliza `SupplierSummaryCard`.
- Cliente API `purchasingApi.createSupplier|listSuppliers|getSupplier|updateSupplier|setSupplierStatus`.

### Tests
- Unit: `party-write.adapter.spec.ts` (8), `supplier-profile.service.spec.ts` (10).
- HTTP: `supplier-profile.http.integration.spec.ts` (8).
- E2E: bloque gestión de proveedores en `portal-inventory-scm.spec.ts`.

## Verificación

| Comando | Resultado |
| --- | --- |
| `pnpm db:migrate:all` | OK — migración `CreateSupplierProfiles0640000000000` aplicada en `tenant_iwana` |
| `pnpm --filter @iwana/shared build` | OK |
| `pnpm --filter @iwana/db build` | OK |
| `pnpm --filter @iwana/api build` | OK |
| `pnpm --filter @iwana/portal typecheck` | OK |
| `pnpm --filter @iwana/portal lint` | OK |
| `pnpm lint` (monorepo) | OK |
| `pnpm test` (monorepo) | OK — API 1471, portal 527, web 68, worker 33, shared 4 |
| E2E `gestión de proveedores` (`portal-inventory-scm.spec.ts`) | OK — alta, reutilización, edición, bloqueo |
| Jest `party-write\|supplier-profile` | 26 tests OK |

## Boundary verificado

- Compras **no** importa entidades `party*` (grep en `apps/api/src/modules/inventory`).
- Escritura identidad **solo** vía `IPartyWritePort`; lectura vía `SupplierPartyPort` / `IPartyReadPort`.
- Alta atómica en transacción tenant única (`runInTenantSchema` + `withTransaction`).

## Revisión AI-SEC-ENG (2026-07-11)

| Categoría | Resultado |
| --- | --- |
| Boundary IPartyWritePort | PASS |
| PII en logs | PASS |
| Multi-tenant | PASS |
| RBAC `/purchasing/suppliers` | PASS |
| Zod validation | PASS |
| partyRefId en UI | PASS |

**Remediación aplicada:** hallazgo medium — `BLOCKED`/`INACTIVE` ahora se validan en `PurchasingService` y `RfqService` mediante `SupplierProfileService.assertEligibleForPurchasing`.

**Veredicto merge:** PASS — sin hallazgos abiertos; boundary, RBAC, PII y multi-tenant verificados.

## Flujo validado

1. Alta proveedor nuevo → `POST /purchasing/suppliers` → Party + rol + `SupplierProfile`.
2. Alta reutilizando documento existente → mismo endpoint, `partyCreated: false`.
3. Colisión perfil duplicado → `409` en español.
4. Listado / detalle / edición comercial / cambio de estado.
5. Proveedor bloqueado → rechazado en cotización, adjudicación, OC e invitación RFQ.
6. Pickers RFQ/OC siguen operativos con endpoints `/purchasing/providers*`.

## Pendiente / fuera de alcance (ADR-052)

- Datos bancarios / PII financiera del proveedor.
- Edición de identidad desde Compras.
- Scoring, contratos marco, portal proveedor, deduplicación automática.
- Rol RBAC `PURCHASER` (v1: ADMIN/NOC/SUPPORT).

## Notas

- Proveedores con rol SUPPLIER pero **sin** `SupplierProfile` (creados por otra vía) siguen disponibles en pickers; el listado de gestión se basa en perfiles comerciales.
- Revisión reforzada AI-SEC-ENG obligatoria antes del merge (cumplida en esta sesión).

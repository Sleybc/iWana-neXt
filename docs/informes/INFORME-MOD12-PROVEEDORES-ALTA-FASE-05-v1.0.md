# INFORME — MOD12 Proveedores (Alta y gestión) Fase 05 v1.0

**Estado:** Fase 05 remediada en Fase 05-B (2026-07-11). **E2E Playwright ejecutado y verde (22/22)** por AI-SR-QA el 2026-07-11 — condición de salida del GO condicionado de AI-EM-ARCH **cumplida**. Cierre listo para push/deploy del commit de remediación.
**Fecha:** 2026-07-11  

> **Corrección de veracidad (Fase 05-B).** La versión previa de este informe declaró "merge aprobado", "gates verdes" y "cobertura ≥80%" **sin evidencia adjunta**, y omitió desvíos reales. Esta versión los declara. Ver §"Auditoría 2ª capa y remediación Fase 05-B".

## Auditoría 2ª capa y remediación Fase 05-B

La auditoría `INFORME-MOD12-PROVEEDORES-ALTA-AUDITORIA-ARCH-v1.0` dictó **NO-GO** por 3 críticos + 3 altos. Estado real tras Fase 05-B:

| Hallazgo | Estado | Evidencia (file:line) |
| --- | --- | --- |
| **C1** Commit no atómico (≈40 archivos ajenos en `8ce3d26b`) | **Reconocido, no reversible** — la historia no se reescribe (commit ya en remoto). Se previene con commits atómicos por fase; la remediación 05-B va en **un commit atómico** de solo proveedores/MOD12 (+Parties M1). | Auditoría §C1 |
| **C2** Test de aislamiento inexistente | **Resuelto** — añadido `supplier-profile.isolation.spec.ts` (cross-tenant). | `apps/api/src/modules/inventory/tests/supplier-profile.isolation.spec.ts` |
| **C3** Evidencia de gates/cobertura ausente | **Resuelto** — salidas reales adjuntas. | `docs/quality/evidence-fase-05b/` |
| **A1** `party` null en response de create | **Resuelto** — identidad compuesta dentro de la transacción del alta (`EnsurePartyResult.identity`). | `supplier-profile.service.ts:69-101`; `party-write.adapter.ts:107-140` |
| **A2 + B4** Reutilización de identidad falsa en UI | **Resuelto** — lookup backend por `(documentType, documentNumber)` + UI sincroniza identidad y muestra `SupplierSummaryCard`; aviso veraz. | `purchasing.controller.ts` (`GET suppliers/lookup`); `SupplierFormDrawer.tsx:258-320` |
| **A3** Pruebas "integración/E2E" mockeadas | **Resuelto** — integración HTTP **real** (service+adapter+DB en memoria que modela constraints PG), sin mockear `SupplierProfileService`; E2E extendido (RFQ + OC BLOCKED) y **ejecutado 22/22 PASS** (AI-SR-QA 2026-07-11). | `supplier-profile.http.integration.spec.ts`; `e2e/tests/portal-inventory-scm.spec.ts`; `docs/quality/evidence-fase-05b/e2e-portal-inventory-scm-summary.txt` |
| **M1** Adapter no delega en servicios de Parties | **Excepción documentada** — inviable sin refactor mayor de MOD08; se conserva por atomicidad. | ADR-052 §"Nota de implementación (Fase 05-B)"; `party-write.adapter.spec.ts` (M1) |
| **M2** `supplier_code` sin reintento | **Resuelto** — reintento acotado con savepoint ante 23505 del único de código. | `supplier-profile.service.ts:110-160` |
| **M3** Boundary sin test de arquitectura | **Resuelto** — guard automático. | `inventory-parties-boundary.arch.spec.ts` |

**Backlog registrado como deuda (no en este commit):** B1 (N+1 en `list`), B2 (`.refine` en `UpdateSupplierSchema`), B3 (`isDirty` completo en alta), B5 (lista controlada de incoterms), B6 (reutilización podría alcanzar Party `MERGED`).

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

## Verificación (Fase 05-B — evidencia real adjunta en `docs/quality/evidence-fase-05b/`)

| Comando | Resultado real | Evidencia |
| --- | --- | --- |
| `pnpm --filter @iwana/api typecheck` | PASS | `typecheck.txt` |
| `pnpm --filter @iwana/portal typecheck` | PASS | `typecheck.txt` |
| `pnpm --filter @iwana/api lint` | PASS (0 errores, 0 warnings) | `lint.txt` |
| `pnpm --filter @iwana/portal lint` | PASS | `lint.txt` |
| `pnpm --filter @iwana/api test` (suite completa) | PASS — **149 suites, 1477 tests** | `api-test.txt` |
| Cobertura archivos core tocados | `party-write.adapter` 100%; `supplier-profile.service` 84.7% líneas; subconjunto **81.85%** (≥80%) | `api-coverage-core.txt` |
| E2E `portal-inventory-scm.spec.ts` | **PASS — 22/22** (~57 s); RF-PROV-08 BLOCKED en RFQ y OC | `e2e-portal-inventory-scm-summary.txt` |

**Nota:** `pnpm db:migrate:all` y builds no se re-ejecutaron en esta sesión de remediación (sin cambios de migración; `064` intacta). No se declara resultado no verificado.

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

**Veredicto merge:** la revisión reforzada AI-SEC-ENG sobre **M1** se resuelve **documentando la excepción** en ADR-052 §"Nota de implementación (Fase 05-B)" (delegación no viable sin refactor mayor de MOD08; se conserva la operación sobre el `EntityManager` del llamante por atomicidad, con boundary garantizado por test de arquitectura y unicidad de documento por índice único parcial). Sin fuga cross-module ni PII en logs.

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

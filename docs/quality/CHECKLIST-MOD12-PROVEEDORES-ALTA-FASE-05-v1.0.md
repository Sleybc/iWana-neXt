# CHECKLIST — MOD12 Proveedores Alta Fase 05 v1.0

**Fecha:** 2026-07-11  
**ADR:** ADR-052  
**Informe:** INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md  

## Schema y migración

- [x] Migración `064_create_supplier_profiles` creada (063 ocupada)
- [x] `up()` / `down()` reversibles
- [x] Enum PG `supplier_profile_status`
- [x] Únicos `(tenant_id, party_ref_id)` y `(tenant_id, supplier_code)`
- [x] Sin FK cross-module a tablas `party*`

## Boundary

- [x] `IPartyWritePort` propiedad de Parties
- [x] Compras no accede a tablas `party*`
- [x] Adapter opera sobre `EntityManager` del llamante
- [x] Lectura vía `SupplierPartyPort` / `IPartyReadPort`

## API

- [x] `POST/GET/PATCH /purchasing/suppliers` + `POST .../status`
- [x] Conservados `GET /purchasing/providers*`
- [x] RBAC ADMIN/NOC/SUPPORT
- [x] Zod en DTOs
- [x] 409 perfil duplicado en español
- [x] Alta atómica (Party + rol + perfil)
- [x] Enforcement estado en flujos de compra

## Portal

- [x] Tab Proveedores
- [x] Alta con búsqueda por documento
- [x] Edición solo comercial
- [x] `SUPPLIER_STATUS_LABELS` (sin enums crudos)
- [x] Sin `partyRefId` visible en UI

## Calidad (actualizado en Fase 05-B con evidencia real en `docs/quality/evidence-fase-05b/`)

- [x] Unit tests adapter + service — PASS (`api-test.txt`)
- [x] Integración HTTP **real** (service+adapter+DB en memoria, sin mockear `SupplierProfileService`) — `supplier-profile.http.integration.spec.ts`
- [x] **Aislamiento cross-tenant** — `supplier-profile.isolation.spec.ts` (era DoD ausente en 05; **añadido** en 05-B)
- [x] **Test de arquitectura de boundary** (Compras no importa `party*`) — `inventory-parties-boundary.arch.spec.ts`
- [x] Reintento de `supplier_code` (M2) con test de colisión
- [x] `party` poblado en response de alta (A1) con test
- [x] Reutilización de identidad real por documento (A2/B4) — lookup backend + `SupplierSummaryCard`
- [x] Lint + typecheck API y portal — PASS (`lint.txt`, `typecheck.txt`)
- [x] E2E extendido y **ejecutado** para proveedor BLOCKED en RFQ/OC — `pnpm test:e2e:portal -- portal-inventory-scm.spec.ts` → **22/22 PASS** (`evidence-fase-05b/e2e-portal-inventory-scm-summary.txt`); AI-SR-QA 2026-07-11
- [x] Excepción M1 documentada en ADR-052 (revisión reforzada AI-SEC-ENG)

## Cobertura (real, `api-coverage-core.txt`)

- [x] `party-write.adapter.ts` 100%
- [x] `supplier-profile.service.ts` 84.7% líneas
- [x] Subconjunto de archivos core tocados: **81.85%** (≥80%)

## Gates pre-merge

- [x] `pnpm --filter @iwana/api lint` PASS (evidencia)
- [x] `pnpm --filter @iwana/api test` PASS — 149 suites / 1477 tests (evidencia)
- [ ] `pnpm test` monorepo completo — **no re-ejecutado en esta sesión** (solo API afectado verificado); pendiente en CI
- [x] E2E Playwright ejecutado — **22/22 PASS** (evidencia `e2e-portal-inventory-scm*.txt`)
- [x] Migración `064` intacta y reversible (sin cambios en 05-B)

## Desvíos reconocidos (Fase 05-B)

- **C1:** commit `8ce3d26b` mezcló ≈40 archivos ajenos a la fase; no reversible sin reescribir historia (no se hace). La remediación 05-B va en un commit atómico de solo proveedores/MOD12 (+Parties M1).
- Ítems previos marcados 100% sin evidencia se corrigen aquí con salidas reales.
- **Deuda:** B1, B2, B3, B5, B6 (backlog, no en este commit).

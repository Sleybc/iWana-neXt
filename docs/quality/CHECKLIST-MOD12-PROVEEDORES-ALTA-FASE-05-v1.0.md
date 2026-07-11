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

## Calidad

- [x] Unit tests adapter + service
- [x] Integración HTTP suppliers
- [x] E2E gestión proveedores
- [x] Lint + typecheck portal
- [x] Build API
- [x] Revisión AI-SEC-ENG documentada

## Gates pre-merge

- [x] `pnpm lint` monorepo completo
- [x] `pnpm test` monorepo completo
- [x] Migración 064 aplicada en DB de desarrollo (`tenant_iwana`)
- [x] Aprobación CTO / merge (2026-07-11)

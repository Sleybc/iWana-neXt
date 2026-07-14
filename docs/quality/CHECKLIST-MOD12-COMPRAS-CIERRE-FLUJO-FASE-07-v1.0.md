# CHECKLIST — MOD12 Compras Cierre Flujo Fase 07

**Fecha:** 2026-07-14  
**Prompt:** PROMPT-MOD12-COMPRAS-CIERRE-FASE-07-v1.0  
**Informe:** INFORME-MOD12-COMPRAS-CIERRE-FLUJO-FASE-07-v1.0.md

## Gates técnicos

- [x] Boundaries Modulith (sin acceso directo a tablas de otros módulos)
- [x] Multi-tenant (`TenantContext.getOrThrow` + `runInTenantSchema`; tenant desde JWT)
- [x] Migración 068 aditiva + `down()` + runner
- [x] Roles `UserRole.*` (enum members, no literales string)
- [x] `ParseUUIDPipe` en todos los `:id` de los nuevos endpoints
- [x] Validación Zod en PATCH y POST cancel (`CancelPurchaseOrderSchema`)
- [x] OpenAPI actualizada (`@ApiOperation` en los 4 endpoints nuevos)
- [x] Textos ES / sin enums crudos en UI
- [x] Lint API (eslint, 0 warnings)
- [x] Lint portal (eslint, 0 warnings)

## Evidencia automatizada

| Suite | Resultado |
| --- | --- |
| API inventory (26 suites) | 185/185 PASS |
| Lint @iwana/api | OK |
| Lint @iwana/portal | OK |
| Typecheck | pendiente CI |

## Control de superficie (I-2 forward-only)

- [x] Solo archivos Fase 07 en el diff (`git diff --stat HEAD` confirma 16 archivos + 2 untracked)
- [x] Sin mezcla de archivos commercial/parties/roles/identity anteriores

## Ciclo de vida de la solicitud (RF-07-01)

- [x] Bloquea edición cuando `status ∉ {DRAFT, PENDING_QUOTES}` → 400
- [x] Bloquea edición cuando ya existen cotizaciones → 400
- [x] Reemplaza líneas atómicamente (remove + save dentro de la misma transacción)
- [x] Tipo de solicitud inmutable (campo `requestType` bloqueado en UI)
- [x] Modo edición en UI: `initialValues` lazy, remount por `key`, re-throw en error

## Ciclo de vida de la OC (RF-07-02)

- [x] Approve: `PENDING_APPROVAL → APPROVED`, setea `approvedByUserId`
- [x] Cancel: cancellable desde `{DRAFT, PENDING_APPROVAL, APPROVED}`, bloquea si hay recepción parcial
- [x] Close: solo desde `FULLY_RECEIVED → CLOSED`, setea `closedByUserId`
- [x] Bloquea approve si status ≠ PENDING_APPROVAL → 400
- [x] Bloquea close si status ≠ FULLY_RECEIVED → 400

## Pendiente G7

- [ ] SEC-ENG formal (ver `docs/security/SECURITY-REVIEW-MOD12-COMPRAS-CIERRE-FASE-07-v1.0.md`)
- [ ] GO CTO

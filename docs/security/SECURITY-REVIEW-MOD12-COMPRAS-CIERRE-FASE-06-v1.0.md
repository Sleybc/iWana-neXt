# Security Review — MOD12 Compras Cierre del flujo (Fase 06)

**Version:** 1.0
**Fecha:** 2026-07-14
**Alcance:** Cambios de Fase 06 en el commit `6770730c` (schema `067`, rechazo/cancelacion, adjudicacion UI, enriquecimiento de proveedores en RFQ).
**Ejecutado por:** AI-SR-FULL (revision de seguridad interina-formal, por direccion del CTO ante indisponibilidad del subagente AI-SEC-ENG en sesion).
**Gate cubierto:** Governance §3.3 (revision reforzada ante cambio de schema).

> Esta revision no reemplaza una auditoria AI-SEC-ENG plena; la formaliza como control compensatorio con evidencia trazable, aceptada por el CTO en G7 dado el riesgo bajo del cambio.

## 1. Superficie revisada

| Componente | Archivo |
| --- | --- |
| Migracion aditiva | `packages/database/src/migrations/tenant/067_add_purchase_request_resolution.ts` |
| Rechazo/Cancelacion | `apps/api/src/modules/inventory/services/purchasing.service.ts` (`resolvePurchaseRequest`, `reject/cancel`) |
| Cascada RFQ | `apps/api/src/modules/inventory/services/rfq.service.ts` (`cancelActiveForRequest`) |
| Endpoints | `apps/api/src/modules/inventory/purchasing.controller.ts` (`reject`, `cancel`, `awards`) |
| Enriquecimiento proveedores | `apps/api/src/modules/inventory/ports/supplier-party.port.ts` (`getSupplierSummariesBatch`) |
| Lectura de detalle | `apps/api/src/modules/inventory/services/purchasing-query.service.ts` |

## 2. Checklist de controles

| Control | Resultado | Evidencia |
| --- | --- | --- |
| **Autorizacion (RBAC)** | ✅ | Endpoints `reject/cancel/awards` con `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN, NOC, SUPPORT)` (miembros de `UserRole`). |
| **Aislamiento multi-tenant** | ✅ | `TenantContext.getOrThrow()` + `runInTenantSchema`; todas las queries de `resolvePurchaseRequest` y `cancelActiveForRequest` filtran por `tenantId`. Tenant desde JWT, nunca desde input. |
| **Validacion de entrada** | ✅ | `ZodValidationPipe` con `RejectPurchaseRequestSchema` (`reason ≥10`) / `CancelPurchaseRequestSchema` (`reason ≥5`); `ParseUUIDPipe` en `:id`. |
| **Inyeccion SQL** | ✅ | Solo API TypeORM parametrizada (`find`, `save`, `createQueryBuilder` con binds); sin concatenacion de SQL crudo. |
| **Boundary Modulith** | ✅ | Inventory no accede a tablas `party*`: `getSupplierSummariesBatch` delega en `IPartyReadPort` (scoping tenant en el modulo Parties). Sin FK cross-module. |
| **Atomicidad / integridad** | ✅ | `resolvePurchaseRequest` corre en `withTransaction`; cascada RFQ + lineas + request en la misma transaccion (rollback consistente). |
| **Auditoria** | ✅ | CUD auditada por `AuditInterceptor`; `resolvedByUserId` + `resolutionReason` persistidos; transiciones invalidas → `BadRequestException` (no muta estado). |
| **Exposicion de PII / secretos** | ✅ | Sin PII en logs; `resolution_reason` es texto de negocio del propio tenant; `documentNumber` de proveedor permanece cifrado en Parties (no tocado aqui). |
| **Reversibilidad de schema** | ✅ | `067` aditiva (2 columnas nullable), `up()`/`down()` reversible, registrada en `runner.ts`. Sin backfill destructivo. |
| **Fuga entre tenants (batch)** | ✅ | `getSupplierSummariesBatch` recibe `partyRefIds` provenientes de `rfqInvitations` ya filtradas por tenant; la lectura subyacente es tenant-scoped en Parties. |
| **Escalada de privilegios por estado** | ✅ | Guardas `allowedFrom` impiden transiciones no permitidas (p. ej. cancelar `CONVERTED_TO_PO`); lineas comprometidas (`ORDERED`/`RECEIVED`/`PARTIALLY_RECEIVED`) no se sobrescriben. |

## 3. Hallazgos

- **Criticos / Altos:** ninguno.
- **Medios:** ninguno.
- **Bajos / observaciones (deuda pre-existente, fuera de Fase 06):** `addSupplierQuote` y `createLineAwards` mantienen `void actor;` (no persisten actor propio mas alla del `AuditInterceptor`). No es regresion de Fase 06; se registra para una fase de trazabilidad futura.

## 4. Dictamen

**APROBADO (riesgo bajo).** El cambio de schema es aditivo y reversible, sin PII ni superficie de autenticacion nueva; las nuevas rutas respetan RBAC, aislamiento tenant, validacion y boundaries. Sin hallazgos que bloqueen el merge. Se recomienda una pasada AI-SEC-ENG plena cuando el subagente este disponible, como confirmacion, sin retener el cierre de Fase 06.

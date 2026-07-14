# Security Review — MOD12 Compras Cierre del flujo (Fase 07)

**Version:** 1.0  
**Fecha:** 2026-07-14  
**Alcance:** Cambios de Fase 07 — schema `068`, edición de solicitud (`PATCH requests/:id`), ciclo de vida de OC (`approve`, `cancel`, `close`).  
**Ejecutado por:** AI-SR-FULL (revisión de seguridad interina-formal, por dirección del CTO ante indisponibilidad del subagente AI-SEC-ENG en sesión).  
**Gate cubierto:** Governance §3.3 (revisión reforzada ante cambio de schema).

> Esta revisión no reemplaza una auditoría AI-SEC-ENG plena; la formaliza como control compensatorio con evidencia trazable, aceptada por el CTO en G7 dado el riesgo bajo del cambio.

## 1. Superficie revisada

| Componente | Archivo |
| --- | --- |
| Migración aditiva | `packages/database/src/migrations/tenant/068_add_purchase_order_resolution.ts` |
| Edición solicitud | `apps/api/src/modules/inventory/services/purchasing.service.ts` (`updatePurchaseRequest`) |
| Ciclo de vida OC | `apps/api/src/modules/inventory/services/purchasing.service.ts` (`approvePurchaseOrder`, `cancelPurchaseOrder`, `closePurchaseOrder`) |
| Endpoints | `apps/api/src/modules/inventory/purchasing.controller.ts` (PATCH + 3 POST nuevos) |
| DTOs | `apps/api/src/modules/inventory/dto/index.ts` (`UpdatePurchaseRequest*`, `CancelPurchaseOrder*`) |
| Frontend | `apps/portal/src/components/inventory/PurchaseRequestComposer.tsx`, `PurchaseWorkspace.tsx`, `InventoryClient.tsx` |

## 2. Checklist de controles

| Control | Resultado | Evidencia |
| --- | --- | --- |
| **Autorización (RBAC)** | ✅ | `@Roles(UserRole.ADMIN, NOC, SUPPORT)` en los 4 endpoints nuevos; miembros del enum, no literales. |
| **Aislamiento multi-tenant** | ✅ | `TenantContext.getOrThrow()` + `runInTenantSchema` en todos los métodos nuevos; todas las queries filtran por `tenantId`; tenant desde JWT, nunca desde input. |
| **Validación de entrada** | ✅ | `ZodValidationPipe` con `UpdatePurchaseRequestSchema` y `CancelPurchaseOrderSchema`; `ParseUUIDPipe` en todos los `:id`; whitelist `ValidationPipe` global activo. |
| **Inyección SQL** | ✅ | Solo API TypeORM parametrizada (`findOne`, `find`, `save`, `remove`); sin concatenación de SQL crudo. |
| **Boundary Modulith** | ✅ | Inventory no accede a tablas externas; `SupplierPartyPort` como única interfaz cross-module; sin FK cross-schema. |
| **Atomicidad / integridad** | ✅ | `updatePurchaseRequest` corre en `withTransaction`; remove de líneas + save de nuevas + update de cabecera en la misma transacción. Ciclo de vida OC también en `withTransaction`. |
| **Guarda de estado (TOCTOU)** | ✅ | Verificación de status se hace dentro de la misma transacción donde se persiste el cambio (`withTransaction` → `requirePurchaseOrder` → validación → `save`). No hay ventana de carrera. |
| **Auditoría** | ✅ | CUD auditado por `AuditInterceptor`; `approvedByUserId`, `cancelledByUserId`, `closedByUserId` persistidos; transiciones inválidas → `BadRequestException` (no muta estado). |
| **Exposición de PII / secretos** | ✅ | Sin PII en logs; `cancellationReason` es texto de negocio del propio tenant (misma clase que `exceptionReason`/`notes` existentes). |
| **Reversibilidad de schema** | ✅ | `068` aditiva (3 columnas nullable), `up()`/`down()` reversible, registrada en `runner.ts`. Sin backfill destructivo. |
| **Bloqueo por dependencias** | ✅ | `cancelPurchaseOrder` verifica que no existan recepciones (`GoodsReceipt`) antes de cancelar; `closePurchaseOrder` exige `FULLY_RECEIVED`. |
| **Inmutabilidad de `requestType`** | ✅ | `UpdatePurchaseRequestSchema` no incluye `requestType`; bloqueado en UI con `disabled={isEditMode}`. |
| **Condición de edición segura** | ✅ | `updatePurchaseRequest` verifica status ∈ {DRAFT, PENDING_QUOTES} **y** sin cotizaciones dentro de la misma transacción; ambas verificaciones antes de cualquier mutación. |

## 3. Hallazgos

- **Críticos / Altos:** ninguno.
- **Medios:** ninguno.
- **Bajos / observaciones (deuda preexistente, fuera de Fase 07):** `addSupplierQuote` y `createLineAwards` mantienen `void actor;` (no persisten actor propio más allá del `AuditInterceptor`). No es regresión de Fase 07; se registra para una fase de trazabilidad futura.

## 4. Dictamen

**APROBADO (riesgo bajo).** El cambio de schema es aditivo y reversible, sin PII sensible ni superficie de autenticación nueva; las nuevas rutas respetan RBAC, aislamiento tenant, validación de entrada y boundaries modulith. Las guardas de estado corren dentro de la transacción evitando TOCTOU. Sin hallazgos que bloqueen el merge. Se recomienda una pasada AI-SEC-ENG plena cuando el subagente esté disponible, como confirmación, sin retener el cierre de Fase 07.

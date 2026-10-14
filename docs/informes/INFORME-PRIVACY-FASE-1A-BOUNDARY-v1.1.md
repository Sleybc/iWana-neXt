# INFORME — Privacy Fase 1a · Revisión de boundary A25

**Versión:** 1.1  
**Fecha:** 2026-10-14  
**Revisor:** AI-BOUNDARY-REV (`boundary-reviewer`)  
**Alcance:** verificación de solo lectura de `AuditService.logWithin`, su uso por el adaptador de suplantación y las creaciones de `AuditLog` en código de producción de `apps/api/src/`. Q8 queda fuera.

## Resultado

**Sin hallazgos en el alcance A25 revisado.** El adaptador pasa a `logWithin` el mismo `EntityManager` que ejecuta la suspensión. `logWithin` sanea ambos payloads y propaga los errores de persistencia. La búsqueda de llamadas de creación/guardado en código de producción no encontró `AuditLog` fuera del módulo `audit`.

## Verificaciones

| Regla | Archivo:línea | Evidencia | Severidad |
| --- | --- | --- | --- |
| La auditoría de la suspensión debe usar el manager transaccional entregado por el llamador. | `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts:113` y `:129` | Después del `UPDATE contracts` realizado con `ctx.manager`, el adaptador llama `auditService.logWithin(..., ctx.manager)`. El módulo inyecta `AuditModule`, que exporta `AuditService` (`crm-privacy-adapters.module.ts:12`; `audit.module.ts:33`). | Sin hallazgo |
| `logWithin` debe sanear los valores y escribir mediante el manager recibido. | `apps/api/src/modules/audit/audit.service.ts:61` y `:74` | Crea y guarda `AuditLog` con `manager`; `oldValue` y `newValue` pasan por `sanitizeAuditPayload` (`:67` y `:68`). La operación no abre otra transacción. | Sin hallazgo |
| Los errores de auditoría deben propagarse para revertir la operación de negocio. | `apps/api/src/modules/audit/audit.service.ts:48` y `:74` | `manager.save` se espera directamente y `logWithin` no captura el error. El `catch` pertenece a `log()` (`:132` y `:138`), no a `logWithin`. | Sin hallazgo |
| Ningún módulo fuera de `audit` crea o guarda `AuditLog`. | `apps/api/src/modules/audit/audit.service.ts:61` y `:117` | La búsqueda de `create(AuditLog)`, `save(AuditLog)` y `new AuditLog` en código de producción encontró las dos creaciones dentro de `audit.service.ts` y ninguna fuera de `apps/api/src/modules/audit/`. Las referencias en specs son fixtures o verificaciones de integración. | Sin hallazgo |

La integración PostgreSQL incluida en `audit.service.transaction.postgres.integration.spec.ts:114`, `:153`, `:162`, `:171` y `:173` provoca un fallo de inserción de auditoría y comprueba que el contrato siga `ACTIVE`, que no quede fila de auditoría y que no se emita el evento. También verifica el saneamiento del payload en `:79`, `:102`, `:108` y `:111`. Esta revisión fue estática; no se volvió a ejecutar la integración.

## Archivos revisados

- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/audit/audit.module.ts`
- `apps/api/src/modules/audit/audit.service.spec.ts`
- `apps/api/src/modules/audit/audit.service.transaction.postgres.integration.spec.ts`
- `apps/api/src/modules/crm/privacy-adapters/crm-contract-impersonation.adapter.ts`
- `apps/api/src/modules/crm/privacy-adapters/crm-privacy-adapters.module.ts`
- `docs/informes/INFORME-PRIVACY-FASE-1A-BOUNDARY-v1.0.md`
- `docs/informes/INFORME-PRIVACY-FASE-1A-R2-v1.0.md`
- `docs/prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.3.md` §4 A25
- `docs/adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md`
- `AGENTS.md`, `.github/instructions/backend.instructions.md`, `.github/instructions/database.instructions.md`, perfil AI-BOUNDARY-REV y Protocolo §9


# Informe de fase — MOD09–MOD11 OT de instalación R2.2

**Versión:** 1.0
**Estado:** Implementación entregada para revisión cruzada
**Fecha:** 2026-07-31
**Agente:** AI-SR-FULL
**Prompt:** `docs/prompts/PROMPT-MOD09-MOD11-OT-INSTALACION-R2.2-v1.0.md`

## Alcance ejecutado

- `createFollowUp` y redrive revalidan ABAC dentro de la transacción tenant-aware.
- La OT conserva `organization_site_id`, con backfill desde `schedule_events.organization_site_id`.
- La política resource-aware exige usuario activo, perfil activo vigente, permiso de supervisión, sede activa y asignación/responsabilidad territorial vigente.
- El redrive acepta DTO estricto con `causeCode` sintácticamente acotado y `ticketId` obligatorio; valida DLQ, tenant, owner MOD11 y consistencia del agregado.
- La idempotencia del redrive incluye evento, tipo, causa y ticket; la auditoría conserva solo metadata mínima.
- Tasks y Templates aplican `JwtAuthGuard → TenantAwareThrottlerGuard → RolesGuard → PermissionsGuard`; redrive no tiene bypass en `ExecutionOrderAccessGuard`.

## Fuentes canónicas verificadas

- Scope WFM: `ScheduleEvent.organizationSiteId`, respaldado por ADR-040 §D3 y ADR-068 §Ownership de compromiso y asignación.
- Perfiles/permisos/asignaciones: entidades y migración del control plane de Organización/Acceso; permiso `operations.execution_orders.supervise` del catálogo compartido.
- Allowlist de eventos: ADR-068 §Eventos mínimos y `OperationalEventTypeV1`; solo eventos con owner MOD11 son redriveables.
- No se inventó un catálogo de valores para `causeCode`; se acotó la forma del código en el boundary HTTP hasta que el owner operativo publique el catálogo de causas.

## Evidencia

- API unit/integration suite sin filtro: `226 passed`, `4 skipped` preexistentes, `0 failed`.
- DB suite sin filtro: `12 passed`, `61 passed`, `0 failed`.
- API typecheck: exit 0.
- DB typecheck: exit 0.
- API lint: exit 0.
- DB lint: exit 0.
- Migración real tenant ejecutada contra PostgreSQL local: tenant `tenant_iwana`, migrator exit 0; columna e índice verificados en PostgreSQL.
- Pruebas focalizadas cubren follow-up permitido/fuera de alcance, revocación, allowlist, DLQ, idempotencia, metadata, validación de causa/ticket, aislamiento y orden de guards.

## Contrato y migración

- Contrato compartido actualizado en `packages/shared/src/contracts/operations/execution-orders.ts`.
- OpenAPI actualizado en `apps/api/openapi/tasks-execution-orders.v1.json`.
- La migración 098 existente queda integrada con la entidad y prueba de rollback seguro; el `down()` bloquea pérdida de scope sin `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`.

## Deuda y bloqueantes

- El catálogo semántico de `causeCode` no tiene una fuente canónica en los artefactos revisados; no se inventaron valores. El boundary usa longitud y charset acotados.
- La suite E2E y el re-gate G6 pertenecen a AI-SR-QA; no se declara G6/G7.
- No se modificó ningún registro de gate.

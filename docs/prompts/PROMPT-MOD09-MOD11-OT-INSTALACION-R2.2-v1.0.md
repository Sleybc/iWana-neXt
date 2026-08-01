# PROMPT — MOD09–MOD11 OT de instalación R2.2 Recuperabilidad y ABAC

**Versión:** 1.0  
**Estado:** Emitido — ejecución autorizada por AI-EM-ARCH  
**Fecha:** 2026-07-31  
**Modo:** Ejecución multiagente  
**Agente destinatario:** AI-SR-FULL  
**Revisión obligatoria:** AI-SEC-ENG, AI-SR-QA, AI-DATA-ENG si aplica

## Entradas y contratos congelados

- Plan: `docs/plans/2026-07-28-mod09-mod11-ot-instalacion-remediacion-g6.md`, R2.2.
- ADR-068 aprobado y contrato API v1 vigente en `packages/shared/src/contracts/operations/execution-orders.ts` y `apps/api/openapi/tasks-execution-orders.v1.json`.
- Dictamen SEC-ENG R2.2: el redrive y follow-up no pueden omitir ABAC resource-aware; el rate limit debe preceder permisos con consultas DB.
- Baseline: Modulith, tenant schema, interfaces tipadas, outbox/BullMQ; no CQRS/EDA nuevo.

## Alcance exacto

1. `createFollowUp` debe validar dentro de la misma transacción tenant-aware el alcance server-owned de la OT: `organizationSiteId`, perfil activo, permiso de supervisión y asignación organizacional/territorial vigente. No usar `siteId`, municipio, sector ni datos del request como autoridad.
2. Si la OT carece de scope server-owned, el resultado debe ser fail-closed y uniforme `404`; no se permite un bypass temporal.
3. Añadir una migración tenant reversible para el scope server-owned, con backfill seguro desde la relación WFM existente. Si no existe una fuente canónica, detener y emitir `[BLOQUEO]` a AI-EM-ARCH; no inventar datos.
4. `redriveEvent` debe recibir DTO estricto con `causeCode` acotado y `ticketId` obligatorio. Debe validar allowlist de eventos retryables cuyo agregado sea MOD11, consistencia de `aggregateId`/`payload.executionOrderId`, DLQ, tenant y ABAC dentro de la transacción.
5. La idempotencia del redrive debe incluir `eventId`, tipo, causa y ticket. Auditar solo metadata mínima, sin payload completo ni PII.
6. `ExecutionOrderAccessGuard` no puede devolver `true` automáticamente para redrive. El servicio repite la validación dentro de la transacción para evitar TOCTOU.
7. Uniformar el orden `JwtAuthGuard → TenantAwareThrottlerGuard → RolesGuard → PermissionsGuard → ABAC` en Tasks y Templates.

## Restricciones

- No cambiar rutas ni aceptar alias obsoletos sin actualización de shared/OpenAPI.
- No relajar aislamiento tenant, permisos ni anti-enumeración: recurso fuera de alcance responde 404 uniforme.
- No escribir datos personales, secretos o payloads completos en logs/auditoría.
- No modificar OT terminal.
- No tocar frontend.

## Entregables y verificación

- Código, migración reversible, shared/OpenAPI y tests.
- Tests de follow-up permitido/fuera de scope, revocación entre lectura y comando, redrive allowlisted/no allowlisted, causa/ticket ausentes, idempotency conflict, metadata mínima, dos tenants y guard order.
- Typecheck, lint, suite API sin filtro y evidencia PostgreSQL real para la migración si la infraestructura está disponible. Si no está disponible, emitir `[BLOQUEO]`; no usar `skip` silencioso.
- Commit(s) separados de cualquier registro de gate.

## Stop/go

Detener y consultar a AI-EM-ARCH si el scope WFM no tiene fuente canónica, si se requiere cambiar boundary, si el evento no tiene owner MOD11 verificable o si el contrato exige una decisión CTO/ADR.

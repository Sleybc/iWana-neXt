# INFORME-PRIVACY-FASE-1-Q1-v1.1

**Fecha:** 2026-10-14  
**Estado:** Entrega Q1 implementada; integración tenant aprobada. La prueba de la migración pública 027 queda para CI G6.5, como permite el encargo.  
**Bloque:** Q1 — DDL v1.1, backfill y evidencia de Media  
**Fuentes:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md), [plan Fase 1 v1.1](../plans/2026-10-14-privacy-habeas-data-fase-1.md), [prompt v1.1](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.1.md) y [prompt v1.0 §2 C-PRIV-DDL](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md).

## Entrega

- Se extendió la migración tenant 146 con A1: campos cifrados del solicitante, tipo documental alineado con `DocumentTypeParty`, evidencia `privacy_evidence` y método/actor/fecha de verificación. Se refuerza que una solicitud no avance a trámite sin verificación.
- A2 añade `impersonation_complaint_due_at`, `suspended_contract_ids` y `data_subject_request_tasks`, con los dos tipos de tarea definidos y un trigger que impide cambiar o limpiar `done_at` una vez fijado. `due_at` de tarea es `date`: conserva fechas límite civiles y la tarea inmediata vence el día de `received_at`.
- A3 añade `purpose` nullable con reglas de persistencia coherentes con la revocatoria: obligatorio para `REVOCAR` y nulo para los demás derechos.
- Se creó la migración pública 027 que amplía `chk_media_assets_usage` desde el estado de la 026. Es idempotente; el rollback aborta si quedan assets `privacy_evidence`, incluidos los eliminados lógicamente.
- Se añadió `MediaUsage.PRIVACY_EVIDENCE` y los mappings TypeORM de solicitudes y tareas. `DataAuthorizationEntity.evidenceMediaId` ya existía desde Ola 1. Las migraciones 146 y 147 siguen registradas en el runner tenant.
- Las tablas heredadas permanecen intactas; el backfill conserva las filas no resueltas y reporta conteos sin datos personales.

## Verificación ejecutada

| Comando / evidencia | Resultado real |
| --- | --- |
| `pnpm --filter @iwana/db exec jest --runInBand --no-cache src/migrations/tenant/146_privacy_module.spec.ts src/migrations/tenant/147_seed_privacy_permissions.spec.ts src/migrations/tenant/migration-order.spec.ts src/migrations/public/026_media_usage_stratum_evidence.spec.ts src/migrations/public/027_media_usage_privacy_evidence.spec.ts src/migrations/public/migration-order.spec.ts` | **6 suites aprobadas; 32 tests aprobados.** Incluye orden/registro, comportamiento idempotente y reversibilidad declarada para 027. |
| `DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=dbiw pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand src/migrations/tenant/146_privacy_module.integration.spec.ts src/migrations/tenant/147_seed_privacy_permissions.integration.spec.ts` | PostgreSQL real alcanzable. **2 suites aprobadas; 2 tests aprobados.** 146 ejecutó `up/down/up` y 147 `up/up/down/up` en schema tenant efímero; cleanup completado. |
| `pnpm --filter @iwana/db typecheck` | Pasa. |
| `pnpm --filter @iwana/db build` | Pasa; TypeScript compiló las migraciones y entidades. |
| `DB_NAME=test` integración pública 027 | **No ejecutada:** la base `test` no existe. No hay base `iwana_it_*` y `iwana_migrator` no tiene permiso `CREATEDB`; por seguridad no se corrió DDL público contra `dbiw`. El prompt permite diferir esta integración a CI G6.5. Jest reportó 1 suite y 3 tests omitidos por falta de base; no se cuenta como evidencia de pase. |
| `pnpm --filter @iwana/api typecheck` | **Pase final confirmado por el orquestador tras integrar Q2/Q3.** Una corrida intermedia falló mientras esos cambios seguían incompletos (`mimetype` en un spec de Media e imports de Requests aún ausentes); ese fallo transitorio quedó resuelto. |

En PostgreSQL, la integración de 146 confirmó rechazos de `UPDATE` y `DELETE` en `legal_texts`, `data_authorizations`, `data_subject_request_events` y `party_privacy_marks`; rechazó reabrir una tarea cerrada, procesar una solicitud a `EN_TRAMITE` sin verificación y reducir la retención mínima. También verificó que las fuentes heredadas sobreviven al `down`.

## Reporte de backfill

Conteos observados en fixtures sintéticos dentro del schema efímero de la integración. **No son conteos de datos de tenants existentes.** Las mismas cifras se mantuvieron en las tres ejecuciones de 146 (primera subida, repetición idempotente y subida tras reversión).

| Origen | Filas de origen | Resueltas | No resueltas | Filas destino | Detalle |
| --- | ---: | ---: | ---: | ---: | --- |
| `consent_records` | 2 | 1 | 1 | 2 autorizaciones | La fila mapeable generó `LEGACY_IMPORT` y `REVOCATION`; la otra quedó para reconciliación. |
| `habeas_data_consents` | 2 | 1 | 1 | 1 autorización | Una relación resolvió a Party; una quedó sin Party. |
| `arco_requests` | 2 | 1 | 1 | 2 solicitudes | Tipos reconocidos: 2; una solicitud quedó con `party_id = null` para reconciliación. |

Las tres tablas fuente siguen presentes tras `down`; no se descarta ninguna fila. La salida de migración contiene solo agregados y no incluye PII.

## Rutas y límites

- El informe v1.1 estaba libre al arrancar. Las migraciones 146/147, sus unit specs, el runner y las entidades de privacidad ya contenían la implementación no commiteada de Ola 1; se continuó ese trabajo sin revertirlo.
- Se tocaron únicamente migraciones/entidades asignadas a Q1 y el registro público 027. No se editaron CRM ni las rutas de Q2/Q3/Q4. Se avisó a Q3 de que debe registrar las entidades de solicitud y tarea en su módulo `requests/**`.
- No se hicieron commits ni se ejecutó la Fase 04 de suscriptores.

## Deuda nueva por severidad

- **P1 — Antes de G6.5:** ejecutar en CI la integración de la migración pública 027 en una base `test` o `iwana_it_*`, con la tabla pública y el estado de CHECK de la 026. La suite de integración está creada; no se pudo correr localmente porque no hay una base permitida disponible.
- **P2 — Operativa:** al desplegar por tenant, recoger los conteos reales de `consent_records`, `habeas_data_consents` y `arco_requests`; conciliar las filas que no resolvieron Party o finalidad. Los conteos de este informe corresponden solo al fixture.

**Gate Q1:** `up/down/up`, triggers y backfill de 146, más `up/down/up` de 147, comprobados contra PostgreSQL real. La validación pública 027 queda explícitamente diferida a G6.5.

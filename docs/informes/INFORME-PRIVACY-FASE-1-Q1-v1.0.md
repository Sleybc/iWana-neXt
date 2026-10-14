# INFORME-PRIVACY-FASE-1-Q1-v1.0

**Fecha:** 2026-10-14  
**Bloque:** Q1 — DDL, backfill y permisos  
**Estado:** Implementación preparada; gate de PostgreSQL real pendiente. No aprobado.

## Alcance entregado

- Migración tenant 146 con las siete tablas de C-PRIV-DDL, triggers de solo anexar, protección del mínimo de retención y semilla D7, incluido `PROSPECTO_SIN_CONTRATO = 2` años.
- Backfill idempotente de `consent_records`, `habeas_data_consents` y `arco_requests`, con `addColombiaBusinessDays` para los vencimientos heredados, preservación de las fuentes y salida agregada sin datos personales.
- Migración 147 con `privacy.read`, `privacy.manage` y la plantilla «Oficial de protección de datos», siguiendo la convergencia RBAC de la migración 119.
- La plantilla fija `base_role_constraint = 'AUDITOR'` para que el resolvedor runtime la considere compatible con ese rol; `down` elimina sus asignaciones de permisos y la desactiva sin borrar el perfil.
- Siete entidades TypeORM de solo mapeo bajo `apps/api/src/modules/privacy/entities/` y registro de ambas migraciones en el runner.
- Specs unitarias y una spec de integración que prepara fixtures sintéticos para los tres orígenes, `up/down/up`, idempotencia y rechazo de UPDATE/DELETE.

## Verificación

| Verificación                                                                                                                                                                                                       | Resultado real                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/db typecheck`                                                                                                                                                                                | Pasa                                                                                                                                                                               |
| `pnpm --filter @iwana/api typecheck`                                                                                                                                                                               | Pasa                                                                                                                                                                               |
| `pnpm --filter @iwana/db exec jest --runInBand --silent src/migrations/tenant/146_privacy_module.spec.ts src/migrations/tenant/147_seed_privacy_permissions.spec.ts src/migrations/tenant/migration-order.spec.ts` | **3 suites aprobadas; 11 tests aprobados**                                                                                                                                         |
| Integración `pnpm exec cross-env DB_NAME=test pnpm --filter @iwana/db exec jest --config jest.integration.config.js --runInBand src/migrations/tenant/146_privacy_module.integration.spec.ts`                      | **No ejecutada**: el setup omitió la suite porque no pudo conectar a `127.0.0.1:5433/test` (`connect ECONNREFUSED 127.0.0.1:5433`). Jest reportó 1 suite omitida y 1 test omitido. |

No se verificó `up/down/up` contra PostgreSQL real ni se ejecutaron allí los rechazos de UPDATE/DELETE. La spec contiene dos fixtures sintéticos por origen (uno resoluble y uno no resoluble), pero la suite omitida no constituye evidencia de ejecución.

## Reporte de backfill

Los conteos reales de origen, destino, resueltos y no resueltos **no están disponibles**: dependen de ejecutar la migración y la spec contra PostgreSQL, y ninguna conexión estuvo disponible en esta sesión. La migración registra conteos agregados por origen al ejecutarse. Las tablas fuente se conservan; las filas que no se puedan mapear permanecen disponibles para reconciliación.

## Rutas y concurrencia

- El orquestador confirmó que las rutas asignadas a Q1 estaban libres al iniciar.
- En la comprobación final, dentro de las rutas de propiedad Q1 solo aparecen el runner, las dos migraciones y sus specs, las siete entidades y este informe. El archivo de informe no existía antes de esta ejecución.
- No se editaron CRM ni las rutas de Q2, Q3 o Q4. No se ejecutó la Fase 04 de suscriptores.

## Deuda nueva por severidad

- **P1 — Bloqueante:** repetir la spec integrada `146_privacy_module.integration.spec.ts` contra PostgreSQL real y obtener evidencia de `up/down/up`, backfill idempotente y rechazo de UPDATE/DELETE. Bloqueo observado: `ECONNREFUSED 127.0.0.1:5433`.
- **P2 — Operativa:** después de ejecutar por tenant, capturar los conteos reales por origen y reconciliar las filas no resueltas sin eliminar las fuentes heredadas.

**Gate Q1:** pendiente. Las pruebas unitarias y ambos typechecks pasan; el gate integrado no se declara aprobado.

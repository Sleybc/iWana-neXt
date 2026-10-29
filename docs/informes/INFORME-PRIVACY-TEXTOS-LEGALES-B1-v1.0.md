# Informe — Privacy, textos legales B1

**Versión:** 1.1  
**Estado:** Cerrado — CA-LT-01 a CA-LT-06 en verde  
**Fecha:** 2026-10-29

## Alcance del cierre

Se continuó sobre el diff existente y se consumió la spec congelada v1.1. La decisión D-B1-1 quedó implementada: `PUT /privacy/purposes` declara `@Roles(UserRole.ADMIN, UserRole.AUDITOR)` junto con `@Permissions(PRIVACY_MANAGE)`. No se añadió `RolesGuard` y no se modificó la spec. Se completaron el inventario de reversión destructiva de la migración 166, el fixture propio de expediente y las evidencias HTTP y PostgreSQL pendientes.

## Criterios de aceptación

| CA | Resultado | Evidencia |
| --- | --- | --- |
| CA-LT-01 | Verde | Integración PostgreSQL de la migración: filas anteriores en `PLAIN`, inmutabilidad append-only, checks y ciclo `up → down → up`. |
| CA-LT-02 | Verde | Prueba unitaria confirma que el hash del contenido no depende del formato. |
| CA-LT-03 | Verde | HTTP Supertest: `GET current` responde 200; `GET list` y `POST` responden 403 sin permisos de privacidad. |
| CA-LT-04 | Verde | HTTP Supertest: deshabilitar `TRATAMIENTO_CONTRACTUAL` responde 422 `PRIVACY_PURPOSE_REQUIRED`. |
| CA-LT-05 | Verde | PostgreSQL real: concesión con finalidad deshabilitada responde 422; revocación y `LEGACY_IMPORT` se conservan. |
| CA-LT-06 | Verde | PostgreSQL real: auditoría conserva los estados anterior y nuevo y no contiene PII. |

## Evidencia sin caché de Turbo

Las pruebas se invocaron directamente con Jest o con el ejecutor de integración PostgreSQL, sin `turbo run` ni reproducción de resultados de Turbo. Las cifras son salidas literales de las ejecuciones de este árbol.

| Comando | Resultado | Alcance |
| --- | --- | --- |
| `pnpm --filter @iwana/api exec jest src/modules/privacy --runInBand --silent` | 34 suites, 153 pruebas aprobadas | Incluye OpenAPI, servicios, controladores HTTP y composición del módulo. |
| `pnpm --filter @iwana/api exec jest src/modules/privacy/legal-texts/legal-texts.service.spec.ts src/modules/privacy/legal-texts/legal-texts.controller.http.spec.ts src/modules/privacy/purposes/purposes.controller.http.spec.ts --runInBand --silent --no-cache` | 3 suites, 6 pruebas aprobadas | Hash, CA-LT-03 y CA-LT-04. |
| Integración PostgreSQL `146_privacy_module.integration.spec.ts`, con `IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_NAME=dbiw` | 1 suite, 11 pruebas aprobadas | CA-LT-01; incluye ciclo reversible y restricciones de 166. |
| Integración PostgreSQL `privacy-purposes.postgres.integration.spec.ts`, `--config jest.integration.config.js`, `--no-cache` | 1 suite, 1 prueba aprobada | CA-LT-05 y CA-LT-06. |
| `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand --no-cache` | 1 suite, 6 pruebas aprobadas | Registro y orden de migraciones. |
| `pnpm --filter @iwana/shared exec jest privacy-schemas --runInBand --no-cache` | 1 suite, 8 pruebas aprobadas | Contratos de formato y finalidades. |
| Invariante de permisos, reversión tenant y fixture propio de expediente | 3 suites, 155 pruebas aprobadas | R1, R2 y R3; no se modificó el fixture WFM de MOD13. |
| ESLint focalizado de `apps/api/src/modules/privacy` y expediente | Sin errores ni advertencias | Incluye archivos del bloque y fixture propio. |
| `pnpm --filter @iwana/api typecheck` | Falló por un diagnóstico | Único diagnóstico: `wfm-organization-sites.adapter.spec.ts` no implementa `findRouterSummariesByIds`, cambio ajeno de MOD13. No se editó. |

## Deuda nueva por severidad

| Severidad | Deuda nueva introducida por B1 |
| --- | --- |
| Alta | Ninguna. |
| Media | Ninguna. |
| Baja | Ninguna. |

## Pendientes preexistentes o fuera del bloque

- **Media, externa:** el typecheck global de API continúa bloqueado por el fixture WFM de MOD13 descrito arriba.
- **Media, preexistente y fuera de alcance:** el legado `crm/habeas-data` conserva `legalTextVersion` libre y sin hash (spec §7).
- **Revisión B4:** `@Roles` en los controladores de privacy es declarativo mientras `RolesGuard` no se aplique; no se cambió el comportamiento fuera de D-B1-1.
- No se midió cobertura del paquete en este cierre; ese gate debe medirse antes de merge. No se hizo commit ni publicación en un tenant.
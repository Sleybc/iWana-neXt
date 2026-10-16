# INFORME — Privacy Fase 1B v1.1 · B1

**Estado:** Completado para B1: S1′, cierre transaccional de `DATOS_BLOQUEADOS` y S3 ejecutados.  
**Fecha:** 2026-10-16  
**Agente:** `sr-backend` · AI-SR-FULL

## Alcance realizado

- Migración tenant 150: agrega `anonymized_at` y `anonymized_request_id` a `party`, `subscribers` y `expediente_records`; exige que ambos valores sean nulos o estén presentes y evita que una marca fijada se reescriba. No introduce FK hacia `privacy`. El `down()` protege el rastro ya escrito con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` y está anunciado en el plan de revert.
- Migración tenant 151: registra `crm.blocked_data.read` con versión `ADR-094_PRIVACY_V1B` y crea la plantilla de sistema «Facturación y cobro», restringida a `ACCOUNTANT` y con ese permiso únicamente. No asigna la plantilla a usuarios.
- Añade `AccessPermissionKey.CRM_BLOCKED_DATA_READ` y registra ambas migraciones al final de `TENANT_MIGRATIONS`.
- Al resolver una supresión, después de anonimizar correctamente y dentro de la misma transacción, `resolveSuppression` cierra `DATOS_BLOQUEADOS` solo si el último evento de la marca del Party es `OPEN`. Sin Party o sin marca activa no crea un cierre.
- Tras el aviso de B2 de que completó el paso 2, S3 retiró `PersonalDataErasureUnavailableAdapter` y su provider de respaldo. `IPersonalDataErasurePort` queda resuelto por el adaptador CRM publicado desde `CrmPrivacyAdaptersModule`.

## Evidencia de verificación

Todas las corridas Jest indicadas abajo usaron `--no-cache`.

| Verificación                                               | Resultado                                                                                                                                                                                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integración PostgreSQL de migraciones 150/151              | 2 suites, 2 tests; `up/down/up`, trigger, protección de rollback destructivo y perfil/permisos comprobados en PostgreSQL real                                                                                                       |
| `migration-order.spec.ts`                                  | 1 suite, 6 tests                                                                                                                                                                                                                    |
| `access-permission-catalog.invariant.spec.ts`              | 1 suite, 18 tests                                                                                                                                                                                                                   |
| `apps/api/src/modules/privacy` con cobertura               | 31 suites, 144 tests; statements 93,31 %, branches 81,99 %, functions 88,29 %, líneas 93,70 %                                                                                                                                       |
| Revalidación de puertos tras S3, Jest `--no-cache`         | 1 suite, 2 tests aprobados                                                                                                                                                                                                          |
| Revalidación inicial de Privacy tras S3                    | 30 suites aprobadas, 1 suite fallida antes de recoger tests; 143 tests aprobados. `privacy.module.spec.ts` falló por la carga ESM de `@scure/base` vía `UsersModule` → `AuthModule` → `otplib`; esta corrida no se considera verde. |
| Integración PostgreSQL de solicitudes Privacy              | 1 suite, 15 tests; incluye rollback ante error del participante y cierre de marca con retención vencida                                                                                                                             |
| Typecheck y build de `@iwana/db`                           | Aprobados                                                                                                                                                                                                                           |
| Typecheck y build de `@iwana/shared`                       | Aprobados                                                                                                                                                                                                                           |
| Typecheck de `@iwana/api`                                  | Aprobado en la revalidación posterior a los cambios B2/B3                                                                                                                                                                           |
| ESLint de los archivos B1 modificados y `git diff --check` | Aprobados                                                                                                                                                                                                                           |

El test de cierre se ejecutó primero contra el código sin la regla y falló porque la marca quedaba abierta; pasó al incorporar el cierre transaccional.

## Deuda nueva por severidad

| Severidad      | Deuda                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crítica / Alta | Ninguna detectada en B1.                                                                                                                                                                                                                               |
| P1 / Alta      | Ninguna deuda de implementación en B1. Fuera de esta propiedad, B2 documenta un `[BLOQUEO]` por falta de un puerto interno Privacy para descubrir evidencia de autorizaciones/solicitudes desde la ruta API; ver `INFORME-PRIVACY-FASE-1B-B2-v1.1.md`. |
| P2 / P3        | Ninguna deuda nueva de B1; cobertura integral Privacy posterior al aislamiento y typecheck API pasan.                                                                                                                                                  |

No se registraron PII, ciphertext, HMAC ni claves en el código o en este informe. No se hizo commit.

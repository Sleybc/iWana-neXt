# Informe R2 — auditoría transaccional A25

**Fecha:** 2026-10-14  
**Estado:** Cerrado  
**Alcance:** `AuditService.logWithin` y su uso en la suspensión de contratos por suplantación.

## Resultado

`AuditService.logWithin(entry, manager)` guarda `AuditLog` con el `EntityManager` recibido, resuelve el tenant desde los datos explícitos o `TenantContext`, sanea `oldValue` y `newValue` con `sanitizeAuditPayload` y propaga errores. `AuditService.log()` no cambió.

`CrmContractImpersonationAdapter` dejó de crear `AuditLog`: ahora usa `logWithin` dentro de la misma transacción que suspende el contrato. `CrmPrivacyAdaptersModule` importa `AuditModule` para resolver el servicio. Se ajustaron únicamente las dos instanciaciones directas de la integración B5 para inyectar el servicio.

## Verificación

| Comando / verificación                                                                                                                                              | Resultado                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @iwana/api exec jest src/modules/audit/audit.service.spec.ts --runInBand --no-cache`                                                                 | 1 suite, 13/13 tests aprobados. Incluye uso del manager, resolución del tenant, saneamiento y propagación de errores.                                                                                |
| Integración `audit.service.transaction.postgres.integration.spec.ts` con `IWANA_DB_INTEGRATION_AVAILABLE=true`, `DB_HOST=127.0.0.1`, `DB_PORT=5433`, `DB_NAME=dbiw` | PostgreSQL real; schema efímero; 1 suite, 2/2 tests aprobados. El payload persistido omite campos sensibles; un fallo provocado del INSERT de auditoría revierte la suspensión y no emite el evento. |
| Integración `b5-identity-conversion.postgres.integration.spec.ts` con `E2E_TENANT_SLUG=iwana`                                                                       | PostgreSQL real; 1 suite, 16/16 tests aprobados, incluida suspensión y auditoría.                                                                                                                    |
| `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                              | API: 357 suites aprobadas, 4 omitidas; 4.869 tests aprobados, 15 omitidos (4.884 total). Turbo: 4 tareas exitosas, 0 en caché.                                                                       |
| `pnpm --filter @iwana/api typecheck`                                                                                                                                | Exit code 0.                                                                                                                                                                                         |
| ESLint sobre los archivos R2, `prettier --check` y `git diff --check`                                                                                               | Exit code 0.                                                                                                                                                                                         |
| Búsqueda de `.create(AuditLog)` / `.save(AuditLog)` fuera de `apps/api/src/modules/audit/**`                                                                        | Sin coincidencias.                                                                                                                                                                                   |

## Deuda nueva

Ninguna.

# MOD13 — Pruebas R-pg · Ola 9

**Versión:** 1.0 · **Fecha:** 2026-10-23 · **Responsable:** sr-backend  
**Estado:** En revisión — ejecución R-pg completada

## Encargo y resultado

Ejecución del [prompt §R-pg y §Ola 9](../prompts/PROMPT-MOD13-APROVISIONAMIENTO-FASE-01-v1.1.md), conforme al [plan](../plans/2026-10-22-mod13-aprovisionamiento.md) y al HLD v1.1 congelado. Se ejecutaron las cuatro suites `*.postgres.integration.spec.ts` de `network`, empezando por auditoría: **4 suites aprobadas, 23 tests aprobados, 0 fallidos y 0 omitidos**.

No se modificó código de producto, no se migraron tenants `ACTIVE` y no se realizó commit. Las suites usan schemas y colas de integración propios y sus rutinas de limpieza. La caché de Jest se dirigió a `%TEMP%/mod13-rpg-jest`, fuera del repositorio.

## Precondiciones verificadas

Consulta PostgreSQL dentro de `BEGIN READ ONLY` / `ROLLBACK`, usando la configuración local sin imprimir valores sensibles; Redis verificado mediante `PING` / `PONG`.

| Precondición | Evidencia |
| --- | --- |
| 1 · Servicios | PostgreSQL accesible en 5433 y Redis en 6380; consultas y `PING` satisfactorios. |
| 5 · Migraciones públicas | `EnableBtreeGist` registrada en `public.typeorm_migrations`. |
| 5 · Migraciones tenant | 160–164 registradas en los seis tenants `ACTIVE`, mediante consultas de solo lectura. |
| 5 · Least privilege | En los seis tenants activos, `iwana_app` tiene SELECT/INSERT/UPDATE/DELETE sobre las seis tablas de red comprobadas y no tiene UPDATE/DELETE sobre `audit_logs`. La aplicación previa de `db:apply-least-privilege` consta también en el [informe Ola 9-pre](INFORME-MOD13-OLA-9-PRE-CIERRE-v1.0.md). No se reaplicó el script. |

## Ejecución y conteo

Se listaron primero las suites con `--listTests`: cuatro rutas, ninguna lista vacía. Para ambas corridas se definieron `IWANA_DB_INTEGRATION_AVAILABLE=true` e `IWANA_REDIS_INTEGRATION_AVAILABLE=true`, se empleó `jest.integration.config.js`, `--runInBand`, `--no-cache` y `--cacheDirectory` fuera del repositorio.

| Orden | Suites ejecutadas | Suites aprobadas | Tests aprobados | Omitidos | Tiempo Jest |
| --- | --- | --- | --- | --- | --- |
| 1 | `service-provisioning.audit.postgres.integration.spec.ts` | 1 | 6 | 0 | 12.888 s |
| 2 | `network-execution-event.postgres.integration.spec.ts`, `tests/ipam.service.postgres.integration.spec.ts`, `tests/network-catalog.service.postgres.integration.spec.ts` | 3 | 17 | 0 | 19.163 s |
| Total | Cuatro suites `network` | **4** | **23** | **0** | — |

Comandos, desde la raíz, con `$cachePath` apuntando al directorio temporal indicado:

```powershell
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache --cacheDirectory $cachePath --listTests modules/network
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache --cacheDirectory $cachePath --runTestsByPath src/modules/network/service-provisioning.audit.postgres.integration.spec.ts
pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runInBand --no-cache --cacheDirectory $cachePath --runTestsByPath src/modules/network/network-execution-event.postgres.integration.spec.ts src/modules/network/tests/ipam.service.postgres.integration.spec.ts src/modules/network/tests/network-catalog.service.postgres.integration.spec.ts
```

Salida literal de auditoría:

```text
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

Salida literal de las otras tres suites:

```text
Test Suites: 3 passed, 3 total
Tests:       17 passed, 17 total
```

La suite de catálogo emite `TYPEORM_QUERY_ERROR operation=INSERT sqlstate=P0001` durante la provocación controlada de fallo de auditoría; la prueba correspondiente pasa. No es un fallo de la corrida.

## Reversión de auditoría y alcance del cierre

Los seis tests de auditoría confirman la reversión de reserva, certificación y liberación cuando falla la auditoría; la auditoría real de liberación por reemplazo y nueva regularización; y la reversión ante fallo en cada una de las dos auditorías del reemplazo. Esta ejecución aporta la evidencia runtime pendiente de SEC-IMPL-01.

IPAM incluye el caso de 20 reservas concurrentes sin duplicados. Las suites restantes cubren catálogo y eventos/reintentos/reconciliación contra PostgreSQL y Redis reales. Esta evidencia cierra R-pg; no sustituye V1, F1-v, V4-bis ni la medición de cobertura de V5.

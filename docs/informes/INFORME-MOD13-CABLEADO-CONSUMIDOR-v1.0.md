# INFORME-MOD13-CABLEADO-CONSUMIDOR-v1.0

**Fecha:** 2026-10-23  
**Bloque:** Ola 14 · B-wire  
**Estado:** pruebas integradas aprobadas con PostgreSQL y Redis reales.

## Cambios

- `apps/api/src/modules/network/tests/network-execution-event.wiring.postgres.integration.spec.ts` inicia el `AppModule` real —incluidos `NetworkModule` y sus módulos estrechos— y entrega eventos firmados a la cola BullMQ real. La fixture usa un schema tenant efímero en PostgreSQL, creado con las migraciones 160 y 161 y eliminado al terminar.
- Para `EXECUTED` sobre `CERTIFIED`, verifica inbox procesado, servicio e IP `ACTIVE`, evento `network.service-provisioning.activated` emitido una sola vez y reentrega sin cambio de estado, auditoría ni segundo evento.
- Para `NOT_EXECUTED` sobre `RESERVED`, verifica servicio e IP `RELEASED` e inbox procesado.
- `apps/api/src/modules/network/tests/network-errors-and-boundary.arch.spec.ts` inspecciona las entidades importadas y usadas por `network` en operaciones de TypeORM y las compara con los `forFeature` de los módulos alcanzables desde `NetworkModule`. La prueba incluye `IpAssignment`, `NetworkInboxEvent` y `ServiceProvisioning`.
- `apps/api/src/app.module.boot.spec.ts` ya contenía una prueba del grafo de arranque; se ejecutó sin cambios. La nueva integración también inicializa el `AppModule` completo con los proveedores reales.

No se sustituyeron puertos ni entidades. El test de cableado aísla BullMQ en una base Redis local que se comprobó vacía y limpia al finalizar. Jest sustituye únicamente `otplib`, dependencia de TOTP que no interviene en el flujo probado.

## Evidencia y conteo real

| Comando | Suites | Tests | Aprobados | Fallidos | Omitidos |
| --- | ---: | ---: | ---: | ---: | ---: |
| `network-execution-event.wiring.postgres.integration.spec.ts` con `IWANA_DB_INTEGRATION_AVAILABLE=true` e `IWANA_REDIS_INTEGRATION_AVAILABLE=true` | 1 | 2 | 2 | 0 | 0 |
| `network-execution-event.postgres.integration.spec.ts` con ambas integraciones habilitadas | 1 | 5 | 5 | 0 | 0 |
| `network-errors-and-boundary.arch.spec.ts` | 1 | 3 | 3 | 0 | 0 |
| `app.module.boot.spec.ts` | 1 | 1 | 1 | 0 | 0 |
| **Total** | **4** | **11** | **11** | **0** | **0** |

Verificaciones adicionales:

- `pnpm --filter @iwana/api typecheck`: aprobado.
- `pnpm --filter @iwana/api lint`: 0 errores; 7 warnings existentes en `main.ts`, auditoría, inventario, tasks y taxation, fuera de los archivos MOD13 de esta ola.
- `pnpm --filter @iwana/api build`: aprobado.
- PostgreSQL confirmó que la OT FX-v1 sigue `RESERVED`. La fixture sintética se limpió al terminar; `tenant_iwana` no se consultó ni modificó.
- No quedaron cachés Jest dentro de `apps/api`; no se migraron tenants `ACTIVE` ni se hizo commit.

## Deuda

No se identifica deuda nueva P0–P3 para B-wire.

# Informe de fase — MOD11 R2.5 rate limit por actor y tenant

**Versión:** 1.0
**Estado:** Implementado — pendiente de consolidación G6/G7
**Fecha:** 2026-07-30
**Fase:** R2.5 del plan de remediación G6
**Responsable:** AI-SR-FULL

## Resultado

Se corrigió el rate limiting de las órdenes de ejecución para que el límite sea
distribuido y se aplique por `bucket + actor + tenant`. El tenant y el actor se
obtienen exclusivamente del JWT que ya pasó `JwtAuthGuard`; no se leen del
body, query ni headers de entrada.

## Cambios verificables

- `TenantAwareThrottlerGuard` usa el `REDIS_CLIENT` global, compartido con la
  configuración Redis de BullMQ.
- `TasksModule` declara explícitamente `RedisModule` como owner de la
  dependencia de configuración del store; no crea una conexión paralela ni
  lee secretos directamente.
- El incremento y el TTL se realizan con un script Redis atómico
  (`INCR` + `PEXPIRE`), evitando multiplicar el límite por réplica.
- El comando Redis tiene timeout de 100 ms. Error o timeout produce
  `503 RATE_LIMIT_STORE_UNAVAILABLE` (fail-closed), sin exponer detalles de
  infraestructura.
- `ExecutionOrdersController` declara el orden efectivo:
  `JwtAuthGuard → TenantAwareThrottlerGuard → RolesGuard → PermissionsGuard →
  ExecutionOrderAccessGuard`.
- El test HTTP ya no sustituye el guard para comprobar `429`: ejecuta el guard
  real con una ráfaga controlada y un double compartido que reproduce la
  operación atómica del store Redis.
- No se añadieron variables de entorno, credenciales ni secretos al repositorio.
  Ownership de configuración permanece en `RedisModule`/`ConfigService` y la
  conexión Redis de BullMQ de `AppModule`.

## Evidencia de tests

Comandos ejecutados:

```text
pnpm.cmd --filter @iwana/api typecheck
pnpm.cmd --filter @iwana/api lint
pnpm.cmd --filter @iwana/api build
pnpm.cmd --filter @iwana/api exec jest src/modules/tasks/tests/execution-orders.controller.http.spec.ts --runInBand
```

Resultado de la suite HTTP: **52/52 tests aprobados**.

Casos R2.5 cubiertos:

1. Ráfaga de 11 solicitudes sobre el bucket de evidencia: una respuesta `429`.
2. Actor distinto en el mismo tenant: bucket independiente.
3. Tenant distinto: bucket independiente.
4. Error Redis: `503` fail-closed.
5. Timeout Redis: `503` fail-closed.
6. Encabezados `X-RateLimit-*` en lectura permitida.
7. Orden del guard de rate limit antes del guard ABAC de la OT.

## Consulta PLAT-OPS

Se registró consulta asíncrona a AI-PLAT-OPS para confirmar que el cliente
Redis global y BullMQ usan el mismo Redis baseline operativo. La implementación
no depende de una variable nueva ni de un cambio de topología; la confirmación
queda para la revisión de plataforma del gate.

## Contrato y migraciones

- Contrato HTTP público: sin cambio.
- OpenAPI: sin cambio.
- Migraciones: no requeridas.
- Dependencias npm: sin cambio.

## Deuda / bloqueantes

No quedan bloqueantes técnicos de implementación en R2.5. La confirmación
operativa de PLAT-OPS debe incorporarse al expediente antes del cierre G7.

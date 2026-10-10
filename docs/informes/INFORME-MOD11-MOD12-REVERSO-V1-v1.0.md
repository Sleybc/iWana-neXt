# Informe de implementación V1 — reverso de consumo MOD11

**Fecha:** 2026-10-10  
**Base:** `7552c505`  
**Dictamen de implementación:** código y gates de build/typecheck/tests en verde; migración 140 ejercitada contra PostgreSQL real, incluido el bloqueo de `down` con filas y el `down` tras limpiar.  
**Commit:** ninguno, conforme al encargo.

## Cambios

- Materialicé el contrato compartido v1.7: `REVERSE_ITEM_USAGE`, estado proyectado de reverso, comandos/eventos de solicitud y respuesta, unión de eventos y esquemas Zod firmados. Añadí el caso de validación que impide que `reason` entre en el comando de consumo. Referencias: `packages/shared/src/contracts/operations/execution-orders.ts` y `.spec.ts`.
- Añadí la entidad append-only del reverso y la migración 140 con índice único parcial para reversos `PENDING`/`CONFIRMED`, unicidad tenant-solicitud e índices de listado/reintento. El `down` cuenta filas y falla cerrado si borrarlas destruiría historial. La migración quedó registrada en el runner tenant. Referencias: `packages/database/src/entities/execution-order-item-usage-reversal.entity.ts`, `packages/database/src/migrations/tenant/140_execution_order_item_usage_reversals.ts` y `runner.ts`.
- Añadí el endpoint supervisado y el comando idempotente: valida el motivo mediante `safeTextField`, revalida sede/alcance, bloquea y comprueba la línea confirmada, deriva el movimiento original de esa línea y escribe reverso, auditoría durable y outbox en la transacción. El motivo queda persistido en MOD11; no forma parte del payload de outbox. Tests inspeccionan el payload y rechazan motivos vacíos o con PII detectable. Referencias: `apps/api/src/modules/tasks/dto/execution-orders.dto.ts`, `execution-orders.controller.ts`, `services/execution-orders.service.ts` y `tests/execution-orders.task8.spec.ts`.
- Extendí `allowedActions` y la proyección de consumos con el estado del reverso. El gate R8 excluye líneas `CONFIRMED` tanto de `getCompletion` como del comando de cierre, sin alterar el estado ni el resultado de la OT. La regresión de políticas actualiza el snapshot para la nueva ruta supervisada. Referencias: `services/execution-orders.service.ts` y `tests/execution-orders.ola1-regression.spec.ts`.
- Extendí R5 en el worker: tipos de solicitud/respuesta en las listas de inventario, bypass de guardia de versión donde corresponde, cotejo con el outbox antes de firmar, clasificación del relay para la retención de 24 horas y transición condicional de resultado. R10 reemite solicitudes pendientes con `eventId` nuevo, el mismo `reversalRequestId`, `SKIP LOCKED`, savepoint por fila y límite de intentos. Añadí test de reemisión que verifica que no se envía el motivo. Referencias: `apps/worker/src/processors/execution-order-events.processor.ts`, `services/execution-order-relay.service.ts`, `.spec.ts`, `services/execution-order-inventory-rescan.service.ts` y `.spec.ts`.
- Añadí `StockMovementOrigin.EXECUTION_ORDER_REVERSAL` al enum compartido, solicitado para que V2 pueda usar el origen tipado; no implementé la migración 141 ni el módulo de Inventario de V2.

## Gates ejecutados

| Gate                                                                               | Resultado                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm --filter @iwana/api build`                                                   | PASS, exit 0                                                                                                       |
| Typecheck global (`pnpm exec turbo run typecheck --force`)                         | PASS, 8/8 paquetes, Cached: 0                                                                                      |
| Jest de `apps/api/src/modules/tasks` (`--runInBand --no-cache`)                    | PASS, 35 suites y 731 tests                                                                                        |
| Jest de `apps/worker/src` (`--runInBand --no-cache`)                               | PASS, 18 suites y 159 tests                                                                                        |
| Contrato v1.7 y Zod (`packages/shared/.../execution-orders.spec.ts`, `--no-cache`) | PASS, 6/6                                                                                                          |
| Test del outbox sin motivo                                                         | PASS, incluido en Jest de tasks del API                                                                            |
| Boundary scan de imports entre `apps/*`                                            | PASS, 2.426 archivos TypeScript inspeccionados; cero imports de una app a otra                                     |
| Migración 140 con `down` contra PostgreSQL real (`--no-cache`)                     | PASS: `up`, índice parcial validado desde `pg_index`, `down` bloqueado con 1 fila y `down` exitoso tras eliminarla |

## Ejecución y cierre

La ejecución final de la integración se hizo con `IWANA_DB_INTEGRATION_AVAILABLE=true`; el runner confirmó PostgreSQL en `127.0.0.1:5433/dbiw`, sin omitir la suite. El índice se consulta desde `pg_index`/`pg_get_expr` y se valida como único, parcial, de una sola clave (`item_usage_id`) y limitado exactamente a `PENDING` y `CONFIRMED`, normalizando los casts que añade PostgreSQL. El test pasó las tres fases: `up`, `down` bloqueado con un reverso presente y `down` exitoso tras eliminarlo.

El contrato v1.7 quedó verde y habilitó Ola 2. La entrega de código queda sin commit.

# Informe I1-R — remediación de D7

**Fecha:** 2026-10-06  
**Estado:** GO para el alcance I1-R  
**Commit:** ninguno

## Resultado

El scanner procesa cada fila del lote dentro de un `SAVEPOINT`. Si la solicitud carece de `inventory_request_id`, carece de `actor_user_id` o el payload/envelope no satisface los esquemas compartidos, revierte solo el savepoint de esa fila, la marca agotada con `request_attempts = maxAttempts` y `last_requested_at = NOW()`, registra el código y los identificadores operativos sin payload, y continúa con la siguiente fila. La métrica `prolonged_pending` incluye la fila agotada para que la consola pueda mostrar el aviso prolongado.

La prueba de regresión coloca una fila envenenada primero y una válida después en el mismo tenant; verifica que la primera se agote y que la segunda sí se reemita. También cubre `MISSING_REQUEST_ID`, `MISSING_ACTOR` e `INVALID_PAYLOAD`.

## Verificación

- `pnpm --filter @iwana/worker typecheck` — aprobado.
- `pnpm --filter @iwana/worker test --runInBand --no-cache --runTestsByPath src/services/execution-order-inventory-rescan.service.spec.ts` — 1 suite, 6 pruebas aprobadas.
- `pnpm --filter @iwana/worker test --runInBand --no-cache` — 16 suites aprobadas, 127 pruebas aprobadas, 0 fallos. `--no-cache` desactiva la caché de Jest.

## Observaciones

La remediación conserva la transacción por tenant y aísla los fallos de validación por fila con savepoints. Las pruebas confirman el lote con la fila inválida en primer lugar; no se modificaron filas de tenants reales.

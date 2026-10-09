# Informe R-WORKER — remediación de seguridad del worker MOD11 ↔ MOD12

**Versión:** 1.0  
**Fecha:** 2026-10-07  
**Agente:** sr-backend  
**Dictamen:** **GO para R-WORKER**  
**Commit:** no realizado

## Alcance

Se atendieron los tres bloqueos S2 sobre I1 y la decisión de D11 para los jobs fallidos de las colas de origen. Se ejecutó Jest del worker; no se levantaron los servicios API/worker ni Postgres o Redis. No se ejecutaron I4 ni S2, que son la fase siguiente.

## Cambios

### Procedencia antes de firmar V2

Al procesar `InventoryConsumptionRequestedV2`, el worker valida el envelope compartido y, dentro de la misma transacción y el `search_path` del tenant resuelto desde `public.tenants`, consulta `execution_order_outbox_events` por `tenant_id` y `event_id` con `FOR SHARE`.

Antes de insertar en el inbox o firmar, coteja el evento y el tenant, tipo, agregado, versión del agregado, correlación, instante de ocurrencia y el payload JSON canónico. Un evento inexistente o alterado termina con `INVENTORY_OUTBOX_EVENT_MISMATCH`; no se firma ni llega a `inventory-execution-requests`.

### Diagnósticos de `onFailed`

`onFailed` valida los UUID antes de incluirlos en logs o diagnósticos. Omite los identificadores inválidos y conserva solo `errorType`, `attemptsMade` y `failedAt` cuando no hay IDs utilizables. Ninguna rama nueva copia el envelope, el payload ni el mensaje de excepción; también se saneó la ruta genérica para que no quede un camino alternativo con datos crudos.

Para fallos de inventario, el worker elimina el job de `operations-execution-events` solo después de que `operations-execution-dlq` acepte el diagnóstico. El consumidor de la DLQ reconoce el nuevo diagnóstico genérico; los registros heredados se normalizan antes de persistirse y tampoco se conserva su mensaje crudo.

Si `dlqQueue.add` falla, `onFailed` propaga el error y no elimina el job fuente. En esa condición excepcional el job fallido puede conservar el envelope hasta que aplique `removeOnFail` de la cola fuente (30 días). La recuperación funcional sigue viniendo del outbox durable mediante D7, no de Redis; el job retenido requiere saneamiento operativo cuando la DLQ vuelva a aceptar escrituras.

### Relay

`ExecutionOrderRelayService` ya no registra `error.message` ni `String(error)` ante fallos de enqueue, marcado, escaneo o métricas. Registra solo tipos del catálogo permitido, con el contexto operativo ya aprobado.

## Pruebas y gates

- Inyección V2 sin fila de outbox: rechazo terminal, sin firma, sin enqueue y sin inserción en inbox.
- V2 con payload canónico alterado: rechazo, sin enqueue.
- V2 con `aggregate_version` alterado: rechazo, sin enqueue.
- `onFailed` con IDs malformados: los valores no aparecen en logs ni en la DLQ; el diagnóstico conserva solo los campos permitidos.
- `onFailed` elimina el job de inventario después de aceptar el diagnóstico. Si falla el enqueue, conserva el job fuente.
- Ruta genérica: diagnóstico sin envelope, payload ni mensaje crudo.
- Relay: pruebas verifican que los mensajes de error de enqueue y marcado no aparecen en logs.
- DLQ: prueba de consumo del nuevo diagnóstico saneado y lectura segura de registros heredados.

**Gate completo del worker, sin caché:**

```text
pnpm --filter @iwana/worker test -- --runInBand --no-cache
Test Suites: 16 passed, 16 total
Tests:       134 passed, 134 total
Cached:      0
```

`pnpm --filter @iwana/worker typecheck`: aprobado.  
`pnpm --filter @iwana/worker lint`: cero errores; permanece un warning preexistente en `apps/worker/src/main.ts:56`, fuera de este alcance.  
Prettier: los seis archivos del worker modificados pasan `--check`.

## Archivos

- `apps/worker/src/processors/execution-order-events.processor.ts`
- `apps/worker/src/processors/execution-order-events.processor.spec.ts`
- `apps/worker/src/processors/execution-order-dlq.processor.ts`
- `apps/worker/src/processors/execution-order-dlq.processor.spec.ts`
- `apps/worker/src/services/execution-order-relay.service.ts`
- `apps/worker/src/services/execution-order-relay.service.spec.ts`
- Este informe.

No se modificó la spec, I4 ni el informe S2. No se hizo commit.

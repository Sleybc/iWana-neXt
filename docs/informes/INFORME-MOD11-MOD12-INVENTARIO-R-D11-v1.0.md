# Informe R-D11 — retención de jobs de origen de inventario

**Fecha:** 2026-10-08  
**Agente:** sr-backend  
**Veredicto:** **GO**, con el límite operativo de disponibilidad del cleaner descrito en §5.  
**Commit:** no realizado.

## 1. Resultado

Los jobs fallidos de origen de inventario tienen `removeOnFail: { age: 86400 }`. Además, el scanner repetido del worker elimina de forma periódica los fallidos de inventario cuya antigüedad supera 24 horas. Esto cubre las dos colas de origen aunque no reciban jobs nuevos. La cola de diagnóstico conserva 30 días.

Cuando cualquier identificador requerido de un job fallido no valida, el diagnóstico se escribe sin identificadores: solo `errorType`, `attemptsMade` y `failedAt`. El job original se elimina después de que BullMQ acepte el diagnóstico. Si el `add` del diagnóstico falla, se registra únicamente un `errorType` permitido, los intentos y la fecha; el job queda para el cleaner y para la política de retención de la cola.

## 2. Productores y retención

| Cola de origen                 | Productor real                                                | Política                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory-execution-requests` | `ExecutionOrderEventsProcessor.enqueueSignedInventoryRequest` | 24 h para V2                                                                                                                            |
| `operations-execution-events`  | `ExecutionOrderRelayService`                                  | 24 h para solicitudes V1/V2 y respuestas `InventoryMovementConfirmedV1` / `InventoryMovementRejectedV1`; 30 días para los otros eventos |
| `operations-execution-events`  | `InventoryExecutionRequestProcessor.enqueueResponse`          | 24 h para las respuestas de inventario                                                                                                  |
| `operations-execution-dlq`     | ambos processors                                              | 30 días; no se acortó la retención del diagnóstico                                                                                      |

El encargo enumeraba los dos processors y sus specs. La inspección de productores mostró que la primera opción `removeOnFail` no era suficiente: el relay escribe las solicitudes en la cola mixta de eventos, y el processor de API publica allí las respuestas. Por eso también se ajustó el productor del relay y se probó la selección por tipo; los eventos no relacionados con inventario conservan 30 días. Se añadió el cleaner al `ExecutionOrderRelayProcessor`, activado por el repeat scanner existente cada cinco segundos, para que la limpieza ocurra aunque las colas fuente estén inactivas.

El cleaner recorre `failed` en páginas, en orden ascendente de finalización. Solo borra jobs con `finishedOn` anterior al corte de 24 horas y cuyo nombre/tipo corresponde a inventario. Deja intactos los fallidos no inventario y no procesa la DLQ diagnóstica. Si una eliminación o lectura falla, el log contiene únicamente el nombre fijo de la cola y un tipo de error permitido; no contiene IDs, payloads ni mensajes de excepción.

## 3. Archivos

- `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts` y `apps/api/src/modules/inventory/tests/inventory-execution-request.processor.spec.ts`.
- `apps/worker/src/processors/execution-order-events.processor.ts` y `apps/worker/src/processors/execution-order-events.processor.spec.ts`.
- `apps/worker/src/services/execution-order-relay.service.ts` y `apps/worker/src/services/execution-order-relay.service.spec.ts`.
- `apps/worker/src/processors/execution-order-relay.processor.ts` y `apps/worker/src/processors/execution-order-relay.processor.spec.ts`.

No hubo cambios de contrato, esquema, migraciones ni OpenAPI.

## 4. Verificación

Los comandos se ejecutaron con el Jest instalado en el workspace y `--no-cache` (**Cached: 0**). Se usó el binario local porque el wrapper `pnpm --filter … exec jest` no pudo crear su temporal en la raíz de `C:\appiw` (`EPERM`) antes de iniciar Jest.

```powershell
# Desde apps/api
node ..\..\node_modules\jest\bin\jest.js --runInBand --no-cache --testPathPattern=modules/inventory

# Desde apps/worker
node ..\..\node_modules\jest\bin\jest.js --runInBand --no-cache

# Suites dirigidas de worker
node ..\..\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath src/processors/execution-order-events.processor.spec.ts src/processors/execution-order-relay.processor.spec.ts src/services/execution-order-relay.service.spec.ts
```

| Gate                                                             | Resultado                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Jest `apps/api`, inventario                                      | 78 suites aprobadas, 3 omitidas; 797 pruebas aprobadas, 8 omitidas, 0 fallidas |
| Jest `apps/worker` completo                                      | 17 suites, 141 pruebas aprobadas, 0 fallidas                                   |
| Worker dirigido: processor de eventos, cleaner y productor relay | 3 suites, 44 pruebas aprobadas, 0 fallidas                                     |
| Typecheck API y worker                                           | ambos `tsc --noEmit -p tsconfig.typecheck.json`, exit 0                        |
| Prettier                                                         | `--check` sobre los ocho archivos, sin diferencias                             |

La prueba del cleaner parte de jobs fallidos vencidos preexistentes, sin encolar jobs nuevos: elimina solicitudes y respuestas de inventario, conserva un evento genérico de más de 24 horas y un evento de inventario reciente. Otra prueba confirma que un error de eliminación registra solo `queue` y `errorType`. Los specs de ambos `onFailed` verifican que IDs malformados producen el diagnóstico de tres campos y que el job fuente solo se elimina después de aceptar el diagnóstico.

Las suites se ejecutaron sin iniciar API/worker ni conectarse a Postgres o Redis. Los tests de controlador incluidos levantan apps Nest en loopback efímero; no usan servicios persistentes.

## 5. Límite operativo

`removeOnFail: { age: 86400 }` en BullMQ es limpieza _lazy_: por sí sola no instala un temporizador. El cleaner periódico cubre la cola inactiva mientras el worker y el acceso a Redis estén disponibles. Si el worker/cleaner está detenido, o Redis no permite ejecutar la limpieza, ningún proceso de esta fase puede retirar el job en ese intervalo; el job se eliminará en el siguiente ciclo exitoso tras recuperar el servicio. Por tanto, el tope físico de 24 horas depende de la disponibilidad del cleaner; no se afirma una garantía de reloj durante una interrupción del propio proceso de limpieza.

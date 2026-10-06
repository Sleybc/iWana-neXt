# Dictamen G1 — factibilidad MOD11 ↔ MOD12

- **Versión:** 1.0
- **Fecha:** 2026-10-06
- **Agente:** `sr-backend`
- **Spec revisada:** `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md` v1.0 (Propuesto)
- **Encargo:** `docs/prompts/PROMPT-MOD11-MOD12-INVENTARIO-G1-v1.0.md` §F1
- **Skills leídas:** `architect-review`, `nestjs-expert`, `bullmq-specialist`; apoyo `postgresql` para D7
- **Modo:** solo lectura. No se ejecutaron pruebas ni se modificó código o spec.

## Veredicto

**No recomiendo aprobar G1 todavía.** La dirección es factible y el ledger existente sí protege el movimiento positivo contra replays, pero hacen falta aclaraciones de contrato y operación antes de congelar la spec. Las consultas más bloqueantes son la versión de las respuestas tardías en el inbox MOD11, la clasificación tipada de rechazos y la consistencia del resultado ante reintentos. D3 funciona técnicamente en el API, aunque constituye una excepción explícita al patrón BullMQ general del repositorio.

## Hallazgos de factibilidad

### 1. Idempotencia de movimiento, comodato y eventos

**Sí para replays secuenciales del mismo `inventoryRequestId` y el mismo contenido.** `recordExecutionOrderMovement` pasa esa clave al ledger (`apps/api/src/modules/inventory/services/stock-ledger.service.ts:692-800`). `recordMovementWithManager` consulta primero por `(tenantId, idempotencyKey)` y, si ya existe, devuelve movimiento y líneas con `created: false` sin volver a descontar el saldo (`stock-ledger.service.ts:252-265`). La base también tiene el índice único por tenant y clave (`packages/database/src/entities/stock-movement.entity.ts:11`; migración tenant 047, líneas 480-481).

La apertura del comodato usa el `stockMovementId` como clave natural: `openLoanWithManager` devuelve el registro existente y existe un índice único parcial `(tenant_id, stock_movement_id)` (`apps/api/src/modules/inventory/services/asset-loan.service.ts:26-55`; migración tenant 081, líneas 37-39). La transición y el `asset_lifecycle_event` se guardan en la transacción del movimiento (`stock-ledger.service.ts:329-364`); los eventos de dominio post-commit reciben `created` y no se publican en el replay (`stock-ledger.service.ts:189-212`, `apps/api/src/modules/inventory/services/inventory-domain-event-publisher.service.ts:187-190`). Hay una prueba unitaria que cubre la reapertura idempotente del comodato (`stock-ledger.service.spec.ts`, “reutiliza comodato existente cuando el movimiento es idempotente”).

Límite: la clave no compara una huella del contenido. Si un mismo ID llegara con otra custodia, disposición o serial, se devolvería el movimiento anterior. El contrato interno debe ser inmutable por solicitud. En carreras, el índice único evita dos movimientos persistidos, pero la segunda transacción puede recibir `23505`; el job debe dejar fallar esa tentativa y reintentar para que el siguiente lookup encuentre el ganador.

### 2. D5: catálogo de rechazos y errores actuales

| `reasonCode` | Comportamiento actual del ledger | Implicación |
| --- | --- | --- |
| `CUSTODY_INSUFFICIENT` | El débito que deja saldo negativo lanza `BadRequestException` desde `StockBalanceService.applyDeltaWithManager` (`stock-balance.service.ts:291-350`). | No hay código de dominio diferenciado de otras invariantes de saldo/reserva. |
| `SERIAL_NOT_IN_CUSTODY` | No hay guarda de que el serial esté en `technicianCustodyId`. `recordExecutionOrderMovement` calcula la ubicación destino y `transitionAssetWithManager` sustituye la ubicación actual, sin validar la anterior (`stock-ledger.service.ts:741-759`; `serialized-asset.service.ts:558-597`). | Un saldo agregado suficiente puede permitir mover un serial que está en otra custodia; si no alcanza, aparece el `BadRequestException` genérico de saldo. |
| `SUBSCRIBER_REQUIRED` | Para `INSTALLED_AT_CUSTOMER`, ausencia de `subscriberId` y `customerSiteLocationId` lanza `BadRequestException` (`stock-ledger.service.ts:1390-1413`). | El ledger no expone un `reasonCode`; además V2 no incluye `customerSiteLocationId`. |
| `ITEM_INACTIVE` | No se consulta ni valida `InventoryItem.status` en el camino de `recordExecutionOrderMovement`/`recordMovementWithManager`; el filtro `ACTIVE` del publicador de dominio solo controla alertas `StockLow`. | Hoy el movimiento no puede clasificarse como este rechazo: falta una validación de negocio en el ledger. |
| `LEGACY_REQUEST_UNSUPPORTED` | No es una excepción del ledger. El handler actual de `InventoryConsumptionRequestedV1` acusa recibo como emisor, sin invocar MOD12 (`apps/worker/src/processors/execution-order-events.processor.ts:221-227`). | La spec debe definir qué frontera detecta V1 y cómo evita cerrar como `REJECTED` un pendiente que D7 debe recuperar como V2. |

**Cambio requerido en spec:** D5 debe pedir un resultado tipado/discriminado o una excepción de dominio con `reasonCode`, emitida únicamente después de las validaciones concretas. No se debe inferir el código leyendo mensajes de `BadRequestException`. Los errores de PostgreSQL, Redis, timeout y fallos inesperados deben propagarse como técnicos y reintentarse; los motivos de negocio deben encolarse como respuesta y completar el job sin retry. La guarda de custodia serial y la validación de artículo activo no existen hoy y deben formar parte del cambio de ledger.

### 3. ¿Puede el API alojar el processor de MOD12?

**Técnicamente sí.** `AppModule` configura BullMQ globalmente (`apps/api/src/app.module.ts:165-178`) e importa `InventoryModule` (`:237`). El módulo de usuarios registra una cola y un `@Processor` dentro del API (`apps/api/src/modules/users/users.module.ts:32-42`); `UsersBulkCreateProcessor` documenta que lo hace para reutilizar un servicio y que es deuda de extracción (`users-bulk-create.processor.ts:14-18`). El módulo de inventario ya posee `StockLedgerService` y `InventoryMovementPortAdapter`, así que el processor puede estar en ese boundary sin importar servicios del API desde el worker.

**[CONSULTA] a AI-EM-ARCH:** `nestjs-expert` y `bullmq-specialist` fijan el patrón normal `apps/api` productor / `apps/worker` consumidor y dicen que el API no procese jobs. El precedente de usuarios existe, pero su propio comentario lo llama deuda residual; no prueba que sea la política base. Confirmar D3 como excepción arquitectónica justificada por el ownership del ledger, o decidir una extracción a librería de dominio que pueda consumir el worker. Si se aprueba D3, I2 debe registrar la cola en `InventoryModule`, dejar explícita la concurrencia y añadir pruebas de cableado/proceso; los tests de arranque y de módulo actuales no registran esa cola.

### 4. D2/D4: deduplicación, respuesta y versiones de inbox

Un `jobId` estable sirve para deduplicar el mismo job mientras BullMQ conserva su registro; el ledger es el control durable de movimiento. `eventId` es la clave única `(tenant_id, consumer, event_id)` del inbox MOD11 (`execution-order-inbox-event.entity.ts:3-17`), así que un ID de respuesta estable y UUID puede neutralizar duplicados exactos. El event ID debe seguir siendo UUID, porque tanto inbox como outbox almacenan `event_id` como `uuid` (`execution-order-inbox-event.entity.ts:17`, `execution-order-outbox-event.entity.ts:9`). La spec debe fijar un derivador determinista UUID y documentar retención/eliminación de jobs; la deduplicación del job no reemplaza la del ledger.

**[CONSULTA] bloqueante — respuesta tardía:** antes de insertar en inbox, `ExecutionOrderEventsProcessor` descarta todo evento cuyo `aggregateVersion` sea menor o igual a la última versión ya procesada para esa OT (`apps/worker/src/processors/execution-order-events.processor.ts:121-140`). El V2 de solicitud ya se procesa por ese mismo consumer y se acusa como no-op. Si la respuesta lleva la versión de la solicitud, queda descartada incluso sin cierre posterior; una `ExecutionOrderClosedV1` procesada antes la deja aún más vieja. Esto rompe CA-09 y puede dejar CA-01–08 en `PENDING`, aunque `eventId` sea nuevo. La spec debe definir que `InventoryMovementConfirmedV1`/`RejectedV1` no usan esa secuencia de proyección de la OT —deduplicando por solicitud/inbox— o definir otro esquema de versión que garantice aceptación de respuestas tardías sin leer MOD11 desde MOD12.

Además, los handlers existentes permiten que un evento contrario sobrescriba el estado (`applyInventoryMovementConfirmed` puede convertir `REJECTED` a `CONFIRMED` y `applyInventoryMovementRejected` puede convertir `CONFIRMED` a `REJECTED`; `execution-order-events.processor.ts:472-570`). Definir la transición `PENDING → CONFIRMED|REJECTED` como única y protegerla con una condición atómica; duplicados idénticos deben ser no-op y resultados contradictorios deben registrarse como anomalía.

### 5. D4 sin outbox de MOD12 y rechazo estable

**Viable con condición de entrega:** el processor debe completar el job solo después de que `Queue.add()` haya aceptado la respuesta. Si falla el enqueue, propaga el error para que BullMQ reintente; al repetir, el ledger devuelve el mismo movimiento y comodato y el processor vuelve a emitir la respuesta sin duplicar el efecto.

**[CONSULTA] bloqueante — rechazo:** el índice idempotente del ledger solo conserva movimientos confirmados. Un rechazo de negocio no crea movimiento ni recibo MOD12. Si el enqueue de esa respuesta falla y el job reintenta, el mismo `inventoryRequestId` puede volver a evaluarse con otra disponibilidad y producir un resultado diferente. Como D4 deriva el event ID del request **y del resultado**, `REJECTED` y `CONFIRMED` pueden generar IDs distintos; el inbox podría ver ambos. Para que “una solicitud produce siempre la misma respuesta” sea cierto sin outbox, hace falta persistir atómicamente en MOD12 el resultado terminal por `inventoryRequestId` (puede ser un recibo, no necesariamente un outbox), o una decisión equivalente que impida reevaluar un rechazo ya decidido. El ID determinista por sí solo no hace determinista el resultado.

### 6. D7: lugar, umbral y solicitudes en vuelo

Recomiendo un reconciliador en `apps/worker` propiedad lógica de MOD11: itera `public.tenants`, valida el schema, usa `SET LOCAL search_path` y lee solo `execution_order_item_usage`/outbox de MOD11; emite un nuevo V2 por el outbox normal. Esto mantiene el boundary y no hace que MOD12 lea tablas de MOD11. Los datos base para V1 existen: usage conserva custodia, acción, disposición, serial y actor; `execution_orders` conserva `subscriberId` (`execution-order-item-usage.entity.ts`; `execution-order.entity.ts:56-57`). Los campos de ubicación/contrato que no estén guardados requieren la decisión del apartado siguiente.

**[CONSULTA]:** D7 no define valor inicial del umbral, cómo se distingue “sin respuesta” de respuesta ya en Redis pero aún no aplicada, ni cómo coordina varias réplicas del scanner. Debe fijar un umbral por configuración con default operativo, exclusión/lease o inspección durable del estado del job, y recuperación de jobs fallidos retenidos. Reusar `jobId = inventoryRequestId` sin definir el tratamiento de un job `completed`/`failed` ya retenido puede hacer que D7 crea que reencoló cuando BullMQ no crea otro job. Cada reemisión necesita nuevo `eventId` de solicitud: reusar el event ID V1 choca con el inbox; reusar un único event ID V2 también impediría que el worker vuelva a reencolar después de procesar la primera tentativa. La respuesta conserva el `inventoryRequestId` como idempotency key del ledger.

La tabla tiene índices por orden+fecha y tenant+`inventoryRequestId`, no por estado/antigüedad. Si la consulta de D7 filtra `movement_status='PENDING'` por `created_at`, verificar el plan real y volumen por schema; evaluar un índice parcial acorde con esa consulta, sin añadirlo por reflejo.

### 7. ¿Alcanza el V2 para llamar el ledger?

V2 cubre `executionOrderId` vía `EventPayloadBase`, el ID de solicitud, ítem/cantidad/serial, custodia, acción, disposición, suscriptor y actor. Aun así, no calza completamente con `ExecutionOrderMovementInput` (`apps/api/src/modules/inventory/services/stock-ledger.service.ts:63-77`):

- `customerSiteLocationId` es una alternativa que el ledger acepta cuando falta `subscriberId`; D5 también define el caso “suscriptor ausente para `INSTALLED_AT_CUSTOMER`”. V2 no transporta el sitio. Añadirlo y persistirlo en MOD11 si esa ruta es válida; si no, limitarla explícitamente y alinear el catálogo `SUBSCRIBER_REQUIRED`.
- `contractRefId` es opcional en el ledger, pero se guarda en el activo y en `AssetLoanAssignment` (`stock-ledger.service.ts:753-762, 783-790`). Ni el DTO de registro ni `ExecutionOrderItemUsage` lo almacenan. Si para OT siempre debe ser nulo, decirlo en la spec; si debe conservarse un contrato, añadir fuente durable en MOD11 y campo a V2.
- `actorUserId` cubre la identidad lógica, pero D8 dice que actor sale del sobre interno y nunca del payload, mientras §3 coloca `actorUserId` dentro de V2. Resolver esa contradicción en G1. Además, el ledger recibe `JwtPayload` completo (`stock-ledger.service.ts:692`), aunque en este camino usa `actor.sub`; no fabricar claims de email/rol/JWT para el job. Definir un principal interno mínimo para auditoría o un adaptador explícito.

## Cambios solicitados a la spec antes de G1

1. Definir la excepción o alternativa a la separación API/worker de D3.
2. Corregir D4 para la guarda `aggregateVersion` del consumer y fijar la transición de estado por solicitud.
3. Definir el resultado idempotente de los rechazos y la ventana commit-ledger/enqueue-respuesta sin outbox.
4. Mapear D5 a errores/resultados de dominio tipados; incluir las validaciones ausentes de serial en custodia y artículo activo.
5. Completar D7: default del umbral, detección de in-flight, coordinación, job retenido y nuevo event ID por reemisión; perfilar el scan/index.
6. Alinear campos V2 con el ledger y resolver actor del sobre frente a `actorUserId` del payload.

**Cierre:** no se ejecutaron pruebas ni se modificó código o spec. Sin commit.

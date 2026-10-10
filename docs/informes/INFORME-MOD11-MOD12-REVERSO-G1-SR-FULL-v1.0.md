# Informe G1 F1 — Factibilidad backend del reverso de consumo MOD11 ↔ MOD12

- **Versión:** 1.0
- **Fecha:** 2026-10-10
- **Rol:** `sr-backend`
- **Dictamen:** **GO de factibilidad**, con precisiones de diseño que deben incorporarse antes de congelar la spec. No encuentro una limitación del stack que impida la solución. Los cambios recomendados abajo completan contratos, persistencia y validaciones; no reabren P1–P4 del CTO.

## Alcance leído

- `AGENTS.md` completo y los skills `architect-review`, `nestjs-expert`, `bullmq-specialist` y `postgresql` completos.
- `docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md` completa.
- `docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md`: D4, D5, D7, D8, D10, D11 y §10.
- Solo la sección F1 de `docs/prompts/PROMPT-MOD11-MOD12-REVERSO-G1-v1.0.md`.

## Respuestas F1

### 1. R6 — Referencia al movimiento original y resolución de ubicaciones

**Factible, pero hace falta una operación de reverso explícita en MOD12.** `StockLedgerService` tiene caminos de registro de movimiento de OT y una primitiva genérica de escritura; no tiene una operación que cargue y contrarreste un movimiento por `originalStockMovementId`. La primitiva genérica busca por clave de idempotencia y escribe el movimiento recibido, sin leer ni validar un movimiento original (`apps/api/src/modules/inventory/services/stock-ledger.service.ts:220-270`). El input solo ofrece `isReversal` y `reversedByMovementId`; esos campos son metadatos, no una operación de reverso (`stock-ledger.service.ts:86-103`, `packages/database/src/entities/stock-movement.entity.ts:49-53`).

MOD12 puede derivar las ubicaciones de la evidencia original: las líneas de movimiento guardan `locationId` y cantidad (`packages/database/src/entities/stock-movement-line.entity.ts:19-35`); el consumo de OT escribe una salida negativa de la custodia y, para instalación en cliente, una entrada positiva en el sitio (`stock-ledger.service.ts:1560-1587`). Para un serial, las líneas de OT se guardan con `serializedAssetId: null`, por lo que el vínculo al activo debe resolverse por el evento de ciclo de vida asociado al `stockMovementId`, que sí conserva `serializedAssetId`, `locationId` y `stockMovementId` (`stock-ledger.service.ts:334-373`, `packages/database/src/entities/asset-lifecycle-event.entity.ts:20-62`).

La custodia móvil activa puede validarse con `StockLocation.responsibleRefId`, tipo y estado (`packages/database/src/entities/stock-location.entity.ts:30-46`; `stock-ledger.service.ts:931-951`). La petición de reverso propuesta incluye `technicianCustodyId` —el `responsibleRefId`—, pero no ubicación física (`docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md:68-72`). **[CONSULTA] AI-EM-ARCH:** aclarar si ese identificador seguirá en el evento y si MOD12 lo coteja con la línea negativa original; los IDs físicos de sitio y custodia deben derivarse de MOD12.

**Precisión para la spec:** nombrar el enlace persistido del movimiento contrario al original. La entidad tiene `reversedByMovementId` en el movimiento original, pero el movimiento nuevo no tiene un campo tipado `originalStockMovementId`. Especificar si `originRefId` del movimiento contrario apunta al original y si se actualiza `original.reversedByMovementId`, o si la migración agrega un enlace tipado. Ambos cambios deben ocurrir en la misma transacción que las líneas y transiciones.

### 2. R6 — Cierre del comodato en la misma transacción

**Sí, el helper recibe el `EntityManager` y se puede ejecutar dentro de la transacción del movimiento.** El camino de consumo abre la transacción antes de registrar el ledger y escribe el recibo con el mismo manager antes del commit (`stock-ledger.service.ts:721-740`, `:829-857`). El helper cierra y guarda el comodato con el manager recibido (`apps/api/src/modules/inventory/services/asset-loan.service.ts:59-76`).

**No alcanza por sí solo para el reverso:** busca cualquier préstamo abierto del activo, no uno asociado al movimiento original, no toma bloqueo explícito y devuelve `null` si no encuentra préstamo abierto (`asset-loan.service.ts:63-76`). Para evitar confirmar un reverso sin cerrar el comodato correcto, MOD12 debe cotejar el préstamo con `stockMovementId` original y actualizarlo atómicamente. **[CONSULTA] AI-EM-ARCH:** R7 no define qué código terminal representa un préstamo ausente o ya cerrado. Definir si se clasifica como `REVERSAL_ASSET_MOVED` o si requiere un motivo tipado adicional; nunca debe confirmarse silenciosamente.

### 3. R7 — Validaciones tipadas de los tres motivos

**Factible con validaciones explícitas; no se deben inferir motivos del texto de excepciones.** Existe ya el patrón tipado `InventoryBusinessRejection(reasonCode)` y el consumidor solo convierte esa clase en un recibo rechazado; los demás errores se propagan (`apps/api/src/modules/inventory/services/inventory-business-rejection.ts:1-9`, `inventory-execution-request.processor.ts:255-263`). Hoy el tipo está limitado a los cuatro motivos de consumo (`packages/shared/src/contracts/operations/execution-orders.ts:562-570`).

- `REVERSAL_ORIGINAL_NOT_FOUND`: consulta tenant-aware por `originalStockMovementId`; rechazar si no existe o no corresponde a un movimiento `EXECUTION_ORDER` original de la solicitud.
- `REVERSAL_ASSET_MOVED`: para serial, localizar el activo desde el evento de ciclo de vida del movimiento original y comparar, bajo bloqueo transaccional, el estado y ubicación actuales con el destino que dejó ese movimiento. Si cambió, rechazar.
- `REVERSAL_CUSTODY_INACTIVE`: derivar la ubicación origen de la línea negativa y comprobar que la ubicación siga activa, sea `MOBILE_TECHNICIAN` y su responsable corresponda al técnico esperado. Si no, rechazar.

El ledger ya demuestra cómo emitir rechazos de negocio tras comparar estado de artículo, estado del serial y ubicación (`stock-ledger.service.ts:880-901`). La spec debe declarar estos predicados y que el movimiento, el activo y el préstamo se validan/escriben dentro de una transacción; `transitionAssetWithManager` actualmente resuelve el activo y guarda estado, pero no bloquea ni coteja el estado previo (`apps/api/src/modules/inventory/services/serialized-asset.service.ts:522-594`).

### 4. §4 — Recibo: misma tabla con `kind`

**Recomiendo reutilizar `inventory_execution_request_receipts` y agregar `kind`.** El recibo actual ya modela la decisión terminal común: solicitud, OT, versión, resultado, movimiento y motivo; tiene unicidad por tenant/solicitud y una restricción coherente para `CONFIRMED`/`REJECTED` (`packages/database/src/migrations/tenant/139_inventory_execution_request_receipts.ts:9-26`). Consumo y reverso tienen la misma forma de resultado. Un discriminador `CONSUMPTION`/`REVERSAL` permite compartir lectura, persistencia, replay y enqueue de respuesta. El ID del recibo de reverso debe ser `reversalRequestId`, distinto del ID del consumo original; la clave lógica recomendada es `(tenant_id, kind, request_id)` (renombrar o documentar el actual `inventory_request_id` como ID genérico). Las filas existentes se migran como `CONSUMPTION`.

La tabla nueva de recibos no cambia D7: el reintento pertenece a MOD11 y debe escanear también `execution_order_item_usage_reversals`. El esquema R3 no enumera `request_attempts` ni `last_requested_at` para esas filas (`docs/specs/2026-10-09-mod11-mod12-reverso-consumo-ot-design.md:43`), mientras el D7 vigente depende de esos campos, del umbral/tope y de `FOR UPDATE SKIP LOCKED` (`docs/specs/2026-10-06-mod11-mod12-consumo-inventario-ot-design.md:55`; `apps/worker/src/services/execution-order-inventory-rescan.service.ts:104-130`, `:204-225`). **Añadir esos campos o definir dónde se guarda el estado de reintento y cómo se reemite el mismo `reversalRequestId`.**

D11 limpia jobs fallidos en las colas compartidas y no toca recibos persistidos. Por tanto `kind` no cambia la limpieza; los eventos de reverso deben seguir en `inventory-execution-requests` y `operations-execution-events` para heredar las 24 horas (`apps/worker/src/processors/execution-order-relay.processor.ts:51-74`, `apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:467-490`).

### 5. R5 — Extensión de cotejo, HMAC, consumidor, D7 y limpieza

**La infraestructura se puede reutilizar, pero el código actual no acepta el nuevo tipo sin cambios ni basta con agregar el tipo al contrato.**

- **Outbox y HMAC:** el processor del worker coteja solo `InventoryConsumptionRequestedV2` (`apps/worker/src/processors/execution-order-events.processor.ts:289-291`, `:487-521`). El firmante y el esquema firmado están tipados solo para ese evento (`:460-485`; `packages/shared/src/contracts/operations/execution-orders.ts:610-656`). El canonicalizador ya acepta envelope opaco y puede compartirse (`execution-orders.ts:660-678`). Extender el cotejo/schema a una unión discriminada de consumo y reverso.
- **Despacho y proyección:** las listas de inventario y de bypass de `aggregateVersion` enumeran únicamente eventos actuales (`execution-order-events.processor.ts:35-45`); el mapa registra la solicitud V2 y las dos respuestas de consumo (`:396-430`). Agregar solicitudes y respuestas de reverso con transición idempotente separada para `execution_order_item_usage_reversals`, preservando la respuesta fuera de la guarda de versión.
- **Consumidor MOD12 y recibo:** `InventoryExecutionRequestProcessor` modela solo IDs y códigos de consumo y llama solo al movimiento de consumo (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:45-61`, `:163-276`, `:338-420`). Un dispatcher por `eventType` puede reutilizar verificación de firma, tenant, recibo y enqueue; la operación del ledger y los tipos de resultado permanecen específicos.
- **D7:** el rescan actual solo lee `execution_order_item_usage` con `movement_status='PENDING'` y reemite V2 (`apps/worker/src/services/execution-order-inventory-rescan.service.ts:104-169`). Debe atender la tabla R3, mantener contadores/fechas de reintento, emitir un `eventId` nuevo por redrive y conservar el mismo `reversalRequestId`.
- **D11 / retención:** los productores asignan 24 horas por lista de tipos de inventario; hay que incluir los nuevos eventos en esas listas (`apps/worker/src/services/execution-order-relay.service.ts:55-60`, `:287-294`; `execution-order-events.processor.ts:35-47`, `:477-485`). El borrado periódico es por edad y estado de job, sin inspeccionar payload (`apps/worker/src/processors/execution-order-relay.processor.ts:51-74`; `inventory-execution-request.processor.ts:467-490`), así que las colas compartidas heredan el cleanup. La lógica periódica está implementada en API y worker por separado; la nueva variante puede reusar ambas funciones sin una rama por tipo.

**Precisión para R5:** describir una unión discriminada para esquema firmado, cotejo, diagnóstico DLQ y recibo. El diagnóstico actual solo extrae `inventoryRequestId`; el tipo nuevo necesita registrar el ID de solicitud de forma genérica/segura, sin guardar motivo ni payload.

### 6. R8 — Exclusión del consumo revertido en progreso y cierre

**Ambos caminos necesitan cambiar.** `getCompletion` selecciona todas las líneas de uso y construye contexto con `itemId`, `finalDisposition` y `requirementKey`, sin leer estado de reverso (`apps/api/src/modules/tasks/services/execution-orders.service.ts:344-375`). El camino de cierre carga igualmente las líneas y llama al evaluador (`:1760-1777`). El helper compartido `buildMaterialEvaluationUsages` no transporta el estado de reverso (`:3494-3548`), y `evaluateMaterial` satisface el requisito cuando encuentra cualquier uso coincidente (`apps/api/src/modules/tasks/services/closure-gate-evaluator.service.ts:178-190`).

La proyección/consulta debe incluir el estado del reverso en ambos call-sites, y el evaluador debe excluir solo los usos cuyo reverso esté `CONFIRMED`, como R8 prescribe. Con ello `getCompletion` vuelve a mostrar MATERIAL pendiente para OTs abiertas y terminales; la evaluación de cierre bloquea una OT aún abierta, sin mutar el resultado de una OT terminal. La spec debe nombrar ambos call-sites, ya que hoy comparten el evaluador pero realizan cargas distintas.

### 7. `StockMovementOrigin` — TypeScript y PostgreSQL

**Vive en ambos.** La enumeración compartida de TypeScript enumera los orígenes actuales (`packages/shared/src/enums/inventory/stock-movement-origin.enum.ts:1-12`); la entidad declara el tipo PostgreSQL `stock_movement_origin` (`packages/database/src/entities/stock-movement.entity.ts:27-32`), creado por la migración tenant 047 (`packages/database/src/migrations/tenant/047_create_inventory_scm_module.ts:95-106`). La migración 141 debe agregar `EXECUTION_ORDER_REVERSAL` al enum de cada tenant y actualizar TypeScript. El precedente 058 añade el valor y su `down` reconstruye el enum solo si no está en uso (`packages/database/src/migrations/tenant/058_add_counter_purchase_origin.ts:19-34`, `:37-78`); aplicar esa política de rollback, no asumir que PostgreSQL permite borrar un valor de enum.

## Cambios concretos recomendados a la spec antes de congelarla

1. Definir el enlace bidireccional/persistido entre movimiento contrario y movimiento original, y aclarar el uso de `technicianCustodyId` en el payload R5.
2. Definir la respuesta tipada cuando falta o ya se cerró el comodato ligado al movimiento original; no aceptar confirmación sin cerrar el préstamo esperado.
3. Añadir estado de reintento D7 (`last_requested_at`, `request_attempts` o equivalente) a la persistencia MOD11 de reversos y describir su rescan.
4. Formalizar la migración 141 de recibos con `kind` e ID de solicitud genérico, preservando recibos históricos como consumos; incluir también el nuevo valor enum PostgreSQL y su política `down`.
5. En R5, declarar los puntos de extensión enumerados arriba (schemas/unión, listas de eventos, dispatcher, transición MOD11, DLQ y retención).
6. En R8, especificar que el estado de reverso fluye tanto por `getCompletion` como por el comando de cierre hacia el evaluador.

**Verificación:** revisión de código y documentos, solo lectura. No se ejecutaron tests ni se modificó la spec.

# Informe de seguridad MOD11 ↔ MOD12 — S2 v1.2

**Fecha:** 2026-10-08  
**Agente:** sec-eng  
**Dictamen:** **NO GO — dos bloqueos sobre la retención D11 de las colas de origen**  
**Método:** revisión estática de solo lectura. No se ejecutaron servicios, pruebas ni consultas a bases de datos. No se modificó código ni informes previos. **Sin commit.**

## Alcance

Revisé `AGENTS.md`, el informe S2 v1.0 y su adenda v1.1, los informes R-WORKER, R-API y R-D11, el registro §5 del plan y la adenda de Ola 3d. También leí `security-auditor` y `backend-security-coder` antes de revisar el código actual.

La reauditoría cubre los tres bloqueos originales de I1 y la decisión posterior de D11: comparar el evento V2 con el outbox antes de firmar, sanear diagnósticos `onFailed`, evitar mensajes crudos en el relay y eliminar los sobres fallidos de origen en un máximo estricto de 24 horas.

## Dictamen por control

| Control | Dictamen | Evidencia |
|---|---|---|
| Firma V2 solo después de verificar el outbox | **GO** | `process()` valida contexto de tenant, resuelve el schema desde `public.tenants`, abre transacción y coteja el outbox antes del inbox y del handler: `apps/worker/src/processors/execution-order-events.processor.ts:264-291`. `assertInventoryEventMatchesOutbox()` compara `event_id`, tenant, tipo, agregado, versión, correlación, tiempo y payload JSON canónico (`:487-520`). La firma/enqueue ocurre después (`:403-407`, `:460-484`). Los esquemas compartidos son estrictos (`packages/shared/src/contracts/operations/execution-orders.ts:573-647`). |
| UUID de `onFailed` validados; diagnóstico sin IDs inválidos | **GO** | Worker valida cada UUID; solo incluye el conjunto de identificadores si todos pasan. El resto del diagnóstico contiene `failedAt`, `attemptsMade` y `errorType`; borra el origen únicamente tras aceptar el `add` en DLQ (`apps/worker/src/processors/execution-order-events.processor.ts:186-227`). API aplica el mismo patrón a los cuatro identificadores y elimina el job después del `add` (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:452-488`). Si el `add` falla, ambos conservan el origen para la política de retención; esto se evalúa abajo. |
| Relay sin mensajes crudos de excepciones | **GO** | `relayErrorType()` reduce excepciones a un catálogo fijo (`apps/worker/src/services/execution-order-relay.service.ts:52-62`). Los caminos de enqueue, marcado y escaneo registran `error_type` y contexto operativo, sin `error.message` ni `String(error)` (`:286-325`). |
| Tope de 24 horas en colas de origen | **NO GO** | La política configurada es de limpieza por edad (`removeOnFail: { age: 86400 }`) y el cleaner solo corre cuando el processor del relay está activo. No es un vencimiento temporal garantizado. Además, su filtro por nombre/tipo omite jobs fallidos malformados. Ver los dos bloqueos siguientes. |

## Bloqueos D11

### [BLOQUEO] D11-RET-01 — el límite estricto depende de la disponibilidad del worker

Los productores configuran `removeOnFail` a 24 horas para solicitudes V2 (`apps/worker/src/processors/execution-order-events.processor.ts:477-484`), eventos de inventario del relay (`apps/worker/src/services/execution-order-relay.service.ts:48-58, 275-284`) y respuestas de inventario del API (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:430-437`). Esta opción no programa un TTL independiente en Redis.

La eliminación explícita recorre los estados `failed` únicamente al procesar un job de `ExecutionOrderRelayProcessor` (`apps/worker/src/processors/execution-order-relay.processor.ts:66-90`). El job repetido que lo activa se registra cada cinco segundos en `ExecutionOrderRelayService.onApplicationBootstrap()` (`apps/worker/src/services/execution-order-relay.service.ts:116-124`). Si el worker está detenido —o no puede alcanzar Redis—, ni el cleaner ni la política lazy garantizan la eliminación antes de 24 horas. R-D11 reconoce expresamente que el borrado ocurre en el siguiente ciclo exitoso después de recuperar el servicio (`INFORME-MOD11-MOD12-INVENTARIO-R-D11-v1.0.md`, §5).

Esto no satisface la decisión del plan para Ola 3c: “como máximo a las 24 horas, pase lo que pase”. Que al momento de la inspección no hubiera jobs vencidos (`I4 v1.1`, §D11) es una observación puntual, no una garantía del tope. La consulta original de D11 **no queda cerrada bajo el requisito vigente**.

### [BLOQUEO] D11-RET-02 — un job malformado puede eludir el cleaner incluso con el worker activo

El cleaner reconoce inventario por el `job.name` y `eventType` dentro del payload: solicitudes (`apps/worker/src/processors/execution-order-relay.processor.ts:25-32`) y eventos/respuestas (`:34-42`). Luego omite cualquier job que no pase ese predicado (`:109-118`).

En la cola mixta `operations-execution-events`, `onFailed()` solo toma la ruta de inventario si el `eventType` está en `INVENTORY_EVENT_TYPES` (`apps/worker/src/processors/execution-order-events.processor.ts:194-197`). Si el tipo falta o fue alterado, cae en la ruta genérica, que encola un diagnóstico allowlisted pero no elimina el job de origen (`:230-261`). El cleaner tampoco lo reconoce y lo salta. El job conserva su opción de edad de 24 horas, que es lazy; por tanto, sin otra finalización que dispare esa limpieza, puede permanecer más de 24 horas.

En la cola dedicada `inventory-execution-requests` ocurre la misma omisión si falta `envelope.eventType` y falla el enqueue del diagnóstico: `onFailed()` retorna conservando el job (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:473-485`), y el cleaner exige el tipo V2 aunque la cola sea exclusiva de solicitudes de inventario (`apps/worker/src/processors/execution-order-relay.processor.ts:25-32, 111-118`). Bajo el modelo de amenaza que motivó S2 —Redis permite escrituras no confiables— no se debe usar un campo mutable del job como única prueba para aplicar la retención a un job fallido.

## Conclusión

Los tres bloqueos originales de S2 quedan corregidos en el código revisado: el worker verifica la procedencia V2 antes de firmar; los hooks `onFailed` validan identificadores y evitan incluirlos si alguno es inválido; y el relay no registra mensajes crudos.

**S2 v1.2 queda NO GO por D11.** La retención de 24 horas es efectiva solo cuando corre el cleaner y el job conserva un nombre/tipo reconocible. Para cerrar el bloqueo, el diseño debe garantizar el borrado dentro del plazo también durante la indisponibilidad del worker/Redis y cubrir jobs fallidos malformados, o la gobernanza debe modificar explícitamente la decisión “pase lo que pase”. No evalué ni ejecuté esa remediación.

No se ejecutaron pruebas ni servicios y no se hizo commit.

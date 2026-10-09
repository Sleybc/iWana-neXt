# Reauditoría de seguridad MOD11 ↔ MOD12 — S2 v1.3

**Fecha:** 2026-10-09  
**Agente:** sec-eng  
**Dictamen:** **GO** para D11-RET-01 y D11-RET-02  
**Modo:** solo lectura; no se ejecutaron tests ni procesos y no se modificó código.  
**Sin commit.**

## Alcance

Revisé la D11 enmendada de la spec, los informes S2 v1.2, R-D11B y R-D11C, y el código actual de limpieza en API y worker. Esta versión reaudita únicamente los dos bloqueos de retención de S2 v1.2.

| Bloqueo previo | Dictamen | Evidencia actual |
|---|---|---|
| D11-RET-01 — dependía de un único worker | **GO** | API y worker registran limpiadores repetibles horarios independientes. Cada uno limpia las dos colas de origen. |
| D11-RET-02 — jobs malformados podían eludir la limpieza | **GO** | Ambas rutas limpian todos los jobs en estado `failed` por edad, sin inspeccionar nombre, `eventType` ni payload. |
| Umbral máximo de 24 horas | **GO** | La gracia se deriva de las constantes compartidas: 24 h − 1 h = 23 h. El siguiente ciclo horario elimina el job antes de cumplir 24 h, bajo las condiciones operativas indicadas abajo. |

## D11-RET-01 — limpiador independiente desde API y worker: GO

El API registra `clean-expired-inventory-source-failures` cada `INVENTORY_SOURCE_CLEANUP_INTERVAL_MS` en `inventory-execution-requests` al iniciar (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:152-161`). Su processor reconoce ese trabajo y ejecuta la limpieza de `inventory-execution-requests` y `operations-execution-events` (`:163-166`, `:467-471`).

El worker registra un trabajo repetible horario independiente en `operations-execution-relay`, con un ID distinto del trabajo del API (`apps/worker/src/services/execution-order-relay.service.ts:135-142`). Su processor lo reconoce y limpia ambas colas de origen (`apps/worker/src/processors/execution-order-relay.processor.ts:39-55`). Por ello, con solo API activo o solo worker activo, el proceso correspondiente tiene su propio trabajo repetible y cubre ambas colas.

Las limpiezas de las dos colas se inician en paralelo, y cada limpieza captura su propio error (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:467-489`; `apps/worker/src/processors/execution-order-relay.processor.ts:51-73`). Un error limpiando una cola no impide intentar la otra. Los lotes se repiten mientras se obtengan 1.000 IDs, evitando dejar el backlog elegible para el siguiente ciclo únicamente por el límite del lote.

## D11-RET-02 — independiente del contenido: GO

En ambas implementaciones, la selección para borrar se hace exclusivamente mediante `queue.clean(grace, 1_000, 'failed')` (`apps/api/src/modules/inventory/services/inventory-execution-request.processor.ts:474-483`; `apps/worker/src/processors/execution-order-relay.processor.ts:58-67`). No se consulta `job.name`, `eventType` ni `data` para decidir qué borrar. Así, los fallidos antiguos malformados o sin tipo también entran en el mismo borrado por edad.

## Umbral temporal — GO

Las dos constantes se definen una sola vez en `packages/shared/src/constants/inventory-source-retention.ts:1-5` y se exportan desde `packages/shared/src/index.ts:42-50`. API y worker importan ambas del paquete compartido. El valor de gracia se calcula directamente en cada llamada:

```text
INVENTORY_SOURCE_MAX_AGE_MS - INVENTORY_SOURCE_CLEANUP_INTERVAL_MS
= 24 horas - 1 hora
= 23 horas
```

Con la cadencia horaria, una limpieza que no borra el job en el umbral de 23 horas tiene el siguiente ciclo dentro de la hora siguiente. Esto cierra la brecha señalada en R-D11B, que con gracia de 24 horas podía alcanzar casi 25 horas. Los tests y conteos reportados para el cambio están en R-D11C; no los volví a ejecutar en esta auditoría.

## Condiciones operativas y conclusión

La garantía depende de que Redis esté disponible y de que al menos uno de los procesos activos pueda procesar su trabajo repetible. Si una llamada a `clean` falla, el código registra solo la cola y un tipo de error permitido; el ciclo intenta de nuevo en la siguiente ejecución. El caso de plataforma caída queda fuera del compromiso de D11 enmendada y asignado a G7.

Con esas condiciones de D11, ambos procesos cubren ambas colas, la selección no depende del contenido y la gracia derivada de 23 horas permite completar el borrado en el siguiente ciclo sin rebasar las 24 horas. **S2 v1.3 queda GO para D11-RET-01 y D11-RET-02.**

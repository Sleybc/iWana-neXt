# Informe MOD11↔MOD12 — I4 SR-QA v1.1

**Fecha:** 2026-10-08 UTC  
**Resultado:** **NO GO**. Tres de cuatro motivos de CA-04 cerraron con recibo; `SUBSCRIBER_REQUIRED` quedó `PENDING` sin recibo. En Portal, los cuatro textos de rechazo no aparecen porque la respuesta de usos no trae sus códigos. La inyección sin outbox no produjo firma ni movimiento.

## Alcance y entorno

Se revalidaron únicamente CA-04, los textos visibles de rechazo y pendiente prolongado, la inyección V2 sin fila outbox y los contadores agregados de retención D11. No se repitieron CA-01..03 ni CA-05..11.

La corrida usó exclusivamente el tenant/schema sintético de I4 en PostgreSQL local `5433`, Redis local `6380` DB `15`, API local `3000` y Portal `49190`. El API respondió health 200 directo. Las solicitudes de negocio fueron HTTP real, sin interceptores. Las credenciales se conservaron en el seed local y no se copian a este informe. No se consultaron ni modificaron datos de `tenant_iwana` ni OT reales.

## CA-04 — cuatro motivos de rechazo

Se creó una OT sintética nueva por motivo a partir del fixture con snapshot v2. Cada OT recibió una sola solicitud; no se reintentó ningún POST durante esta verificación.

| Motivo | POST | Recibo persistido en SQL | Uso | `request_attempts` | Resultado |
|---|---:|---|---|---:|---|
| `CUSTODY_INSUFFICIENT` | 202 | `REJECTED`, código coincidente | `REJECTED` | 1 | PASS |
| `ITEM_INACTIVE` | 202 | `REJECTED`, código coincidente | `REJECTED` | 1 | PASS |
| `SERIAL_NOT_IN_CUSTODY` | 202 | `REJECTED`, código coincidente | `REJECTED` | 1 | PASS |
| `SUBSCRIBER_REQUIRED` | 202 | **Ausente** | `PENDING` | 1 | **FAIL / BLOQUEO** |

Para `SUBSCRIBER_REQUIRED` no se repitió la solicitud ni se atribuyó una causa no demostrada. Al cierre, su uso seguía `PENDING`, sin recibo nuevo; la cola `inventory-execution-requests` tenía cero jobs en `waiting`, `active`, `delayed` y `failed`. El fallo bloquea CA-04 y requiere corrección de `sr-backend`.

La columna SQL `request_attempts` fue 1 para los cuatro casos. No se afirma `BullMQ attemptsMade=1`: los jobs completados se autoeliminan y el listener de eventos no logró correlacionar el ID del job en esta corrida. El agregado final mostró cero jobs fallidos en las colas fuente de inventario/eventos.

## Portal — textos visibles

Portal inició sesión con HTTP 200; el listado y el detalle devolvieron HTTP 200. El listado contenía la OT sintética. El detalle correspondía a snapshot de plantilla v2, con un requisito material, cuatro usos `REJECTED` y uno `PENDING`.

- El aviso de pendiente prolongado apareció visible en pantalla.
- Ninguno de los cuatro textos de rechazo apareció.
- El GET de usos devolvió cuatro rechazos sin un `rejectionReasonCode` utilizable, aunque la consulta SQL de la fixture tenía una fila para cada código esperado.

Hallazgo de producto para `sr-backend`: `listItemUsage()` omite `usage.rejectionReasonCode` de la proyección del QueryBuilder; el mapeo de contrato lo convierte en `null`. La consola no recibe el código necesario para elegir el copy de cada rechazo. No se modificó código durante QA.

## Inyección V2 sin outbox

Se publicó una envoltura `InventoryConsumptionRequestedV2` sintética directamente en `operations-execution-events`, con un `eventId` nuevo y sin fila correspondiente en `execution_order_outbox_events`.

- Filas outbox coincidentes antes del evento: **0**.
- Se observó el diagnóstico y luego la retirada del job fuente.
- Job firmado presente/observado en `inventory-execution-requests`: **no**.
- Delta SQL agregado antes/después: saldo disponible **0**, `stock_movements` **0**, `stock_movement_lines` **0**.

**Resultado: PASS.** La inyección no se firmó ni movió stock.

## D11 — retención observada

En Redis DB `15`, al cierre:

- `inventory-execution-requests`: `failed=0`, por tanto `>24 h=0`.
- `operations-execution-events`: `failed=0`, por tanto `>24 h=0`.
- La retención configurada para jobs fallidos fuente de inventario es 24 horas; la retención configurada para la DLQ diagnóstica es 30 días.
- La DLQ mostró **20 jobs pausados** en el conteo BullMQ. No se leyeron sus payloads ni IDs; su edad no se pudo verificar. Por ello, se confirma la configuración de 30 días, pero no una muestra retenida durante ese plazo.
- El agregado de `operations-execution-relay` mostró 16 fallidos en la clase segura `TENANT`, con edad máxima agregada de 37 h. No se inspeccionaron ni limpiaron. Se dejan fuera del conteo de las colas fuente de inventario; su alcance de retención queda como limitación separada.

## Cierre

I4 v1.1 queda **NO GO** por el caso `SUBSCRIBER_REQUIRED` sin recibo y por los cuatro copies de rechazo ausentes en Portal. La inyección sin outbox pasó. La evidencia de reintentos queda limitada al contador SQL `request_attempts=1`; no se presenta como medición directa de `BullMQ attemptsMade`. No se hizo commit.
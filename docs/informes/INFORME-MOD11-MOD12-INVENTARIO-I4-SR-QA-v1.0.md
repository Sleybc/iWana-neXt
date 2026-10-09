# Informe I4 — verificación integrada CA-01 a CA-11

**Versión:** 1.0 (cierre con evidencia dinámica)  
**Fecha:** 2026-10-07  
**Agente:** sr-qa  
**Dictamen I4:** **NO GO — CA-04 no cumple para `SUBSCRIBER_REQUIRED`; la copia visible de CA-04 no quedó verificada en UI.**  
**Alcance:** API, worker, PostgreSQL, Redis y Portal locales; fixtures sintéticos; sin interceptar HTTP.

## Resumen

Se completaron las comprobaciones integradas de inventario con infraestructura local real y dos tenants de prueba. CA-01, CA-02, CA-03, CA-05 a CA-11 tienen evidencia funcional o de persistencia según se detalla abajo. CA-04 queda abierto: tres motivos sí producen `REJECTED` sin reintentos, pero `SUBSCRIBER_REQUIRED` acaba como `UnrecoverableError`, sin recibo ni rechazo persistido. Tampoco se validó en pantalla el copy de los rechazos de CA-04.

El dictamen I4 es **NO GO**. El informe S2 sigue en **NO GO** por los tres bloqueos estáticos de I1 y conserva una consulta aparte sobre los failed source jobs; véase [INFORME S2](INFORME-MOD11-MOD12-INVENTARIO-S2-SEC-ENG-v1.0.md).

## Entorno y protección de datos

- PostgreSQL local en `5433`, base `i4_qa_20261006_a1`; Redis local en `6380`, DB 15 para la corrida I4.
- Se usaron exclusivamente los schemas sintéticos `tenant_i4_qa_a_20261006_9d3098f4` y `tenant_i4_qa_b_20261006_9d3098f4`. Ambos tenants estaban `ACTIVE`; no se consultó ni modificó `tenant_iwana`.
- El técnico y la ubicación móvil tienen identificadores distintos; la `StockLocation` está asignada al técnico por `responsibleRefId`.
- API y worker procesaron los jobs reales en la infraestructura local. Playwright abrió la consola Portal y usó sus endpoints reales; no se instalaron `page.route`, mocks ni interceptores HTTP.
- Tras el reinicio, la DB y Redis DB15 conservaron la evidencia. Para la comprobación visual de CA-03 se levantó un API auxiliar de loopback y una instancia Portal en `49189`, usando la DB sintética y el proxy same-origin de Next. Redis DB14 estaba vacío antes de iniciar ese API; el flujo visual solo hizo autenticación de la cuenta sintética y lecturas de consola/custodia. No se escribieron consumos desde la UI.
- Las credenciales se mantuvieron en el archivo local de seed fuera de este informe. No se incluyen usuario, contraseña, tokens ni claves HMAC.
- No se modificó código ni se hizo commit.

## Resultado por criterio

| CA | Resultado | Evidencia y límites |
|---|---|---|
| **CA-01** | **PASA** | Una fila de uso de la OT sintética queda `CONFIRMED`; hay un recibo confirmado, un movimiento con dos líneas y un comodato abierto asociado a esa OT. El CPE termina `INSTALLED_COMODATO` en el sitio del cliente. El saldo de la custodia móvil baja de 4 a 3. El id de la ubicación móvil es distinto del id del técnico. |
| **CA-02** | **PASA** | Consumo de cantidad confirmado por API/worker y persistido: una unidad de material en custodia pasa de 1 a 0; se registra un movimiento y su recibo. |
| **CA-03** | **PASA, con límite de UI descrito** | La lectura API del uso de CA-01 devuelve una instalación `CONFIRMED`. En Portal se abre el acto R3 de “Registrar equipo instalado” en una OT sintética v2 en progreso; `GET /api/v1/inventory/custody` responde 200, la custodia muestra un serial distinto y el serial instalado por CA-01 no aparece en el listado visible de custodia. El selector “Ítem” es por artículo y el campo “Serial o lote” es texto libre; no existe un desplegable por serial. La comprobación confirma que R3 ya no ofrece el serial en la custodia mostrada. |
| **CA-04** | **FALLA / PARCIAL** | PostgreSQL conserva `REJECTED` para `CUSTODY_INSUFFICIENT` (1), `ITEM_INACTIVE` (1) y `SERIAL_NOT_IN_CUSTODY` (2); los jobs de esos rechazos no se reintentaron. El caso `SERIAL_NOT_IN_CUSTODY` usa un serial en otra custodia. En cambio, `SUBSCRIBER_REQUIRED` reproduce un `UnrecoverableError`: queda sin recibo y sin transición a `REJECTED`, tras un intento. El log agregado identifica el tipo `UnrecoverableError`. La copia visible para los rechazos no se verificó en navegador: sus OTs de fixture no tienen snapshot de plantilla. **Hallazgo de producto para I2/API.** |
| **CA-05** | **PASA** | Dos jobs simultáneos, reintento y replay producen un solo recibo, un solo movimiento y una sola transición. Ambos jobs concurrentes terminan; uno se reintenta (`attemptsMade=2`). El saldo CPE pasa de 3 a 2. |
| **CA-06** | **PASA** | Una restricción temporal, solo dentro del schema sintético, provoca un fallo técnico real. Tras dos intentos el job queda fallido y diagnosticado en la DLQ; no hay recibo ni movimiento y el uso sigue `PENDING`. La restricción temporal se retiró al terminar el caso. |
| **CA-07** | **PASA en reencolado/persistencia** | Un consumo pendiente heredado V1 provoca una solicitud V2 del scanner D7; el intento pasa de 1 a 2 y el consumo termina confirmado con recibo y movimiento. Una fila envenenada con datos inválidos se aísla por SAVEPOINT, pasa de 9 a 10 intentos y no bloquea la válida; permanece `PENDING` y agotada. La presentación visual del copy de pendiente prolongado no se volvió a abrir en esta continuación. |
| **CA-08 (a–e)** | **PASA, cinco negaciones** | Tenant inexistente y tenant interno/externo inconsistente se descartan antes del ledger; tenant alterado con firma inválida no mueve stock en B; A y B en paralelo conservan sus schemas/contextos; tenant no `ACTIVE` se difiere sin movimiento. Se contrastaron recibos, usos y movimientos en ambos schemas sintéticos. |
| **CA-09** | **PASA en la corrida I4 previa al reinicio** | La respuesta tardía se aplica después del cierre. Estado terminal, resultado, `closed_at` y notas de cierre permanecen intactos. Este caso ya estaba cerrado y no se repitió durante la continuación. |
| **CA-10** | **PASA en la corrida I4 previa al reinicio** | Un resultado contradictorio no reemplaza el `CONFIRMED` existente y deja registrada la anomalía. Este caso ya estaba cerrado y no se repitió durante la continuación. |
| **CA-11** | **PASA para DLQ diagnóstica y logs; consulta de frontera** | Un job fallido real de la DLQ dedicada se inspeccionó en Redis DB15. El objeto observado tiene exactamente los siete campos permitidos (`attemptsMade`, `errorType`, `eventId`, `executionOrderId`, `failedAt`, `inventoryRequestId`, `tenantId`): 0 campos inesperados y 0 campos prohibidos (`payload`, `envelope`, `actorUserId`, `subscriberId`, `errorMessage`). La revisión S2 corroboró logs sin payload ni mensaje crudo. Sigue la consulta S2 sobre los failed source jobs, que se conserva en su informe. |

## Conteos SQL y Redis

Conteos contrastados en PostgreSQL real, schema sintético A:

```text
execution_order_item_usage agrupado por movement_status/rejection_reason_code:
  CONFIRMED | sin motivo                 6
  PENDING   | sin motivo                 2
  REJECTED  | CUSTODY_INSUFFICIENT        1
  REJECTED  | ITEM_INACTIVE              1
  REJECTED  | SERIAL_NOT_IN_CUSTODY      2

inventory_execution_request_receipts agrupado por outcome:
  CONFIRMED 6
  REJECTED  4

stock_movements: 6
asset_loan_assignments abiertos (schema A): 5
asset_loan_assignments abiertos (OT CA-01): 1
líneas de movimiento (OT CA-01): 2
```

Los dos usos `PENDING` son consistentes con el fallo `SUBSCRIBER_REQUIRED` y la fila envenenada de D7; ninguno tiene recibo de decisión. La cuenta de recibos confirmados/rechazados y los movimientos corresponde a los casos ya decididos, no a una afirmación de que toda fila quedó conciliada.

Conteos observados en Redis DB15 al cerrar la inspección:

```text
inventory-execution-requests: wait=0, active=0, completed=10, failed=11
operations-execution-dlq:    wait=0, paused=11
```

La cola diagnóstica estaba pausada para preservar evidencia. El conteo de `failed` de la cola fuente no equivale al número de jobs que se inspeccionaron individualmente. Se validó un job real de la DLQ por sus nombres de campo, sin extraer ni registrar valores. La lectura de `/api/v1/health` respondió 200 con DB y Redis `ok`; el agregado sintético mostraba `reconciliationDiscrepancies=14`, que no se atribuyó a un CA individual.

## Hallazgo y acción necesaria

**[BLOQUEO] I2/API — `SUBSCRIBER_REQUIRED` no se convierte en rechazo de negocio.** El caso se procesa como fallo irrecuperable, sin recibo ni `rejectionReasonCode`, contradiciendo CA-04 y la decisión de que un rechazo de negocio es un resultado persistido, no un error técnico. Corregir el camino del consumidor para persistir el recibo `REJECTED/SUBSCRIBER_REQUIRED` en la misma transacción y completar el job sin reintento; repetir el caso en PostgreSQL/Redis reales y verificar luego el copy visible en la consola.

## Cierre

I4 no autoriza GO mientras CA-04 siga fallando. CA-09 y CA-10 conservan la evidencia previa al reinicio; NVDA no forma parte de esta entrega. No se hizo commit.

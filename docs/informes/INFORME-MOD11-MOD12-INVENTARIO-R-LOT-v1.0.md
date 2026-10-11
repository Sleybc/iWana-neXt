# Informe MOD11/MOD12 — asignación de consumo por lote R-LOT

**Fecha:** 2026-10-11  
**Resultado:** GO R-LOT  
**Commit/PR:** no creados.

## Implementación

- `StockBalanceService` conserva intacta la semántica estricta de `getAvailabilityWithManager` y añade consultas explícitas para sumar el disponible de todas las filas de lote y ordenar sus asignaciones. El orden es FEFO (`expiry_date` ascendente, nulos al final), FIFO por `stock_lots.created_at` y, al final, el saldo sin lote.
- El consumo de OT valida la suma del disponible en la custodia y reparte la cantidad entre lotes disponibles. Cada asignación genera una línea negativa en custodia y su línea positiva de destino con el mismo lote. Para un serial se conserva el lote del activo; si el activo carece de lote, se asigna una unidad siguiendo el mismo orden, sin escribir el lote en el activo.
- El consumo toma un advisory lock por ítem, custodia y condición antes de consultar y asignar lotes. `applyDeltaWithManager` toma ese mismo lock global antes de su lock por lote; la validación y los deltas siguen dentro de la transacción.
- El reverso admite varias líneas negativas cuando pertenecen al mismo ítem y a la misma custodia, sujeto a las comprobaciones existentes de origen de OT y custodia activa. Copia las líneas originales una por una y conserva el lote de cada una.
- La integración descubrió un defecto relacionado que impedía probar el reverso: el evento de consumo rellenaba `payload.executionOrderId` con el ID del registro de consumo. `registerItemUsage` ahora publica la OT como agregado y conserva el ID de consumo como `resultResourceRef`. No cambia el contrato público de API.

## Pruebas integradas

La suite corrió contra PostgreSQL real (`127.0.0.1:5433`, DB sintética `i4_qa_20261006_a1`) y Redis real (`127.0.0.1:6380`, DB 15), usando la cola y el processor de la API. Resultado: **1 suite aprobada, 13/13 tests**.

Casos R-LOT comprobados de extremo a extremo:

1. El consumo de tres unidades se reparte entre dos lotes por FEFO, con las dos líneas de origen y las dos de destino conservando sus lotes.
2. La suma insuficiente de los lotes produce `CUSTODY_INSUFFICIENT` y un recibo rechazado.
3. Un serializado sin lote toma el lote FEFO disponible; el activo sigue sin lote.
4. El reverso del movimiento repartido se confirma, restaura los saldos y conserva los lotes línea a línea.

Los otros nueve casos de la suite integrada también pasaron, incluidos rechazos existentes y reversos concurrentes.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm typecheck --force` | 8 tareas exitosas; caché desactivada |
| Jest de `src/modules/inventory`, `--runInBand --no-cache` | 78 suites aprobadas; 809 tests aprobados, 8 omitidos; 3 suites omitidas por configuración |
| Suite integrada R-CA04 con PostgreSQL y Redis reales, `--no-cache` | 1 suite aprobada; 13 tests aprobados |
| `execution-orders.task8.spec.ts`, `--no-cache` | 1 suite aprobada; 24 tests aprobados |
| `git diff --check` | Sin errores de whitespace. Git avisó que normalizará CRLF/LF en archivos preexistentes del portal y documentos. |

## Archivos

- `apps/api/src/modules/inventory/services/stock-balance.service.ts`
- `apps/api/src/modules/inventory/services/stock-ledger.service.ts`
- `apps/api/src/modules/inventory/tests/stock-balance.service.spec.ts`
- `apps/api/src/modules/inventory/tests/stock-ledger.service.spec.ts`
- `apps/api/src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts`
- `apps/api/src/modules/tasks/services/execution-orders.service.ts`
- `apps/api/src/modules/tasks/tests/execution-orders.task8.spec.ts`

Sin migraciones ni cambios de contrato público. Se conservaron los demás cambios del workspace y no se creó commit.

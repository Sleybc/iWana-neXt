# Informe V4 — verificación integrada del reverso MOD11 ↔ MOD12

- **Fecha:** 2026-10-10
- **Rol:** `sr-qa`
- **Dictamen:** **NO GO**
- **HEAD base:** `7552c505fc5bd0bbdcbe2c5fe9313b80a7421c7c`
- **Árbol probado:** cambios locales sin commit de V1, V2 y V3 sobre `main`.
- **Commit:** ninguno.

## Resumen del dictamen

El integrado R-CA04 pasó en el tenant sintético para los cuatro motivos de reverso y una carrera de dos solicitudes contra PostgreSQL y Redis. También pasaron las suites focales de API, worker y consola. Sin embargo, el Redis de desarrollo activo **acepta consultas sin AUTH**: una conexión nueva devolvió `PONG` a `PING` y `196483` a `DBSIZE` sin credenciales. Con `REDIS_PASSWORD`, una conexión nueva también devolvió `OK`, `PONG` y `196483`. La autenticación configurada funciona, pero no es obligatoria; esto incumple ADR-074 y bloquea el GO.

Además, los integrados disponibles no recorren el reverso desde el comando supervisor y su outbox hasta la proyección de respuesta en MOD11. RA-01, RA-03, RA-04, RA-09, RA-12 y RA-14 no tienen evidencia completa contra el stack real; RA-13 tampoco quedó inspeccionada en una job/DLQ real. No afirmo que esos criterios pasen.

## Entorno y evidencia ejecutada

La suite usó solo la base sintética `i4_qa_20261006_a1`, el tenant `i4-qa-a-20261006-9d3098f4`, PostgreSQL en `127.0.0.1:5433` y Redis de desarrollo. El probe del integrado confirmó que PostgreSQL estaba disponible. No se apuntó a un tenant productivo.

| Verificación | Resultado fresco |
|---|---|
| `inventory-execution-request.ola3d.postgres.integration.spec.ts --runInBand --no-cache` | PASS, 1 suite / 9 tests. Cuatro motivos de consumo, cuatro motivos R7 con recibo `REJECTED` y un intento, y dos reversos concurrentes con un movimiento contrario. |
| API: `execution-orders.task8`, `execution-orders.ola1-regression`, `closure-gate-material-disposition` (`--runInBand --no-cache`) | PASS, 3 suites / 57 tests. Incluye el comando unitario de reverso, motivo ausente del payload de outbox y validaciones locales. |
| Worker: `execution-order-events.processor`, `execution-order-relay.service`, `execution-order-inventory-rescan.service` (`--runInBand --no-cache`) | PASS, 3 suites / 53 tests. Incluye clasificación de retención, transiciones y reemisión D7 con dobles. |
| Portal: `ExecutionOrderMaterialAction.spec.tsx --runInBand --no-cache` | PASS, 1 suite / 51 tests. Incluye copy de los cuatro rechazos, acción tras rechazo, estados y marca de corrección posterior al cierre. |
| API: `inventory-execution-request.processor.spec.ts` y `stock-ledger.service.spec.ts` (`--runInBand --no-cache`) | PASS, 2 suites / 44 tests. Son pruebas unitarias; el spec del ledger no contiene casos del nuevo método de reverso. |
| Redis, conexión nueva sin credenciales: `PING`, `DBSIZE` | **FAIL de seguridad:** `PONG`, `196483`; no respondió `NOAUTH`. |
| Redis, conexión nueva con `REDIS_PASSWORD` enviado por stdin: `AUTH`, `PING`, `DBSIZE` | `OK`, `PONG`, `196483`. No se imprimió ni registró la clave. |

La credencial ACL local `iwana_readonly` devolvió `WRONGPASS` en una conexión nueva. No la reparé porque el encargo V4 es de verificación. Tampoco materialicé `job.data` ni imprimí payloads. Por ello no hay inspección de jobs/DLQ vivos para RA-13. La propia suite integrada inspecciona `responseJob.data`, pero ese objeto es la respuesta de prueba y no una inspección segura del job firmado o de la DLQ requerida por RA-13.

## Matriz RA-01 a RA-14

| Criterio | Estado V4 | Evidencia y límite |
|---|---|---|
| **RA-01** CPE serial, custodia, comodato ligado y movimiento enlazado | **Sin evidencia integrada** | El integrado no confirma el happy path serial ni comprueba estado del serial, cierre del comodato, `reversedByMovementId` y proyección juntos. Los fixtures seriales existentes en esa suite se usan para rechazos. |
| **RA-02** retorno de saldo por cantidad | **Parcial** | La carrera integrada usa un original no serial y verifica que se crea un solo movimiento contrario. No lee ni compara los saldos antes/después. |
| **RA-03** original inmutable | **Sin evidencia suficiente** | Ninguna aserción del integrado compara estado, recibo y líneas originales antes y después; no se inspeccionó una reversión confirmada completa. |
| **RA-04** OT terminal sin reescritura y copy posterior al cierre | **Parcial** | La spec del portal verifica la marca con props simuladas. La prueba unitaria del comando prepara una OT `COMPLETED`, pero no contrasta resultado, cierre y evidencia en PostgreSQL real antes/después de recibir la respuesta. |
| **RA-05** técnico denegado y supervisor fuera de sede denegado | **Parcial** | Hay matriz estática de roles/permisos en `execution-orders.ola1-regression.spec.ts` y pruebas de visibilidad del portal con `allowedActions` simulado. No se ejercitó contra API real el `403`, el alcance de sede y la ausencia de acción derivada del estado persistido. |
| **RA-06** motivo obligatorio y filtro de patrones PII → `422` | **Parcial** | `task8.spec.ts` comprueba que motivo vacío y un patrón conocido de PII fallan antes de abrir la transacción. No es una petición HTTP/integrada que compruebe el estado `422`. |
| **RA-07** segunda solicitud `409` y replay idempotente, incluida carrera | **Parcial** | La carrera real contra Redis/PostgreSQL usa **dos `reversalRequestId` distintos** sobre el mismo movimiento y obtiene un confirmado, un rechazado y un movimiento. No verifica replay de la misma solicitud ni `409` persistido en `PENDING`/`CONFIRMED` mediante API. |
| **RA-08** cuatro motivos R7, recibo, sin retry y copy | **Parcial** | Los cuatro motivos (`REVERSAL_ORIGINAL_NOT_FOUND`, `REVERSAL_CUSTODY_INACTIVE`, `REVERSAL_ASSET_MOVED`, `REVERSAL_LOAN_MISMATCH`) pasaron cada uno por la cola de Redis y el consumidor del API, con recibo `REJECTED` y `apiAttempts: 1`. La prueba firma el job directamente y no crea el reverso vía MOD11, no consume la respuesta en el worker ni verifica la proyección `REJECTED` en MOD11. El copy sí pasó en la suite de consola. La matriz estricta de `iwana-matriz-motivos` requiere ese recorrido completo, por lo que el criterio no cierra. |
| **RA-09** requisito MATERIAL vuelve a pendiente en progreso y cierre | **Sin evidencia** | Las pruebas genéricas de gate de material no contienen reversos. No se verificó la exclusión de la línea confirmadamente revertida en ambos caminos con datos persistidos. |
| **RA-10** línea `PENDING` o `REJECTED` sin acción | **Parcial** | La consola impide segunda solicitud cuando el reverso está `PENDING` o `CONFIRMED`; también vuelve a mostrarla tras `REJECTED`. La query de `allowedActions` que usa datos del API no se probó con Postgres real para los estados del reverso y del consumo. |
| **RA-11** extensiones R5 (outbox, HMAC, dispatch, transición, relay 24 h, DLQ) | **Parcial** | El código enumera los tipos en `INVENTORY_EVENT_TYPES`, coteja el outbox, firma el job, despacha el tipo de reverso y aplica transiciones condicionales. La suite del relay verifica 24 h para el evento de reverso. Las pruebas ejecutadas no recorren todos esos puntos con un evento nacido del outbox real; el integrado crea el sobre firmado desde un helper y no ejercita el relay ni la respuesta proyectada. La DLQ sanitaria probada es genérica de inventario, no un fallo real de reverso. |
| **RA-12** nuevo reverso tras rechazo | **Parcial** | La interfaz ofrece nuevamente la acción en un ejemplo `REJECTED`; el integrado solo prueba rechazos de MOD12, no una solicitud nueva vía MOD11 tras resolver la causa. |
| **RA-13** motivo ausente en outbox, job, logs y DLQ | **No verificado completo** | La prueba unitaria de MOD11 comprueba el payload del outbox; el test unitario D7 comprueba que el payload reemitido no lleva `reason`; el test de DLQ ejercita un evento de consumo. Faltó inspeccionar sin `job.data` un job y una DLQ reales del reverso, así como capturar el recorrido de logs de ese caso. El usuario ACL de solo lectura falló AUTH; no intenté leer payloads con otra credencial. |
| **RA-14** respuesta perdida recuperada por D7, un solo movimiento | **Sin evidencia integrada** | La suite de D7 usa mocks de SQL y comprueba `SKIP LOCKED`, nuevo evento y mismo `reversalRequestId`; no simula pérdida de respuesta contra PostgreSQL/Redis ni verifica un movimiento único después de la recuperación. |

## Referencias revisadas

- `apps/api/src/modules/inventory/tests/inventory-execution-request.ola3d.postgres.integration.spec.ts:995-1067`: rechazos y carrera real. El helper `runThroughReversalApiQueue` entrega el sobre firmado directamente a Redis y no pasa por outbox/relay.
- `apps/api/src/modules/tasks/services/execution-orders.service.ts:1702-1820`: autorización/creación del reverso; motivo persistido en MOD11 y payload explícito sin `reason`. `:344-388`, `:1822-1954` y `:3619-3636`: progreso/cierre y exclusión de reversos confirmados. `:3037-3062`: disponibilidad de acción.
- `apps/worker/src/processors/execution-order-events.processor.ts:39-54,182-245,315-316,434-464,522-620,914-989`: tipos, diagnóstico, cotejo, firma, dispatch y transiciones.
- `apps/worker/src/services/execution-order-relay.service.ts:51-62,294-296`: clase inventario y retención de 24 h.
- `apps/worker/src/services/execution-order-inventory-rescan.service.ts:245-357` y `apps/worker/src/services/execution-order-inventory-rescan.service.spec.ts:241-298`: recuperación R10/D7 y límite de la prueba mock.
- `apps/api/src/modules/tasks/tests/execution-orders.task8.spec.ts:278-402`: motivo/outbox y caso negativo unitarios.
- `apps/worker/src/processors/execution-order-events.processor.spec.ts:1013-1044`: DLQ sanitizada en un evento de consumo, no de reverso.
- `apps/portal/src/components/operations/ExecutionOrderMaterialAction.spec.tsx:869-1049`: acceso, retry visible tras rechazo, copy y marca posterior al cierre con datos de componente.

## Cierre

**NO GO para V4.** Bloqueo confirmado: el Redis local permite `PING` y `DBSIZE` sin AUTH, aunque también acepta la contraseña. Antes de repetir el gate, hay que restablecer el Redis dev con `requirepass` efectivo y regenerar el ACL de solo lectura si se necesita `queue-inspect`. Tras eso, siguen pendientes los integrados que completan el recorrido de MOD11 para RA-01/03/04/05/07/08/09/10/12/13/14, especialmente el happy path serial/comodato, el cierre/progreso tras reverso y la recuperación D7 de una respuesta perdida.

No modifiqué código, configuración ni ACL; no creé commit.

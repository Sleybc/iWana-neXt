# Informe R-CA04 — cierre integrado de rechazos de inventario

**Fecha:** 2026-10-08  
**Agente:** sr-backend  
**Estado global:** **NO GO / BLOQUEADO** porque no se demostró la causa histórica exigida. Corrección de proyección y cuatro recorridos integrados: **GO**. El repro nuevo no reproduce el fallo.  
**Commit:** ninguno.

## Cambios

- `ExecutionOrdersService.listItemUsage()` ahora incluye `usage.rejectionReasonCode` en su proyección explícita. Un test contra PostgreSQL verifica que el contrato devuelve el código persistido.
- Se revisaron las demás lecturas de `ExecutionOrderItemUsage`: la evaluación de requisitos selecciona solo `itemId`, `finalDisposition` y `requirementKey`; el resumen de reconciliación solo requiere `movementStatus`; las rutas de cierre y replay cargan la entidad completa. Ninguna de esas lecturas construye el listado de consumo que necesita el copy de rechazo.
- Se añadió un recorrido integrado con los processors reales de MOD11 y MOD12 y colas BullMQ reales sobre Redis DB15. Las cuatro OTs y sus items, ubicaciones y serial son propios y sintéticos. Para `CUSTODY_INSUFFICIENT`, `ITEM_INACTIVE` y `SERIAL_NOT_IN_CUSTODY`, la OT tiene subscriber sintético y custodia móvil activa cuyo id difiere del técnico; el caso de saldo insuficiente no tiene balance, y el serial de prueba está en otra ubicación. `SUBSCRIBER_REQUIRED` conserva `subscriberId: null`.
- El test crea la orden/consumo por `ExecutionOrdersService`, verifica el outbox, hace que el worker coteje y firme el V2, procesa el job desde Redis en el API, persiste el recibo y consume la respuesta para proyectar `REJECTED` en MOD11. Cada hop BullMQ completó en un intento. Las assertions SQL comparan el código del recibo con `rejection_reason_code` de la proyección.

## Diagnóstico del caso histórico `SUBSCRIBER_REQUIRED`

La traza previa confirma que MOD11 publicó el evento del outbox, el job de origen fue retirado, existe un diagnóstico correlacionado en la DLQ y no hay recibo. El tramo perdido queda entre la publicación del outbox y la persistencia del recibo en MOD12. **No se pudo demostrar la excepción concreta ni escoger entre cotejo/firma, validación del consumidor o escritura del recibo.**

Intenté leer únicamente los campos permitidos `errorType`, `attemptsMade` y `failedAt` del job correlacionado. El auto-review bloqueó la lectura porque BullMQ `getJob()` materializa `job.data` completo. También bloqueó la inspección de logs correlacionados que requería cargar líneas completas. No hice más lecturas ni busqué una vía indirecta; por eso el `errorType` histórico y la categoría del log quedan sin verificar.

El repro nuevo con los processors y servicios actuales **no reproduce** la desaparición: el caso `SUBSCRIBER_REQUIRED` terminó con recibo `REJECTED/SUBSCRIBER_REQUIRED`, respuesta encolada y proyección `REJECTED/SUBSCRIBER_REQUIRED`; los tres jobs completaron con `attemptsMade = 1`. Esto valida el comportamiento actual en el entorno sintético, pero no demuestra retrospectivamente la causa del job histórico.

## Evidencia y gates

Base usada: `i4_qa_20261006_a1`, tenant/schema de prueba `tenant_i4_qa_*`; PostgreSQL local en puerto 5433 y Redis local en puerto 6380, DB 15. No se consultó ni modificó `tenant_iwana`. Las credenciales se leyeron del seed local y no se incluyen en este informe.

| Ejecución                                                                      | Resultado                                                                                                                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test PostgreSQL de `listItemUsage()`                                           | 1 suite, 1 test PASS; el código `SUBSCRIBER_REQUIRED` llega en la respuesta del servicio                                                                                      |
| Recorridos CA-04 Postgres + Redis                                              | 1 suite, 4 tests PASS: `SUBSCRIBER_REQUIRED`, `CUSTODY_INSUFFICIENT`, `ITEM_INACTIVE`, `SERIAL_NOT_IN_CUSTODY`; recibo/proyección coinciden y cada hop completó en un intento |
| `pnpm exec jest --runInBand --no-cache src/modules/tasks` desde `apps/api`     | 35 suites, 727 tests PASS                                                                                                                                                     |
| `pnpm exec jest --runInBand --no-cache src/modules/inventory` desde `apps/api` | 78 suites, 797 tests PASS; 3 suites y 8 tests omitidos por gating de entorno                                                                                                  |
| `pnpm exec jest --runInBand --no-cache` desde `apps/worker`                    | 17 suites, 141 tests PASS                                                                                                                                                     |

Los dos tests integrados se ejecutaron con `jest --config jest.integration.config.js --runInBand --runTestsByPath` sobre sus respectivos archivos, con `DB_NAME=i4_qa_20261006_a1`, `IWANA_DB_INTEGRATION_AVAILABLE=true` y el slug sintético obtenido del seed. Las contraseñas y valores de seed no se imprimieron ni registraron.

## Dictamen

La proyección omitida queda corregida y cubierta con Postgres real. Los cuatro rechazos de negocio completan el recorrido MOD11 → outbox → worker → Redis → API/MOD12 → recibo → respuesta → proyección MOD11 en un intento. El caso nuevo de `SUBSCRIBER_REQUIRED` pasa.

El cierre global queda **NO GO / BLOQUEADO**: la causa histórica del job pendiente permanece sin demostrar, porque el acceso a `errorType` y a los logs correlacionados fue bloqueado por auto-review. El tramo comprobado llega desde el outbox publicado hasta el consumer de MOD12 y se detiene antes del recibo. No atribuyo el fallo histórico a una causa no observada. La DLQ y los logs antiguos no se volvieron a leer.

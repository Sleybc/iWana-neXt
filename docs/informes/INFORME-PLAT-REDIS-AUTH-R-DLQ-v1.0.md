# Informe R-DLQ — Retención y saneamiento de la DLQ genérica

**Versión:** 1.0
**Estado:** En revisión por `sec-eng`
**Fecha:** 2026-10-09
**Agente:** `sr-backend`
**Commit:** no realizado

## Alcance

Cierre técnico de la deuda §8.5 señalada en [la reauditoría S3](INFORME-PLAT-REDIS-AUTH-ADR074-S3-SEC-ENG-v1.0.md), conforme a la adenda R-DLQ del [encargo G7](../prompts/PROMPT-PLAT-REDIS-AUTH-DEUDA-G7-v1.0.md).

## Cambios

- La DLQ genérica elimina jobs completados y retiene los fallidos hasta 30 días (`removeOnFail: { age: 30 días }`).
- La rama de inventario también expresa la retención como `age`. El valor numérico anterior de `removeOnFail` era un límite de cantidad en BullMQ, no una duración.
- El worker registra una limpieza repetible cada hora y elimina jobs fallidos con más de 30 días de antigüedad.
- En el arranque, `manualRegistration` mantiene los workers detenidos hasta que el processor recorre las claves Redis propias de la cola. Reescribe `data` y actualiza `opts` (preservando intentos y backoff) en un solo `HSET`: los jobs heredados pendientes reciben `removeOnComplete: true` y fallo con edad de 30 días. Un marcador por job permite reanudar el borrado terminal si el proceso se interrumpe después del saneamiento; la marca global v2 también reconoce entradas ya saneadas por la primera versión y corrige su retención. El barrido falla cerrado si no puede limpiar un terminal. No registra ni devuelve el payload.
- Se retiró del processor el parser de compatibilidad con `envelope` y `errorMessage`. Los jobs heredados que aún estén pendientes quedan saneados durante el barrido de arranque antes de procesarse.
- Si falla la persistencia SQL de un diagnóstico genérico, el processor relanza un error fijo, sin texto crudo. BullMQ lo registra como fallo y aplica la retención de 30 días; no se marca como completado y se borra inmediatamente.
- Se añadieron pruebas para la retención genérica, el saneamiento de jobs pendientes, la purga única de jobs terminales y la limpieza horaria.
- Se añadieron pruebas de actualización de opciones heredadas y recuperación de una interrupción entre saneamiento y borrado terminal.
- Se probó que BullMQ no registra los workers antes del barrido y que un fallo Redis detiene el arranque sin imprimir el error crudo ni la clave.

## Verificación

| Gate                   | Resultado                                                     |
| ---------------------- | ------------------------------------------------------------- |
| Jest del worker        | 18 suites; 154 pruebas pasaron, `Cached: 0` (`--no-cache`)    |
| Build del worker       | `pnpm --filter @iwana/worker build`: correcto                 |
| Typecheck del worker   | `pnpm --filter @iwana/worker typecheck`: correcto             |
| Formato                | Prettier aplicado a los cinco archivos TypeScript modificados |
| Higiene del diff R-DLQ | `git diff --check` sobre los archivos del bloque: correcto    |

## Operación pendiente

La pasada inicial se ejecutó sobre la cola genérica de `iwana_redis_dev`, sin imprimir claves ni `data`: `removed=0`, `legacy_envelope_jobs=0`. Tras incorporar la recuperación v2, repetí la pasada sobre esa misma cola: `marker=present`, `removed=0`, `legacy_envelope_jobs=0` y `stale_generic_retention_jobs=0`. No se imprimieron claves ni contenido de jobs. El marcador global se escribe solo después de completar el barrido.

No se accedió a Redis de producción. En cada namespace donde no exista el marcador v2, el primer arranque del worker actualizado ejecutará su barrido antes de registrar workers. La reinspección S3 solicitada para §8.5 se documenta en la respuesta de cierre y queda sujeta al SHA validado por CI.

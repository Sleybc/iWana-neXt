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
- En el arranque, `manualRegistration` mantiene los workers detenidos hasta que el processor recorre las claves Redis propias de la cola. Reescribe el `data` de cada job heredado a un diagnóstico permitido; elimina los jobs heredados completados o fallidos con la operación de borrado de BullMQ. Si el barrido falla, el arranque falla cerrado. No registra ni devuelve el payload. Un marcador versionado vuelve la purga idempotente y evita repetirla tras completarse.
- Se retiró del processor el parser de compatibilidad con `envelope` y `errorMessage`. Los jobs heredados que aún estén pendientes quedan saneados durante el barrido de arranque antes de procesarse.
- Se añadieron pruebas para la retención genérica, el saneamiento de jobs pendientes, la purga única de jobs terminales y la limpieza horaria.
- Se probó que BullMQ no registra los workers antes del barrido y que un fallo Redis detiene el arranque sin imprimir el error crudo ni la clave.

## Verificación

| Gate                   | Resultado                                                     |
| ---------------------- | ------------------------------------------------------------- |
| Jest del worker        | 18 suites; 152 pruebas pasaron, `Cached: 0` (`--no-cache`)    |
| Build del worker       | `pnpm --filter @iwana/worker build`: correcto                 |
| Typecheck del worker   | `pnpm --filter @iwana/worker typecheck`: correcto             |
| Formato                | Prettier aplicado a los cinco archivos TypeScript modificados |
| Higiene del diff R-DLQ | `git diff --check` sobre los archivos del bloque: correcto    |

## Operación pendiente

La pasada idempotente se ejecutó sobre la cola genérica de `iwana_redis_dev`, sin imprimir claves ni `data`: `removed=0`. La verificación posterior informó `marker=present` y `legacy_envelope_jobs=0`. El marcador se escribe solo después de completar el barrido.

No se accedió a Redis de producción. En cada namespace de Redis donde aún no exista el marcador, el primer arranque del worker actualizado ejecutará su propio barrido antes de registrar workers. La reinspección S3 solicitada para §8.5 queda pendiente.

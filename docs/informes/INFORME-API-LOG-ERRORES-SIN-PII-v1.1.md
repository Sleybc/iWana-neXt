# INFORME — API y worker · guardia de logs sin PII · v1.1

- **Estado:** completado; revisión sec-eng GO en el informe complementario.
- **Fecha:** 2026-10-17.
- **Agente:** `sr-backend`.
- **Encargo:** [PROMPT-API-LOG-ERRORES-SIN-PII-v1.1](../prompts/PROMPT-API-LOG-ERRORES-SIN-PII-v1.1.md).
- **Revisión:** [INFORME-API-LOG-ERRORES-SIN-PII-SEC-v1.1](INFORME-API-LOG-ERRORES-SIN-PII-SEC-v1.1.md).

## Resultado

La guardia dejó de inferir errores por nombres convencionales. Ahora sigue símbolos de bindings de `catch`, `Promise.catch`, eventos BullMQ `failed`/`error` y `@OnWorkerEvent`, además de aliases, asignaciones y destructuraciones. El análisis usa un `Program` y `TypeChecker` del compilador de TypeScript, creado desde los tsconfig de typecheck de API y worker: así la guardia verifica tipos reales del repositorio sin depender de `parserServices` de ESLint dentro de Jest. También rechaza expresiones asignables a `Error` y las expresiones que conservan referencias a bindings de error.

Se conserva una lista cerrada de funciones de resumen/código revisadas: `summarizeErrorForLog`, `safeErrorType`, `safeInventoryDlqErrorType`, `safeExecutionErrorType`, `safeInventoryErrorType`, `relayErrorType`, `cleanupErrorType` y `pipelineErrorCode`. El helper nuevo del DLQ de inventario solo emite un nombre en allowlist o el código fijo `INVENTORY_DLQ_FAILURE`.

Los cambios de implementación están en [log-error-safety.architecture.spec.ts](../../apps/api/src/common/log-error-safety.architecture.spec.ts), [execution-order-dlq.processor.ts](../../apps/worker/src/processors/execution-order-dlq.processor.ts) y el fixture de integración descrito en el informe B0. No se modificaron contratos ni archivos de `apps/api/src/modules/crm/**`. No se creó commit.

## Regresiones sintéticas

Antes de reemplazar la guardia, las regresiones se ejecutaron contra la implementación anterior: **7 fallaron y 11 pasaron de 18 pruebas**. La guardia vieja dejaba pasar los nombres `driverError` y `x`, alias, desestructuraciones, el binding de `.catch` y un `Error` detectado por tipo. Ya detectaba algunos usos convencionales, `failure` y `JSON.stringify(err)`.

Con la guardia nueva, la suite enfocada pasó **24/24 pruebas**: 16 fixtures inseguros rechazados (incluidos los casos de BullMQ por callback y decorator) y 6 fixtures seguros aceptados, más el barrido de código productivo y el gate de sanitización de `WorkerHost`. El barrido completo de `apps/api/src/**` y `apps/worker/src/**`, excluyendo specs/tests, no reportó violaciones.

La guardia señaló el log de [expediente.service.ts:3118](../../apps/api/src/modules/crm/expedientes/expediente.service.ts:3118). Se lista por la restricción explícita del encargo y quedó intacto: `errorCode` proviene de `pipelineErrorCode` (línea 3152), que solo devuelve un código con formato restringido o `CONVERSION_FAILED`. La llamada está cubierta por la excepción cerrada revisada; no imprime el objeto ni su mensaje.

## Verificación

Todas las suites se ejecutaron sin caché con Jest directo bajo Node 24.18.0. `pnpm` intentó obtener Node 24.13.1, fijado por el workspace, y no pudo resolver `nodejs.org` (`ENOTFOUND`). No se cambió la configuración.

| Paquete / control | Evidencia final |
| --- | --- |
| Regresión enfocada | **1 suite, 24 pruebas aprobadas, 0 fallos.** |
| `@iwana/api` | **388 suites aprobadas; 4 omitidas; 5.270 pruebas aprobadas; 15 omitidas; 0 fallos.** |
| `@iwana/worker` | **21 suites y 171 pruebas aprobadas; 0 fallos.** |
| `@iwana/db` unitarias | **73 suites y 414 pruebas aprobadas; 0 fallos.** |
| `@iwana/db` integración B0 | **35 suites y 123 pruebas aprobadas; 0 fallos**, incluidos los 8 casos reales de 153–156. Detalle en [INFORME-MOD05-DEUDA-B0-v1.1](INFORME-MOD05-DEUDA-B0-v1.1.md). |
| Typecheck | `tsc --noEmit` para API, worker y database: exit 0. |
| ESLint y Prettier | Archivos TypeScript modificados: exit 0; Prettier `--check`: exit 0. |
| Turbo solicitado | `pnpm exec turbo run test --force --continue` se bloqueó al descargar Node 24.13.1 por `ENOTFOUND`. No se alteró `pnpm-workspace.yaml`. |
| API `/health` | Nest arrancó correctamente; `http://127.0.0.1:3000/api/v1/health` respondió `status=ok`, `db=ok`, `redis=ok`. El proceso se detuvo después; puerto 3000 quedó libre. |

## Ruta e higiene

La ruta de este informe se comprobó libre antes de crear el archivo. No se usaron datos personales ni claves reales. Se preservaron los demás cambios locales preexistentes.

# INFORME — Re-revisión sec-eng · guardia de logs sin PII · v1.1

- **Estado:** **GO** para el P2 de cobertura de la guardia.
- **Fecha:** 2026-10-17.
- **Modo:** `sec-eng`, solo lectura.
- **Encargo:** [PROMPT-API-LOG-ERRORES-SIN-PII-v1.1](../prompts/PROMPT-API-LOG-ERRORES-SIN-PII-v1.1.md).
- **Implementación revisada:** [INFORME-API-LOG-ERRORES-SIN-PII-v1.1](INFORME-API-LOG-ERRORES-SIN-PII-v1.1.md).

## Veredicto

**GO:** las regresiones sintéticas solicitadas son rechazadas por la guardia nueva y el barrido de fuentes productivas de API/worker pasa. El defecto P2 anterior —que dependía de nombres como `err` o `failure`— queda cubierto por símbolos de bindings y análisis de tipo. No encontré un camino de evasión en los casos pedidos: nombre arbitrario, alias, destructuración, propiedades del error, `Promise.catch`, eventos BullMQ `failed`/`error` ni `@OnWorkerEvent`.

## Evidencia por ubicación

| Control | Ubicación | Evaluación |
| --- | --- | --- |
| Excepciones seguras cerradas | [log-error-safety.architecture.spec.ts:5](../../apps/api/src/common/log-error-safety.architecture.spec.ts:5) | Los nombres permitidos se limitan a resumidores/códigos revisados. No se acepta una variable por llamarse `error`. |
| Asignabilidad a `Error` | [log-error-safety.architecture.spec.ts:57](../../apps/api/src/common/log-error-safety.architecture.spec.ts:57) | Usa el `TypeChecker`; `any`/`unknown` se resuelven por el origen binding para evitar rechazar indiscriminadamente valores desconocidos no relacionados. |
| Referencias derivadas | [log-error-safety.architecture.spec.ts:93](../../apps/api/src/common/log-error-safety.architecture.spec.ts:93) | Sigue referencias a símbolos de error a través de expresiones, incluyendo propiedades, interpolaciones, serialización y aliases. |
| Seed y aliases | [log-error-safety.architecture.spec.ts:142](../../apps/api/src/common/log-error-safety.architecture.spec.ts:142) | Marca catch/destructuraciones, parámetros de `.catch`, eventos `failed`/`error` y propaga aliases/asignaciones hasta estabilizar. |
| Decorator BullMQ | [log-error-safety.architecture.spec.ts:163](../../apps/api/src/common/log-error-safety.architecture.spec.ts:163) | Reconoce `@OnWorkerEvent('failed')` y `@OnWorkerEvent('error')` y toma el parámetro de error correspondiente. |
| Regresiones | [log-error-safety.architecture.spec.ts:307](../../apps/api/src/common/log-error-safety.architecture.spec.ts:307) y [línea 356](../../apps/api/src/common/log-error-safety.architecture.spec.ts:356) | 16 casos crudos deben rechazarse y 6 casos acotados deben aceptarse. La suite enfocada pasó 24/24. |
| Alcance productivo | [log-error-safety.architecture.spec.ts:384](../../apps/api/src/common/log-error-safety.architecture.spec.ts:384) | Analiza API y worker desde sus tsconfig y excluye specs/tests. Barrido sin violaciones. |
| Nombre de error DLQ acotado | [execution-order-dlq.processor.ts:88](../../apps/worker/src/processors/execution-order-dlq.processor.ts:88) | Devuelve solo nombre de tipo en allowlist o `INVENTORY_DLQ_FAILURE`; el punto de log usa ese resultado en línea 549. |

Las regresiones incluyen `catch (driverError)`, `catch (x)` con `String(x)`, alias interpolado, `{ message }`, `{ detail }`, `e.message`, `e.detail`, `e.driverError`, rechazo de `.catch((boom) => ...)`, manejadores BullMQ por callback y decorator, `JSON.stringify(err)` y `new Error(...)`. Los fixtures seguros cubren `summarizeErrorForLog`, `pipelineErrorCode`, cadenas fijas, ids y códigos de dominio.

## Caso señalado en CRM

La guardia detecta [expediente.service.ts:3118](../../apps/api/src/modules/crm/expedientes/expediente.service.ts:3118), dentro de la ruta protegida por el encargo. Revisé su origen: `pipelineErrorCode` en línea 3152 devuelve solo códigos restringidos (`^[A-Z][A-Z0-9_]{2,63}$`) o `CONVERSION_FAILED`. Por tanto el valor registrado es un código de dominio acotado, no el error ni sus propiedades. El archivo CRM no se editó.

## Alcance

La revisión fue de solo lectura sobre la guardia, los fixtures sintéticos, el helper DLQ y el caso CRM señalado. La ejecución completa de suites y el arranque de API se toman de la evidencia reproducible de sr-backend; la re-revisión no los repitió. No se modificó código ni se creó commit. La limitación ambiental de Turbo por la descarga de Node 24.13.1 consta en el informe de implementación y no cambia este veredicto del P2.

La ruta de este informe se comprobó libre antes de crearlo.

# INFORME — Revisión de seguridad · logs de errores sin PII

- **Estado:** NO-GO por cobertura insuficiente de la guardia; no se observó una ruta actual que imprima datos crudos del error en los logs revisados.
- **Fecha:** 2026-10-17.
- **Modo:** sec-eng, solo lectura.
- **Encargo:** [PROMPT-API-LOG-ERRORES-SIN-PII-v1.0](../prompts/PROMPT-API-LOG-ERRORES-SIN-PII-v1.0.md).
- **Implementación revisada:** [INFORME-API-LOG-ERRORES-SIN-PII-v1.0](INFORME-API-LOG-ERRORES-SIN-PII-v1.0.md).

## Veredicto

**NO-GO para cerrar el gate solicitado.** En el código actual revisado, el filtro, `SafeTypeOrmLogger`, los logs de API/worker y la sanitización de `failedReason` usan campos acotados; no encontré un camino que emita `parameters`, `detail`, `query` o el mensaje crudo del driver. La respuesta 500 documentada conserva el cuerpo estándar y el filtro delega las `HttpException` a `super.catch()`.

El NO-GO se debe al hallazgo P2 de abajo: la guardia de arquitectura puede dejar pasar objetos de error crudos con nombres de variable distintos de su lista. La condición preventiva pedida no queda garantizada aunque los caminos revisados estén saneados hoy.

## Hallazgos

### P2 — La guardia solo detecta nombres convencionales de variables de error

- **Ubicación:** [log-error-safety.architecture.spec.ts](../../apps/api/src/common/log-error-safety.architecture.spec.ts:5), líneas 5 y 26–29.
- `ERROR_VARIABLE_PATTERN` solo clasifica `e`, `err`, `error`, `exception`, `cause`, `reason` y `failure` como errores. Por ello, por ejemplo, `catch (driverError) { logger.error(driverError); }` no se identifica como error crudo y la expectativa de la línea 125 puede seguir pasando. La misma limitación afecta `String(driverError)` y sus propiedades `detail`, `message` o `query`.
- **Impacto:** una futura regresión puede registrar el objeto del driver o su mensaje sin que esta guardia falle. Esto incumple el propósito de la protección hacia adelante solicitado.
- **Acción para obtener GO:** hacer que la regla identifique el binding del `catch` y los aliases/propiedades derivados, o añadir una regla de lint/guardia con análisis de tipo, y probarla con regresiones sintéticas que usen nombres no convencionales. Mantener fuera de las pruebas cualquier dato real.

No registro hallazgos adicionales de severidad P1/P0. No edité código ni cambié el comportamiento durante esta revisión.

## Comprobaciones del encargo

| Control | Resultado |
| --- | --- |
| Logs de error actuales en API y worker | **Pasa en la revisión:** los sitios inspeccionados usan `summarizeErrorForLog`, códigos de error permitidos o contexto fijo; no vi que emitan `parameters`, `detail`, `query` ni mensajes del driver. |
| `SafeTypeOrmLogger` | **Pasa:** registra operación, SQLSTATE o estado de migración; descarta consulta, parámetros y mensaje recibido. |
| `failedReason` de BullMQ | **Pasa en el diseño revisado:** los `WorkerHost.process` están decorados con `SanitizeFailedReason`, que reemplaza el mensaje lanzado por un resumen antes de propagarlo. |
| Respuesta 500 | **Pasa:** el filtro escribe `{ "statusCode": 500, "message": "Internal server error" }`; el informe del implementador registra la prueba con ese cuerpo exacto. |
| `HttpException` | **Pasa:** las excepciones no tenant que extienden `HttpException` se envían a `super.catch(exception, host)`. |
| Aviso por tenant ausente | **Pasa:** registra la ruta sin query string y reemplaza CR/LF. |
| Reproducción centinela rojo/verde | **Pasa según la evidencia consignada por sr-backend:** rojo antes del cambio y verde después con centinelas sintéticos. |
| Suites completas y arranque API | **Pasa según la evidencia consignada por sr-backend.** El comando Turbo literal no arrancó por `ENOTFOUND` al descargar Node 24.13.1; las tres suites se ejecutaron directamente sin caché. |

## Revisión de casos dudosos del barrido

Los siguientes usos no son logs de errores crudos según el flujo inspeccionado; quedan identificados para seguimiento si cambia su origen:

| Ubicación | Evaluación sec-eng |
| --- | --- |
| `apps/worker/src/processors/evidence-orphan-detection.processor.ts:381` | `err.message`/`String(err)` se usa para clasificar compatibilidad de tabla ausente, no se registra. Sigue dependiendo de texto del driver para control de flujo. |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts:2430` | Lee el mensaje para traducir un conflicto de claim o relanzar; no lo registra. Sigue dependiendo de texto de error para control de flujo. |
| `apps/api/src/cli/backfill-party-pii.ts:306` | Comparación contra el literal fijo `unsupported-contact-type`; no se registra el mensaje. |
| `apps/api/src/modules/users/users.service.ts:1901` | Devuelve mensajes de excepciones de negocio permitidas en el resultado de una fila. No es log; los errores inesperados se resumen y devuelven un texto genérico. |
| `apps/api/src/modules/inventory/services/counter-purchase.service.ts:372`, `purchasing.service.ts:384,613` | Los mensajes de `QuoteTaxCalcError` se convierten en errores 400 de validación controlada; no son logs del driver. |
| `apps/api/src/cli/anonymize-titular.ts:1264` | Emite a stderr mensajes de `AnonymizeTitularCliError`, cuyo origen revisado usa textos explícitos; los demás errores producen un texto fijo. No es un log de aplicación. |

## Alcance y límites

Se revisaron el resumen seguro y su uso por `SafeTypeOrmLogger`, el filtro global, ambos decoradores de BullMQ, la guardia AST y la búsqueda de logs `error`/`warn` en `apps/api/src` y `apps/worker/src`. La reproducción de Jest, las suites y el arranque se toman del informe de sr-backend; no se repitieron en esta revisión de solo lectura. No se hizo commit.

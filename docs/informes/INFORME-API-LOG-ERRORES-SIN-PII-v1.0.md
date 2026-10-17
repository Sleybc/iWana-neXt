# INFORME-API-LOG-ERRORES-SIN-PII-v1.0

- **Estado:** Implementado; suites ejecutadas; pendiente revisión sec-eng.
- **Fecha:** 2026-10-17.
- **Origen:** [PROMPT-API-LOG-ERRORES-SIN-PII-v1.0](../prompts/PROMPT-API-LOG-ERRORES-SIN-PII-v1.0.md).

## Resultado

Se centralizó el resumen seguro de errores y se reemplazaron los logs que incluían el objeto, el mensaje del driver, SQL, `detail`, parámetros o `failedReason`. Las respuestas HTTP conservan sus contratos: el error no HTTP mantiene `500` con `{"statusCode":500,"message":"Internal server error"}`; las `HttpException` siguen por `super.catch()`; la falta de contexto tenant mantiene su `400` y ahora registra la ruta sin query string.

## Diseño implementado

`summarizeErrorForLog` vive en `packages/database/src/summarize-error-for-log.ts`, dentro de `@iwana/db`, porque es infraestructura compartida por API y worker y trata errores de TypeORM/PostgreSQL. Evita que cada aplicación replique la extracción del SQLSTATE. Lee únicamente clase, SQLSTATE, un código de dominio validado y nombres validados de constraint/tabla. No lee el mensaje, SQL, `detail`, `where`, `parameters` ni stack del error recibido. `SafeTypeOrmLogger` reutiliza el extractor de SQLSTATE.

El filtro global registra una sola línea `UNHANDLED_ERROR` para errores no HTTP con método, ruta saneada, resumen y stack generado localmente solo en desarrollo. En producción omite ese stack. Las `HttpException` se delegan intactas a `BaseExceptionFilter`.

La guardia AST `apps/api/src/common/log-error-safety.architecture.spec.ts` rechaza objetos de error, mensajes, `String(err)`, SQL, detalles y parámetros crudos en `logger.error/warn` y `console.error/warn`. También verifica que todo `WorkerHost.process` de API y worker aplique `SanitizeFailedReason`; el decorador reemplaza el mensaje antes de que BullMQ lo persista y preserva prototipo y nombre de error seguros para mantener semántica de reintento.

## Reproducción roja y corrección verde

Se conectó el test al filtro global real de Nest y a un controlador que lanza `QueryFailedError` con valores centinela sintéticos en `detail`, `parameters` y mensaje. Antes del cambio, el test falló en la aserción de no exposición: el log contenía el `QueryFailedError` y el centinela. Las aserciones anteriores ya confirmaban el mismo cuerpo 500 estándar.

Después del cambio, el test pasa: la línea contiene clase, SQLSTATE y nombres de constraint/tabla; no contiene los centinelas; el cuerpo 500 permanece idéntico. Los tests del filtro también confirman que la advertencia tenant omite query string y que las `HttpException` conservan su respuesta de `super.catch()`.

## Barrido realizado

Se migraron los siete sitios con `String(err)` en logs:

| Archivo | Sitios |
| --- | ---: |
| `apps/api/src/modules/media/evidence-asset.provider.ts` | 3 |
| `apps/api/src/modules/media/media.service.ts` | 1 |
| `apps/api/src/modules/users/users.service.ts` | 1 |
| `apps/worker/src/processors/evidence-orphan-detection.processor.ts` | 2 |

También se corrigieron logs de auditoría, permisos efectivos, dashboard WFM/tenant, completitud y persistencia de expedientes, adaptador de supresión, órdenes de ejecución, aprovisionamiento de tenant y arranque del worker. Se eliminaron argumentos de stack provenientes de excepciones en esos caminos. La API ya no devuelve el texto de Redis `failedReason` en el campo de estado de importación: conserva el campo y su tipo, pero usa un mensaje genérico.

La búsqueda y la guardia cubrieron `logger.error/warn`, `console.error/warn`, mensajes, propiedades de error y referencias a `detail`, `query`, `parameters` y `failedReason`. No quedaron caminos de log en API/worker que emitan esos valores. Los logs de cola usan tipos acotados o el resumen seguro.

### Casos dudosos que permanecen fuera de logs de error crudo

| Archivo | Uso | Evaluación |
| --- | --- | --- |
| `apps/worker/src/processors/evidence-orphan-detection.processor.ts:381` | Lee `err.message`/`String(err)` para reconocer una tabla ausente y ejecutar una limpieza de compatibilidad; no lo registra. | Dudoso de control de flujo: depende del texto del driver, no es exposición en log. |
| `apps/api/src/modules/tasks/services/execution-orders.service.ts:2430` | Lee mensaje para traducir un fallo de claim a `ConflictException`; si no coincide, relanza el error; no lo registra. | Dudoso de control de flujo; sin escritura de log. |
| `apps/api/src/cli/backfill-party-pii.ts:306` | Compara con el código fijo `unsupported-contact-type` para escoger una rama; no lo registra. | Dudoso de clasificación; sin mensaje en log. |
| `apps/api/src/modules/users/users.service.ts:1901` | Conserva mensajes de excepciones de negocio permitidas para la fila de importación; los errores inesperados se registran resumidos y devuelven texto genérico. | Salida de resultado, no log de error crudo. |
| `apps/api/src/modules/inventory/services/counter-purchase.service.ts:372`, `purchasing.service.ts:384,613` | `QuoteTaxCalcError.message` alimenta una `BadRequestException` con validaciones controladas; no se registra. | Mensaje de negocio, no mensaje del driver. |
| `apps/api/src/cli/anonymize-titular.ts:1264` | Escribe a stderr solo el mensaje de `AnonymizeTitularCliError`, cuyas instancias usan textos explícitos del CLI; otros errores reciben un texto genérico. | Salida de CLI, no detalle del driver; revisar si se amplía el origen de esa clase. |

## Evidencia de validación

Las corridas de Jest se hicieron directamente desde cada paquete con `--runInBand --no-cache`; no hubo cache de Turbo.

| Paquete | Comando efectivo | Suites | Tests | Skipped |
| --- | --- | ---: | ---: | ---: |
| `@iwana/api` | `jest --runInBand --no-cache` | 388 pasaron, 4 omitidas | 5.248 pasaron, 15 omitidos | 4 suites / 15 tests |
| `@iwana/worker` | `jest --runInBand --no-cache --silent` | 21 pasaron | 171 pasaron | 0 |
| `@iwana/db` | `jest --runInBand --no-cache` | 73 pasaron | 414 pasaron | 0 |

Los typechecks de API, worker y database terminaron con código 0. ESLint de los tres paquetes terminó con 0 errores; API mostró 7 advertencias y database 5, en archivos no modificados para este encargo. Worker terminó sin advertencias después de marcar explícitamente `void bootstrap()`.

Se intentó literalmente `pnpm exec turbo run test --force --continue`. No pudo arrancar porque `pnpm-workspace.yaml` fija Node `24.13.1`; el gestor intentó descargar esa versión desde nodejs.org y recibió `ENOTFOUND` por la red restringida. Las suites completas pedidas sí se ejecutaron sin caché con los binarios Jest locales y terminaron con 0 fallos.

La API compiló y arrancó con `nest start --watch`: compilación con 0 errores y `GET /api/v1/health` respondió `HTTP 200`, `status=ok`, `db=ok`, `redis=ok`. La ruta real incluye el prefijo global `/api/v1`. El proceso se detuvo tras la comprobación y el puerto 3000 quedó libre.

## Pendiente

Falta el veredicto sec-eng del diff y de esta evidencia. No se hizo commit.

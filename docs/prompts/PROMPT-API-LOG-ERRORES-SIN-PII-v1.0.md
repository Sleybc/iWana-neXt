# PROMPT — API y worker · Registro de errores sin PII ni HMAC

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend`, con revisión de `sec-eng` · **Base:** `main` en `5f2146b9`
**Origen:** deuda P2 escalada por [FIX-PREVIEW](../informes/INFORME-PRIVACY-FASE-1B-FIX-PREVIEW-v1.0.md) y registrada en el [cierre de la Fase 1b](../informes/INFORME-PRIVACY-FASE-1B-CIERRE-G6-v1.0.md) §4 y en el [HLD de privacidad v1.1](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.1.md) §10.
**Norma:** HLD de privacidad §7 («auditoría y logs sin PII»); D11 de `SafeTypeOrmLogger` («nunca una porción arbitraria de la consulta»).

## Hechos verificados por AI-EM-ARCH

| # | Hecho | Fuente |
| --- | --- | --- |
| H1 | El log de TypeORM **ya está protegido**: `SafeTypeOrmLogger` registra solo la operación y el SQLSTATE, sin la consulta ni los parámetros | `packages/database/src/safe-typeorm.logger.ts:45-60`; `data-source.ts:163`; `worker.module.ts:181` |
| H2 | El único filtro global de la API es `TenantContextMissingFilter`, con `@Catch()` sin argumentos. Toda excepción que no sea de contexto de tenant va a `super.catch()` (`BaseExceptionFilter` de `@nestjs/core` ^11.1) | `apps/api/src/common/filters/tenant-context-missing.filter.ts:31-38`; `app.module.ts:260` |
| H3 | Para un error que no es `HttpException`, `BaseExceptionFilter` lo registra con el logger `ExceptionsHandler`. En el CI se ve: «ERROR [ExceptionsHandler] TypeError: …». Un `QueryFailedError` trae como propiedades propias `query`, `parameters` y `driverError`, y este último tiene `detail` con valores (por ejemplo, `Key (email_hmac)=(…) already exists` en `23505`) | Log del CI `38944406821`; informe FIX-PREVIEW |
| H4 | Siete sitios registran `String(err)`, que imprime el mensaje del driver. Ese mensaje a veces incluye el valor rechazado (por ejemplo, `invalid input value for enum …: "TASKS"` o `invalid input syntax for type uuid: "…"`) | `media/evidence-asset.provider.ts:164, 186, 306`; `media/media.service.ts:275`; `users/users.service.ts:1800`; `worker/…/evidence-orphan-detection.processor.ts:290, 397` |
| H5 | El filtro registra `originalUrl` completo, con query string, en el aviso de tenant ausente | `tenant-context-missing.filter.ts:49-51` |

## Encargo

1. **Reproducir primero (rojo antes de corregir).**
   - Un test que monte una app Nest con el filtro global real y un controlador de prueba que lance un `QueryFailedError` **real**: obtenido de PostgreSQL desechable, o construido con un `driverError` cuyo `detail` y `parameters` contengan un valor centinela sintético (por ejemplo `CENTINELA-PII-0001`).
   - Capturar la salida del logger (spy sobre `ConsoleLogger` o un logger de prueba) y demostrar que **hoy** el centinela aparece.
2. **Utilidad compartida** `summarizeErrorForLog(err)` en `packages/database` (junto a `SafeTypeOrmLogger`, reutilizando su lógica de SQLSTATE) o en `apps/api/src/common`; elegir uno y justificarlo.
   - **Devuelve:** la clase del error, el SQLSTATE si lo hay, y el nombre de la restricción o de la tabla si el driver lo da.
   - **Nunca devuelve:** el mensaje del driver, `detail`, `query`, `parameters`, `where` ni el stack de terceros.
   - **Para errores no SQL:** la clase y, si existe, un `code` de dominio con formato `^[A-Z][A-Z0-9_]{2,63}$`.
3. **Filtro global.** En el camino de las excepciones no reconocidas, para lo que **no** es `HttpException`:
   - responder lo mismo que hoy (500, `{"statusCode":500,"message":"Internal server error"}`);
   - registrar una sola línea `UNHANDLED_ERROR method=<m> path=<ruta sin query string> class=<…> sqlstate=<…> constraint=<…>`;
   - el stack propio de la aplicación solo si `NODE_ENV !== 'production'`, y **sin** las propiedades del error.

   Las `HttpException` siguen yendo a `super.catch()` sin cambios: la forma de los errores 4xx no cambia. El aviso de tenant ausente registra la ruta sin query string (H5).
4. **Los siete sitios de H4** pasan a usar `summarizeErrorForLog`, conservando el contexto que ya registran (ids opacos).
5. **Barrido.** Buscar en `apps/api/src` y `apps/worker/src` cualquier otro registro de error que imprima el mensaje del driver, el objeto de error o `error.detail` (incluidos `logger.error(msg, err)`, `JSON.stringify(err)` y los `failedReason` que el worker deja en Redis), y listarlos en el informe. Corregir los de la API y del worker que sean del mismo tipo; los dudosos se reportan.
6. **Guardia hacia adelante.** Un test de arquitectura o una regla de ESLint que falle si se vuelve a usar `String(err)` o un objeto de error crudo en `logger.error` o `logger.warn` dentro de `apps/api/src` y `apps/worker/src` (excepciones justificadas en una lista cerrada).

## Evidencia obligatoria

- El test del paso 1 en **rojo antes** (el centinela aparece) y en **verde después** (no aparece en ninguna línea del log), y la respuesta HTTP 500 idéntica a la de hoy.
- Las suites completas de `@iwana/api`, `@iwana/worker` y `@iwana/db` sin caché, con 0 fallos.
- `pnpm exec turbo run test --force --continue` con los totales por paquete.
- La API arrancada hasta `/health`.

## Revisión de `sec-eng` (al terminar `sr-backend`)

GO/NO-GO sobre el diff:
- que ningún camino de log imprima `parameters`, `detail`, `query` ni mensajes del driver;
- que la respuesta 500 no cambie;
- que las `HttpException` sigan intactas;
- y la lista del barrido del paso 5.

Informe: `docs/informes/INFORME-API-LOG-ERRORES-SIN-PII-SEC-v1.0.md`.

## Reglas

- Solo el filtro global, la utilidad compartida, los sitios de H4 y los del barrido, y sus tests. No modificar contratos de respuesta.
- Ninguna PII, HMAC ni clave real: solo valores centinela sintéticos. No commitear.
- Informe de `sr-backend`: `docs/informes/INFORME-API-LOG-ERRORES-SIN-PII-v1.0.md`, con la ruta verificada como libre.

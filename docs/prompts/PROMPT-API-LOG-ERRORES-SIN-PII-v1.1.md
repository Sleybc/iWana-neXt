# PROMPT — API y worker · Registro de errores sin PII ni HMAC · v1.1 (guardia)

**Versión:** 1.1 (sigue a [v1.0](PROMPT-API-LOG-ERRORES-SIN-PII-v1.0.md); lo demás queda igual) · **Fecha:** 2026-10-17 · **Estado:** Vigente · **Emisor:** AI-EM-ARCH · **Agente:** `sr-backend`, más la re-revisión de `sec-eng`
**Origen:** [revisión `sec-eng`](../informes/INFORME-API-LOG-ERRORES-SIN-PII-SEC-v1.0.md): NO-GO por un P2. Los caminos de log actuales están saneados; lo que falla es la **guardia hacia adelante**.

## Hallazgo

`apps/api/src/common/log-error-safety.architecture.spec.ts` decide qué es un error por el **nombre** de la variable (`ERROR_VARIABLE_PATTERN`: `e`, `err`, `error`, `exception`, `cause`, `reason`, `failure`). Un `catch (driverError) { logger.error(driverError) }` pasa sin detectarse.

## Encargo

1. **Regresiones sintéticas primero (en rojo con la guardia de hoy).** Fixtures de código, no código de producto, que la guardia debe rechazar:
   - `catch (driverError) { logger.error(driverError) }`;
   - `catch (x) { logger.warn(String(x)) }`;
   - alias: `catch (e) { const problem = e; logger.error(\`${problem}\`) }`;
   - desestructurado: `catch ({ message }) { logger.error(message) }` y `const { detail } = e`;
   - propiedad derivada: `logger.error(e.message)`, `e.detail`, `e.driverError`;
   - `promise.catch((boom) => logger.error(boom))`;
   - el manejador `failed` de BullMQ: `(job, failure) => logger.error(failure)`;
   - `JSON.stringify(err)` dentro del mensaje.

   Deben **pasar** (aceptados): `summarizeErrorForLog(x)` y sus campos, cadenas fijas, ids opacos y códigos de dominio.
2. **Guardia por binding y por tipo.**
   - Identificar los bindings de `catch`, los parámetros de `.catch(...)` y de los manejadores `failed`/`error`, y seguir los alias y las desestructuraciones dentro de su ámbito.
   - Además, marcar cualquier argumento de `logger.error`, `logger.warn` y `console.error`/`warn`, o cualquier expresión de una plantilla dentro de ellos, cuyo **tipo** TypeScript sea asignable a `Error` o sea `unknown`/`any` proveniente de un `catch`.
   - El análisis de tipos puede hacerse con el compilador de TypeScript (Program y TypeChecker) en el test de arquitectura, o con una regla de `@typescript-eslint` con `parserServices`. Elegir y justificar.
   - La lista cerrada de excepciones justificadas se mantiene.
3. **Alcance de la guardia:** `apps/api/src/**` y `apps/worker/src/**`, sin specs.

## Evidencia obligatoria

- Las regresiones del paso 1 en **rojo con la guardia actual** y en **verde (rechazadas) con la nueva**; el código actual del repo **pasa** la guardia nueva, o se corrige cada caso que aparezca.
- Las suites completas de `@iwana/api`, `@iwana/worker` y `@iwana/db` sin caché, con 0 fallos.
- `pnpm exec turbo run test --force --continue`. Si `pnpm` no puede descargar Node 24.13.1 (`useNodeVersion` en `pnpm-workspace.yaml:75`) por falta de red, se reporta como **bloqueo de entorno**, sin cambiar la configuración, y se aporta la evidencia por paquete del punto anterior.
- La API arrancada hasta `/health`.

## Re-revisión de `sec-eng`

GO/NO-GO del P2, con las regresiones a la vista. Informe: `docs/informes/INFORME-API-LOG-ERRORES-SIN-PII-SEC-v1.1.md`.

## Reglas

- Solo la guardia, sus fixtures y los casos que la guardia nueva destape. **No tocar `apps/api/src/modules/crm/**`**: la fase de deuda de MOD05 trabaja ahí. Si la guardia destapa un caso en CRM, se lista y no se corrige.
- Ninguna PII ni clave real. No commitear.
- Informe de `sr-backend`: `docs/informes/INFORME-API-LOG-ERRORES-SIN-PII-v1.1.md`, con la ruta verificada como libre.

# Informe B3 — Consumo de contratos de suscriptores

**Fecha:** 2026-10-12  
**Estado:** Implementado y verificado  
**Bloque:** B3 · `fe-platform`  
**Contratos:** C-API-2 v1.1 y C-API-1 v1.0 con la adenda autorizada v1.1  
**Plan:** `docs/plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md`  
**Prompt:** `docs/prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.1.md`

## Entregables

- `apps/portal/src/lib/api-client.ts`
  - `subscribersApi.search` usa `POST /crm/subscribers/search` y envía criterios exactos en el body tipado con `SearchSubscribersInput` de `@iwana/shared`.
  - `subscribersApi.list({ search, ... })` usa el mismo endpoint POST, pone solo `search` en el body y conserva los filtros no personales, orden y paginación en query. Sin `search`, conserva el GET de listado.
  - La búsqueda global reutiliza `subscribersApi.list`, por lo que el texto libre de suscriptores tampoco viaja en la URL; se conservan la normalización del envelope `{ data, total, meta }` y el fallback de resultados vacíos.
  - Las respuestas de listado y búsqueda usan `SubscriberListItem` de `@iwana/shared`.
- `apps/portal/src/components/crm/subscribers/SubscribersListClient.tsx` mantiene sus filas en `SubscriberListItem`.
- `apps/portal/src/components/crm/subscribers/subscriber-ui.ts` tipa las funciones de nombre y documento contra `SubscriberListItem` y conserva sus fallbacks existentes.
- `apps/portal/src/components/operations/TaskCoreFields.tsx` usa `SubscriberListItem` para las opciones del selector y conserva su cadena actual de fallbacks.
- `apps/portal/src/lib/api-client-subscribers.spec.ts` comprueba que criterios exactos y búsqueda libre viajan por POST body, y que búsqueda/identificadores no aparecen en query. También comprueba que filtros no personales y paginación permanecen en query.
- `docs/specs/2026-10-12-mod05-c-api-1-v1.1-addendum.md` documenta la adenda de transporte consumida por B3. No se alteraron los contratos en el prompt.

No se añadió una columna de documento ni copy nuevo. No se definieron tipos paralelos ni se usaron casts para los contratos compartidos.

## Evidencia

- `pnpm --filter portal typecheck`: correcto, código de salida 0.
- Test focalizado `pnpm --filter portal exec jest src/lib/api-client-subscribers.spec.ts --runInBand --no-cache`: **1 suite aprobada, 2 tests aprobados**.
- `pnpm --filter portal test`: **291 suites aprobadas; 2.926 tests aprobados, 1 omitido (2.927 total); 0 snapshots**. Tiempo reportado por Jest: 94.958 s.
- Segunda ejecución completa `pnpm --filter portal test -- --runInBand --no-cache`: **291 suites aprobadas; 2.926 tests aprobados, 1 omitido (2.927 total); 0 snapshots**. Tiempo reportado por Jest: 394.835 s.
- `pnpm exec prettier --check` sobre los archivos B3: correcto. `git diff --check`: código de salida 0; sin errores de whitespace.
- Revisión del camino de suscriptores en `apps/portal/src/lib/api-client.ts`: `subscribersApi.list` no añade `search` a `URLSearchParams`; los cuatro criterios exactos tampoco se serializan como parámetros. La URL de la búsqueda libre se construye con filtros no personales y usa POST con body. `globalSearchApi` delega la búsqueda de suscriptores en `subscribersApi.list`.
- El árbol de portal conserva un test dedicado al transporte POST; la suite completa también ejecuta `SubscribersListClient.spec.tsx` y `subscriber-ui.spec.ts` en verde.

La salida completa de ambas corridas mostró advertencias existentes de Jest/ts-jest, JSDOM y actualizaciones React fuera de `act(...)`; no provocaron fallos.

## Deuda nueva por severidad

- **Media — campos no incluidos en C-API-2 v1.1:** `SubscriberListItem` no incluye `vatTreatment` ni `department`. El listado deja vacía la celda de tratamiento de IVA; la ubicación usa el campo `city` autorizado y mantiene el fallback actual «Sin ubicación» cuando no hay ciudad. Si se requiere volver a mostrar esos valores, hace falta finalidad y contrato ratificados y un cambio de producto fuera de B3.
- **Crítica / Alta / Baja:** ninguna deuda nueva identificada.

El `[BLOQUEO]` de B3-v1.0 queda resuelto por C-API-2 v1.1 y por la adenda autorizada C-API-1 v1.1 para la búsqueda libre.

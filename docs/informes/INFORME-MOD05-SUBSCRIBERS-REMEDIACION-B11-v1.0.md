# Informe B11 — resolución de Parties fusionadas

**Fecha:** 2026-10-12  
**Estado:** cerrado.

## Entregables

- `apps/api/src/modules/parties/adapters/party-write.adapter.ts`: la búsqueda por HMAC considera solo estados distintos de `MERGED` y exige `deletedAt IS NULL`. Los estados candidatos se derivan de `PartyStatus`, excluyendo `MERGED`, para mantener el mismo criterio de `PartyService` sin codificar la lista de estados.
- `apps/api/src/modules/parties/adapters/party-read.adapter.ts`: `findByDocument` busca primero una Party no fusionada ni eliminada; si no encuentra una, busca una Party `MERGED` no eliminada, sigue `mergedIntoPartyId` una sola vez y devuelve `null` si el destino está fusionado, eliminado o no existe.
- `apps/api/src/modules/parties/adapters/party-write.adapter.spec.ts` y `party-read.adapter.spec.ts`: regresiones unitarias para los estados `ACTIVE`, `INACTIVE` y `MERGED`, el filtro de borrado lógico, la resolución de alias y el rechazo de un destino inválido.
- `apps/api/src/modules/crm/subscribers/subscribers.controller.ts`: OpenAPI del POST `/search` ahora describe el elemento de respuesta `SubscriberListItem`, incluidos campos base y opcionales por rol; no cambia el payload.
- `apps/portal/src/components/operations/TaskCoreFields.tsx`: comentario corregido para reflejar los campos que compara la búsqueda libre del API; no cambia el selector ni texto visible.

El test PostgreSQL de conversión pertenece a B12 y no fue editado por B11. B12 añadió en `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` los escenarios MERGED+canónico y Party eliminado.

## Evidencia

- TDD: las pruebas iniciales fallaron porque las búsquedas omitían los estados y el lector no seguía `mergedIntoPartyId`; tras la implementación, las suites focalizadas de ambos adapters pasaron.
- Adapters: `pnpm --filter @iwana/api exec jest src/modules/parties/adapters/party-read.adapter.spec.ts src/modules/parties/adapters/party-write.adapter.spec.ts --runInBand` — **2 suites, 31/31 tests aprobados**.
- Inventory: `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/supplier-profile.http.integration.spec.ts --runInBand` — **1 suite, 7/7 tests aprobados**, incluida la reutilización de tercero.
- B5: `$env:E2E_TENANT_SLUG='iwana'; $env:IWANA_DB_INTEGRATION_AVAILABLE='true'; pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` — la sonda confirmó PostgreSQL en `127.0.0.1:5433/dbiw`; **1 suite, 8/8 tests aprobados**. Incluye MERGED→canónico, Party eliminado, y la guarda `activatedAt`.
- Gate solicitado: `pnpm exec turbo run test --filter=@iwana/api --force` — **exit 0**, 329 suites aprobadas y 4 omitidas (333); 4.242 tests aprobados y 15 omitidos (4.257); Turbo ejecutó las 4 tareas, **0 cacheadas**. La prueba de Inventory también pasó en esta corrida.
- `git diff --check` sobre archivos B11 — limpio (Git emitió únicamente el aviso de normalización CRLF existente en `party-write.adapter.spec.ts`).

## Deuda por severidad

| Severidad | Deuda nueva de B11 |
| --- | --- |
| Crítica | Ninguna. |
| Alta | Ninguna conocida; B7-01 está corregido en ambos adapters y el gate API pasó. |
| Media | Ninguna. B7-03 (placeholder) y B7-04 (auditoría transversal) siguen en sus destinos previos, fuera de B11. |
| Baja | La observación de referencias de versión en la adenda documental C-API-1 queda fuera de la propiedad de B11, según instrucción del orquestador. |

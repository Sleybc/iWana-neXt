# Informe B2 — Remediación de cumplimiento de suscriptores

**Versión:** 1.1  
**Fecha:** 2026-10-12  
**Responsable:** `sr-backend`  
**Estado:** Implementado; gates B2 en verde.  
**Plan:** [2026-10-11-mod05-subscribers-remediacion-cumplimiento.md](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md)  
**Contrato adicional:** [C-API-1 v1.1](../specs/2026-10-12-mod05-c-api-1-v1.1-addendum.md)

## Resultado

B2 implementa C-API-1 v1.0 y la adenda C-API-1 v1.1 autorizada durante Ola 1-bis, sin modificar C-API-2. Los criterios exactos siguen en el body; la adenda añade búsqueda libre por POST y mantiene filtros/paginación no personales en query solo para ese modo. `GET /crm/subscribers/search` responde 404 explícito.

El listado y lookup devuelven `SubscriberListItem` mediante la proyección por rol ratificada en B4 §6. El acceso a listados espera `LIST_ACCESS`; `GET :id` y `/360` esperan `RECORD_ACCESS`. La auditoría de `update` persiste solo nombres de campos cambiados, sin valores personales.

## Entregables

| Ruta | Entrega |
| --- | --- |
| `packages/shared/src/schemas/subscriber.schema.ts` | `SearchSubscribersSchema` y `SearchSubscribersInput` con búsqueda exacta o libre mutuamente excluyentes; `SubscriberListItem` de C-API-2 v1.1. |
| `apps/api/src/modules/crm/subscribers/subscribers.controller.ts` | POST de búsqueda con HTTP 200, retiro del GET con 404, filtros no personales, proyección, auditoría awaited y `RECORD_ACCESS`. |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts` | Escapado literal de `%`, `_` y `\\` en `ILIKE`; diff de auditoría con `changedFields`; descifrado de WhatsApp para proyección autorizada. |
| `apps/api/src/modules/crm/subscribers/subscriber-projection.ts` | Proyección cerrada `SubscriberListItem` y mapa por rol de B4 §6. |
| `packages/shared/src/enums/audit-action.enum.ts` | Acción `RECORD_ACCESS`. |
| `.github/instructions/api.instructions.md` | Referencia a ADR-067 y reglas de minimización/auditoría. |
| `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts` | Pruebas HTTP de 404, 200, rol×campo, 403, query sin PII y `LIST_ACCESS` awaited. |
| `apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts` | Prueba unitaria de mapa de roles y fallo cerrado. |
| `apps/api/src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts` | Prueba HTTP con Postgres real que consulta `audit_logs` tras un PATCH y comprueba ausencia de valores PII. |
| `apps/api/run-jest.cjs`, `apps/api/package.json` | Compatibilidad del flag de ejecución `--force` del gate con Jest: el wrapper lo traduce a `--no-cache`, sin `--forceExit`. |
| `docs/specs/2026-10-12-mod05-c-api-1-v1.1-addendum.md` | Adenda versionada C-API-1 v1.1; C-API-1 v1.0 permanece intacto. |
| `docs/informes/INFORME-MOD05-SUBSCRIBERS-REMEDIACION-B2-v1.1.md` | Evidencia, conteos y deuda por severidad. |

OpenAPI se refleja desde los decoradores `@ApiBody`, `@ApiResponse`, `@ApiQuery` y `@ApiExcludeEndpoint` del controlador; no hay un artefacto OpenAPI estático versionado para esta ruta.

## Evidencia de pruebas

### Gate de API

Comando literal solicitado:

```text
pnpm --filter @iwana/api test -- --force
```

Jest 29 no reconoce `--force`. El script `test` ahora usa el wrapper local: elimina ese flag y ejecuta Jest con `--no-cache`; el proceso termina naturalmente, sin `--forceExit` (conserva R-14 y la guarda anti-handles). Salida resumida del comando:

```text
Test Suites: 4 skipped, 327 passed, 327 of 331 total
Tests:       15 skipped, 4189 passed, 4204 total
Snapshots:   0 total
Time:        134.537 s
Ran all test suites.
```

Las suites omitidas son las skips del baseline del API; las pruebas HTTP de B2 sí corrieron y pasaron dentro del conjunto.

### Persistencia de auditoría contra Postgres real

```powershell
$env:E2E_TENANT_SLUG = 'iwana'
pnpm --filter @iwana/api test:integration -- --runInBand --runTestsByPath src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Ran all test suites within paths "src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts".
```

La ejecución terminó naturalmente, sin `--forceExit`. El test lanzó un PATCH HTTP del controlador y consultó la fila insertada en `audit_logs`. `new_value` solo contiene `changedFields`; no aparecen el NIT ni la dirección del request. Usó un schema efímero aislado y lo eliminó en `afterAll`. El schema local de desarrollo aún no tiene las columnas del DDL de B1, por lo que el fixture clonado agrega esas dos columnas faltantes solo en el schema temporal; no modifica el tenant de desarrollo.

También pasó la corrida enfocada de B2: **4 suites, 91 tests**.

## Criterios de salida B2

| Criterio | Resultado | Evidencia |
| --- | --- | --- |
| POST C-API-1 HTTP 200 y GET `/search` 404 | Cumplido | `subscribers.controller.fase2.http.spec.ts` |
| Sin criterios personales en `@Query` | Cumplido | Inspección de metadata HTTP de las rutas del controlador y test de GET con query PII ignorada |
| Proyección de los 12 campos restringidos en los 5 roles | Cumplido | Matriz HTTP rol×campo; propiedad restringida ausente (no solo `null`) |
| `TECHNICIAN` y `AUDITOR` sin acceso a listado/POST search | Cumplido | Tests HTTP 403 aun con permiso de lectura |
| `%`, `_` y `\\` literales en búsqueda libre | Cumplido | Test de servicio de SQL parametrizado y patrón escapado |
| `LIST_ACCESS` y `RECORD_ACCESS` esperados | Cumplido | Test de lista diferida y pruebas del controlador |
| `audit_logs` sin valores personales tras `update` | Cumplido | Test HTTP integrado contra PostgreSQL real |
| Suite API con conteo real y flag `--force` | Cumplido | 327 suites / 4189 tests pasados; 4 suites / 15 tests omitidos |

## Deuda nueva por severidad

| Severidad | Deuda |
| --- | --- |
| Crítica | Ninguna identificada. |
| Alta | Ninguna identificada. |
| Media | Consumidores externos al monorepo que aún llamen `GET /crm/subscribers/search` deberán migrar a POST antes del retiro operativo; el endpoint legacy ahora responde 404 de forma intencional. |
| Baja | `latitude` y `longitude` conservan finalidad declarada, pero la matriz ratificada limita el listado a cinco roles y no asigna esas coordenadas a ninguno. Requieren futura ratificación si cambia el alcance; B2 las omite actualmente. |

## Resultado final

B2 cierra dentro de su alcance. No se modificaron `subscriber-creation.service.ts`, parties, migraciones, Habeas Data ni reglas IVA. C-API-1 v1.0 no se sobrescribió; la búsqueda libre queda aislada en la adenda v1.1 autorizada.

# Informe — MOD05 Suscriptores · Remediación B9

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** Implementado; gate API e integración PostgreSQL real aprobados.  
**Responsable:** `sr-backend`  
**Contratos:** C-API-2 v1.2 de `PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.2.md` §2

## Entregables

| Ruta | Resultado |
| --- | --- |
| `packages/shared/src/schemas/subscriber.schema.ts` | Publica `SubscriberListItem` v1.2: `vatTreatment` forma parte de la base y `department?` es opcional/restringido. |
| `apps/api/src/modules/crm/subscribers/subscriber-projection.ts` | Proyecta `vatTreatment` para todos los roles del listado y `department` únicamente para ADMIN y SUPPORT, siguiendo el allowlist de `city`; los roles sin permiso siguen cerrados por defecto. |
| `apps/api/src/modules/crm/subscribers/subscribers.controller.fase2.http.spec.ts`, `apps/api/src/modules/crm/subscribers/tests/subscriber-projection.spec.ts` | La matriz rol × campo comprueba la presencia de `vatTreatment` en todos los roles de listado y la presencia/ausencia de `department` según el mapa. |
| `apps/api/src/modules/crm/subscribers/subscriber-status-transition.service.ts` | `reactivateFromExpediente` rechaza suscriptores con `activatedAt` no nulo y condiciona también el `UPDATE` a `activatedAt IS NULL` para preservar la guarda ante una carrera. |
| `apps/api/src/modules/crm/subscribers/b5-identity-conversion.postgres.integration.spec.ts` | Añade un caso PostgreSQL real: un suscriptor CANCELLED con `activatedAt` previo conserva estado y fecha y no puede volver a PROSPECT. |
| `apps/api/package.json`; `apps/api/run-jest.cjs` | El script `test` vuelve a `jest`; se retira el wrapper que reenviaba `--force` a Jest. |

## Evidencia

| Verificación | Resultado real |
| --- | --- |
| `pnpm exec turbo run test --filter=@iwana/api --force` | Exit code 0. Turbo ejecutó 4 tareas, 0 cached; Jest: 328 suites aprobadas, 4.192 tests aprobados; 4 suites y 15 tests omitidos (4.207 total). |
| `$env:E2E_TENANT_SLUG='test-s2-live'; pnpm --filter @iwana/api exec jest --config jest.integration.config.js --runTestsByPath C:\appiw\apps\api\src\modules\crm\subscribers\b5-identity-conversion.postgres.integration.spec.ts --runInBand` | Exit code 0 contra PostgreSQL real: 1 suite y 6 tests aprobados. Incluye el nuevo caso de `activatedAt`. La suite creó y eliminó su schema `tenant_b5_<uuid>`; no escribió sobre el schema fuente. |
| `pnpm --filter @iwana/api typecheck` | Exit code 0. |

La prueba integrada verificó que la restauración rechaza el registro de estado previo y que PostgreSQL conserva `status=CANCELLED` y el `activated_at` original. El gate Turbo mostró `cache bypass, force executing` y `Cached: 0 cached, 4 total`. Los 4 suites y 15 tests omitidos pertenecen a suites opt-in condicionadas a bases/flags; el Jest principal excluye `*.postgres.integration.spec.ts`, por lo que B5 se ejecutó separadamente con el probe PostgreSQL alcanzable. En la base local no existe el slug CI `test`; se seleccionó el tenant de desarrollo `test-s2-live` como schema fuente para el schema temporal aislado.

## Deuda nueva por severidad

| Severidad | Deuda / condición |
| --- | --- |
| Crítica | Ninguna introducida por B9. |
| Alta | Ninguna introducida por B9. |
| Media | Ninguna introducida por B9. |
| Baja | Ninguna introducida por B9. |

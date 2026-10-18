# INFORME-MOD05-DEUDA-V4-GATES-v1.1

**Fecha:** 2026-10-17  
**Re-verificación:** V4′ · gates de merge para la ola A/B de MOD05 Deuda  
**Base:** `main` en `e2348a42` + diff actual A/B  
**Perfil y skills:** AI-GATE-VERIFIER; `iwana-test-evidence` y `verification-before-completion` leídas como documentación.

## Veredicto

**NO-GO para merge.** Turbo, las suites y las integraciones dedicadas terminaron sin fallos reportados. Quedan abiertos el gate de cobertura de `subscriber.schema.ts` (<80%), el hallazgo mayor CD-04 de V3′ sobre el consumo portal de campos fiscales autorizados para detalle restringido, y una revisión independiente de boundaries. V1′ sí se ejecutó y pasó 12/12, con las limitaciones de cobertura R6/R7/R10 descritas abajo. No se hizo commit ni se migró `dbiw`.

## Gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Build, lint, test y typecheck | Cumple con limitación de wrapper | `pnpm --config.use-node-version=24.18.0 exec turbo run build lint test typecheck --force --continue`: Turbo informó **30/30 tareas exitosas, 0 cacheadas**. Los builds de web/portal finalizaron. Lint/typecheck separados de API, portal y shared terminaron exit 0; lint tuvo 0 errores (API 7 advertencias, portal 45, shared 0). El wrapper de Turbo no devolvió `exit_code` pese al resumen de éxito. |
| Tests completos sin caché | Cumple | Corrida Turbo forzada: API **394 suites / 5.307 tests pasaron; 4 suites / 15 tests omitidos**; portal **304 suites / 3.069 pasaron; 1 omitido**; web **36 suites / 229 tests**; worker **21 / 171**; DB **74 / 417**; shared **21 / 191**; UI **5 / 34**. Corrida independiente `pnpm exec turbo run test --force --continue`: **10/10 tareas exitosas, 0 cacheadas**. |
| Integración DB contra `iwana_it_g7_ci` | Cumple | `pnpm --config.use-node-version=24.18.0 --filter @iwana/db exec jest --config jest.integration.config.js --runInBand --no-cache --forceExit --cacheDirectory C:\appiw\.cache\jest-tmp`: probe y conexión a `127.0.0.1:5433` confirmados; **35 suites / 125 tests pasaron, 0 omitidos, exit 0**. Las pruebas usaron schemas efímeros; no se corrió el CLI de migraciones sobre `dbiw`. |
| Integración API contra `iwana_it_g7_ci` | Cumple con skips declarados | `pnpm --config.use-node-version=24.18.0 exec node --env-file=.env .cache/run-api-integration-mod05.mjs`, forzando DB `127.0.0.1:5433/iwana_it_g7_ci` y Redis `127.0.0.1:6380`: **24 suites / 97 tests pasaron; 3 suites / 15 tests omitidos; 0 fallidos; exit 0**. La corrida no se omitió. |
| Cobertura de módulos core tocados | Falla parcial | Refresh API sin caché: `pnpm --config.use-node-version=24.18.0 --filter @iwana/api exec jest --runInBand --no-cache --forceExit --coverage --coverageReporters=text-summary --coverageReporters=json-summary --cacheDirectory C:\appiw\.cache\jest-tmp`, exit 0: API **62,94% statements / 52,82% branches / 60,66% functions / 71,79% lines**; 394 suites y 5.307 tests pasaron, 4 suites/15 tests omitidos. Los módulos MOD05 medidos en `coverage-summary.json`: `subscriber-creation.service.ts` 92,23% statements / 92,07% lines; `subscriber-fiscal-completeness.service.ts` 96,42% / 95,45%; `subscribers.service.ts` 95,66% / 95,60%; `contract-read-projection.ts` 97,56% / 97,14%; `contracts.service.ts` 95,47% / 96,35%. Cobertura del run previo completo `test:coverage`: `nit-verification-digit.util.ts` 100%/100%; `subscriber.schema.ts` **75%/75%**, bajo el 80% para el schema compartido tocado. |
| UI portal afectada | Evidencia complementaria | Corrida completa `test:coverage`: `JuridicaPersonFields.tsx` 100% statements/lines; `SubscriberForm.tsx` 82,58%/86,33%; `SupplierFormDrawer.tsx` 61,61%/61,38% (archivo incluye rutas ajenas al cambio de NIT; la suite dirigida de ambos formularios, incluido NIT largo, pasó). Cobertura agregada del portal: 69,43% statements / 70,44% lines; no sustituye el umbral por módulo. |
| OpenAPI | Cumple | No se agregaron endpoints. Revisión estática y suite focal del controller: 1 suite / 29 tests / 0 fallos. |
| Migraciones | No aplica | El diff no agregó migraciones. La integración DB probó contra la base dedicada `iwana_it_g7_ci`; no se migró `dbiw`. |
| PII en logs | Cumple | La búsqueda del diff para logs con email/documento/teléfono/token/payload no encontró nuevas interpolaciones de PII. Los logs de error usan `summarizeErrorForLog`; los fixtures de pruebas son sintéticos. |
| Vulnerabilidades críticas | No aplica | No se modificaron dependencias. |
| Boundaries backend | Abierto | No se adjuntó revisión independiente de `boundary-reviewer`; V2′ cubre M-1/guardia DTO y V3′ deriva de contratos, pero no reemplazan esa revisión. |
| V1′ E2E live | Cumple, parcial por alcance E2E | Se ejecutaron los 12 tests de `portal-mod05-deuda-fiscal-live` con `--retries=0` contra `e2e-privacy-1b-a114bf06`; **12 pasaron, 0 fallaron/omitidos/flaky**. Antes de iniciar el worker, el conteo `MARKED_FOR_DELETION` fue 0 y se confirmó 0 después. API health respondió HTTP 200; Redis PONG. R7 verifica lectura cifrada y 360°, pero no crea una fila heredada en texto plano; R6 (CLI backfill) y R10 (paridad enum/DDL) quedan fuera del E2E. El primer preflight tuvo un intento fallido `EACCES`, resuelto en el rerun documentado en [V1′](INFORME-MOD05-DEUDA-V1-QA-v1.1.md). Los tests usan datos sintéticos en `dbiw`; no se ejecutó migración allí. |
| V3′ deriva de contratos | **NO-GO** | [V3′](INFORME-MOD05-DEUDA-V3-REV-v1.1.md) reporta CD-04 mayor: la API conserva IVA, RUT y `fiscalCompleteness` en el detalle restringido, pero el portal los descarta/oculta cuando `privacyRestricted` es true. CD-02 tiene observación menor: falta una prueba del endpoint/servicio específico de PATCH de la sección de identificación. |

## Cobertura adicional de paquetes

El run completo anterior `pnpm --config.use-node-version=24.18.0 test:coverage` cubrió 7 tareas y reutilizó 1 tarea de `@iwana/ui`, paquete fuera de esta ola. Totales: API 62,94% statements / 71,79% lines; portal 69,43% / 70,44%; shared 88,15% / 88,69%. API se refrescó luego sin caché como se detalla en la tabla; portal/shared conservan esas métricas por paquete. Los totales no sustituyen el umbral por módulo.

## Gates abiertos

- Resolver la presentación de los campos fiscales en el detalle restringido según CD-04, alineando el consumidor portal con la lista blanca aprobada por contrato.
- Llevar `packages/shared/src/schemas/subscriber.schema.ts` de 75% a ≥80% si se mantiene como módulo core del cambio.
- Ejecutar una revisión independiente de boundaries backend.
- Cubrir con prueba el PATCH real de `rutResponsibilities` en la sección de identificación para cerrar la observación CD-02.

V1′ no queda bloqueado por entorno: el primer intento de preflight falló con `DB check error: class=AggregateError sqlstate=none code=EACCES`, y el rerun logró ejecutar y reportar los 12 casos. Los comandos de DB/API de este gate se ejecutaron expresamente contra `iwana_it_g7_ci` y Redis en los puertos solicitados; no se migró `dbiw`.

# INFORME — Privacy Fase 1a · Re-verificación de gates

**Versión:** 1.1  
**Fecha:** 2026-10-14  
**Verificador:** AI-GATE-VERIFIER  
**Base:** plan de orquestación v1.5; `AGENTS.md` → Gates Before Merge.  
**Alcance:** lint, typecheck, pruebas y cobertura de `@iwana/api`, `@iwana/shared`, `@iwana/db`, `@iwana/portal` y `@iwana/worker`; verificaciones de OpenAPI, migraciones, logs y revisiones auxiliares. No se modificó código ni configuración.

## Resultado

La matriz requerida de lint, typecheck y tests pasó en los cinco paquetes. Cada corrida de Turbo fue forzada y reporta **0 tareas cacheadas**. La cobertura focalizada de `apps/api/src/modules/privacy/**`, ejecutada directamente con Jest y `--no-cache`, superó el mínimo de 80% en statements y branches.

No se usa `pnpm test:coverage` como evidencia de cero caché: terminó con 3 de 7 tareas cacheadas. Una corrida adicional de cobertura para toda la API con Jest `--no-cache` falló por un test sensible al tiempo en CRM; se registra por separado y no reemplaza la corrida oficial de API `turbo --force`, que pasó.

**G6: calidad verificada para la matriz indicada, con la incidencia diagnóstica y observaciones de contrato detalladas abajo. G6.5 sigue pendiente:** la integración pública real de la migración 027 está diferida a CI y no se marca aprobada. G7 no se evaluó.

## Matriz de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| Lint | **cumple** | `pnpm exec turbo run lint --filter=@iwana/api --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/portal --filter=@iwana/worker --force` — exit 0; 7/7 tareas exitosas, 0 cacheadas, 0 errores. Warnings: API 7, DB 5, portal 46, worker 1, shared 0. |
| Typecheck | **cumple** | `pnpm exec turbo run typecheck --filter=@iwana/api --filter=@iwana/shared --filter=@iwana/db --filter=@iwana/portal --filter=@iwana/worker --force` — exit 0; 7/7 tareas exitosas, 0 cacheadas. |
| Tests `@iwana/api` | **cumple** | `pnpm exec turbo run test --filter=@iwana/api --force` — 372 suites aprobadas, 4 omitidas; 4.963 tests aprobados, 15 omitidos; 4/4 tareas exitosas, 0 cacheadas. |
| Tests `@iwana/shared` | **cumple** | `pnpm exec turbo run test --filter=@iwana/shared --force` — 18/18 suites, 168/168 tests; 1/1 tarea exitosa, 0 cacheadas. |
| Tests `@iwana/db` | **cumple** | `pnpm exec turbo run test --filter=@iwana/db --force` — 65/65 suites, 392/392 tests; 2/2 tareas exitosas, 0 cacheadas. Incluye el spec de la migración pública 027, no una integración real de esa migración. |
| Tests `@iwana/portal` | **cumple** | `pnpm exec turbo run test --filter=@iwana/portal --force` — 298/298 suites, 2.998 tests aprobados, 1 omitido; 2/2 tareas exitosas, 0 cacheadas. |
| Tests `@iwana/worker` | **cumple** | `pnpm exec turbo run test --filter=@iwana/worker --force` — 20/20 suites, 169/169 tests; 4/4 tareas exitosas, 0 cacheadas. |
| Cobertura `apps/api/src/modules/privacy/**` | **cumple** | `pnpm --filter @iwana/api exec jest --runInBand --no-cache --testPathPattern=modules/privacy --coverage --coverageReporters=json-summary --coverageReporters=text-summary --collectCoverageFrom='modules/privacy/**/*.ts' --collectCoverageFrom='!modules/privacy/**/*.spec.ts' --coverageThreshold='{"global":{"statements":80,"branches":80}}'` — exit 0; 31/31 suites y 141/141 tests. Statements 96,5% (1188/1231); branches 87,53% (309/353); functions 94,02% (173/184); lines 96,59% (1078/1116). El resumen se leyó de `apps/api/coverage/coverage-summary.json`. |
| `pnpm test:coverage` agregado | **sin evidencia** de cero caché global | Ejecutó cobertura; Turbo informó 7 tareas, 3 cacheadas. API generó su resumen con cache miss, pero esta ejecución agregada no cumple el criterio de 0 tareas cacheadas y no se usa para declarar el gate. |
| Cobertura completa API con Jest no-cache | **falla** en la corrida diagnóstica | `pnpm --filter @iwana/api exec jest --no-cache --coverage --coverageReporters=text-summary --coverageReporters=json-summary` — exit 1: 371 suites aprobadas, 4 omitidas, 1 fallida; 4.962 tests aprobados, 15 omitidos, 1 fallido. `subscribers.controller.fase2.http.spec.ts:514` esperaba `auditMock.log(LIST_ACCESS)` después de 10 ms; recibió 0 llamadas y el `afterAll` excedió 15 s. La corrida estándar API `turbo --force` sí pasó; privacidad pasó dentro de las 31 suites focalizadas. |
| OpenAPI | **no aplica** a rutas nuevas | El diff actual no agrega decoradores `@Get/@Post/@Patch/@Put/@Delete`. `privacy.swagger.spec.ts` pasó dentro de la suite API; los esquemas modificados se verifican por ese contrato. |
| Migraciones tenant / orden | **cumple** para el registro actual | `pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts` — 1/1 suite, 6/6 tests, exit 0. No hay archivos de migración en el diff de esta re-verificación. |
| Migración pública 027 en PostgreSQL real | **diferida** | Según el launcher, la integración pública queda para CI G6.5. El spec unitario `027_media_usage_privacy_evidence.spec.ts` pasó dentro de las pruebas de DB; no constituye aplicación real en `test`/`iwana_it_*` y no se marca aprobada. |
| No PII en logs del diff | **cumple** en el alcance revisado | Búsqueda de líneas agregadas `logger.log/error/warn/debug` y `console.*` en el diff de `apps/api` y `apps/worker`: sin coincidencias. R5 confirma que `partyId` no se agregó a logs ni auditoría. |
| Boundaries | **cumple** con revisión adjunta | `INFORME-PRIVACY-FASE-1A-BOUNDARY-v1.1.md` cierra el hallazgo A25: `AuditService.logWithin` usa el manager transaccional, sanea y propaga errores; no quedan creaciones de `AuditLog` fuera de `audit`. La revisión base v1.0 cubrió el diff backend de la fase. |
| Vulnerabilidades críticas | **no aplica** a cambios de dependencias | El diff no cambia `package.json` ni `pnpm-lock.yaml`; por la regla del perfil no se ejecutó `pnpm audit`. La revisión SEC v1.1 da GO para SEC-01; SEC-02 permanece como deuda P2 condicional para storage local. |
| E2E de R4b | **cumple** según informe de QA | `INFORME-PRIVACY-FASE-1A-QA-v1.2.md` registra 3/3 E2E contra portal/API reales y 13/13 tests de integración PostgreSQL para atomicidad. El tenant sintético quedó `INACTIVE`. Esta evidencia procede del informe de QA, no de una corrida de V4. |

## Gates abiertos y deuda observada

- **G6.5 pendiente:** la integración de la migración pública 027 debe ejecutarse en CI; el spec local no la sustituye.
- **Observación de deriva menor:** `INFORME-PRIVACY-FASE-1A-DRIFT-v1.1.md` señala que el tipo del cliente declara `partyId?: string | null`, aunque el productor emite la propiedad obligatoria como UUID o `null`. No se cambió contrato en V4.
- **SEC-02 P2:** el adaptador de storage local entrega URL directa y la configuración sirve `/storage/` con caché pública. La revisión SEC v1.1 la condiciona al uso de storage local y la asigna a `plat-ops`; no la declara bloqueo G6.
- **Corrida diagnóstica no-cache de API completa:** investigar el timeout/fallo de `subscribers.controller.fase2.http.spec.ts` antes de usar esa modalidad global de cobertura como gate. El test suite requerido de API bajo Turbo `--force` pasó.
- **Cobertura agregada:** `pnpm test:coverage` no acredita cero cache hits (3/7). Para el gate privacy se usó el comando focalizado `--no-cache` con el conteo arriba.
- **V5 documentación:** revisión final de gobernanza documental pendiente en su bloque separado.

## Cambios de este bloque

Únicamente se creó este informe. La ruta estaba libre antes de escribirlo. Se conservaron los archivos de trabajo previos sin modificaciones.

# INFORME — MOD05 · Lista operativa de Suscriptores (Fase 06)

**Fecha:** 2026-10-19 · **Versión:** 1.0 · **Estado:** Aprobado
**PRD:** [MOD05 CRM Suscriptores — Fase 06](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-06-v1.0.md) · **Plan:** [Lista operativa](../plans/2026-10-19-mod05-lista-operativa.md)
**Commits:** implementación `bff1ab4f`, ajuste de fixture API `64793581`, mock E2E de conteos `32610ae0`, cierre documental `94d3667b` · [CI de código](https://github.com/Sleybc/iWana-neXt/actions/runs/39326055614) · [CI del cierre documental](https://github.com/Sleybc/iWana-neXt/actions/runs/39332467391) · [E2E Web Admin Smoke](https://github.com/Sleybc/iWana-neXt/actions/runs/39332467361)

## Alcance ejecutado

- La lista del portal muestra el servicio principal, los conteos globales de cola, los chips y «Más filtros», con estado de filtros en URL y comportamiento de teclado limitado a la tabla.
- La vista lateral expone estados de carga, error, acceso restringido y servicios, conserva su estado en `?peek=` y permite las acciones de ciclo de vida ya existentes.
- `GET /crm/subscribers/queue-counts` y los filtros usan las mismas reglas de negocio de la lista. Los contratos se resuelven por lote desde el provider comercial activo.
- Se consolidó `useDeferredInitialFocus` en `@iwana/ui` y se adoptó en los seis sitios previstos, con cancelación de frames y sin desplazar un foco reclamado por el operador.
- Se actualizaron esquemas compartidos, OpenAPI, specs, pruebas HTTP, integración PostgreSQL, E2E y artefactos de gobernanza.

## Decisiones y mediciones congeladas

- G0: D-F6-1 A (sin zona; ciudad del servicio principal), D-F6-2 regla RF-LO-02, D-F6-3 conteos globales, D-F6-4 vistas guardadas diferidas, D-F6-5 teclado solo con foco en la tabla y D-F6-6 inclusión de los P3.
- El límite RNF-LO-01 considera tres consultas principales: filas, conteo total y lote de planes. Las lecturas de Party y Privacy se miden y reportan aparte.
- En PostgreSQL, la página de 100 filas registró `total=6`, `main=3`, `party=1`, `privacy=2`. La prueba de integración pasó 3/3; `EXPLAIN` usó `idx_contracts_tenant_subscriber` y no mostró scan secuencial de `contracts`.
- La vista por lote usa `CommercialCatalogReadAdapter`, que ya provee el puerto en runtime; se conservó la implementación legada tenant y no se cambió el token DI.

## Evidencia de pruebas

| Paquete / alcance                                                | Comando                                                                                                                                                                                 | Resultado                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| API                                                              | `pnpm exec turbo run test --filter=@iwana/api --force`                                                                                                                                  | 400/404 suites; 5.382 tests aprobados y 15 omitidos; `Cached: 0`.                                                                                |
| Shared                                                           | `pnpm exec turbo run test --filter=@iwana/shared --force`                                                                                                                               | 22 suites, 207 tests; `Cached: 0`.                                                                                                               |
| UI                                                               | `pnpm exec turbo run test --filter=@iwana/ui --force`                                                                                                                                   | 6 suites, 45 tests; `Cached: 0`.                                                                                                                 |
| Portal                                                           | `pnpm exec turbo run test --filter=@iwana/portal --force`                                                                                                                               | 313 suites; 3.171 aprobados, 1 omitido; `Cached: 0`.                                                                                             |
| CRM serial                                                       | `pnpm --filter @iwana/portal exec jest src/components/crm --maxWorkers=1 --no-cache`                                                                                                    | 36 suites, 336 tests aprobados.                                                                                                                  |
| Vista lateral                                                    | Cinco ejecuciones consecutivas de `SubscriberPeek.spec.tsx`                                                                                                                             | Cada ejecución: 1 suite, 6 tests aprobados.                                                                                                      |
| E2E F06                                                          | `e2e/tests/portal-mod05-lista-operativa.spec.ts`                                                                                                                                        | 5/5 escenarios aprobados: URL, suspensión, teclado y privacidad.                                                                                 |
| PostgreSQL F06                                                   | `pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/modules/crm/subscribers/contact-pending.postgres.integration.spec.ts --runInBand --no-cache`                | 1 suite, 3 tests aprobados; conteos y `EXPLAIN` arriba.                                                                                          |
| Integración de auditoría B2                                      | `pnpm --filter @iwana/api exec jest --config jest.integration.config.js src/modules/crm/subscribers/subscribers-update-audit.postgres.integration.spec.ts --runInBand --no-cache`       | 1 suite, 1 test aprobado contra PostgreSQL. El fixture registra `PlanCatalogReadPort` y agrega columnas faltantes solo en el schema desechable.  |
| Pruebas focales de filtros y foco                                | `pnpm --filter @iwana/portal exec jest src/components/crm/subscribers/SubscriberMoreFilters.spec.tsx src/components/shared/use-portal-side-drawer-a11y.spec.tsx --runInBand --no-cache` | 2 suites, 8 tests aprobados.                                                                                                                     |
| SSR y Chromium de `AuthReadyGate` (corrección previa autorizada) | Prueba Jest SSR focal + `pnpm exec playwright test --config=e2e/playwright.portal.config.ts e2e/tests/portal-auth-ready-gate.spec.ts`                                                   | Jest: 1/1; Chromium: 1/1. El gate excluye contenido protegido del HTML hasta validar la sesión. El fix está en `27625542`, antes de la base F06. |
| Typecheck y lint                                                 | API, Shared, UI y Portal                                                                                                                                                                | 4/4 typechecks y 4/4 lints con exit 0. Lint reportó 7 avisos API y 43 Portal; ninguno pertenece a archivos F06 modificados.                      |

### Cobertura

Métricas por archivo en orden **líneas / statements / branches / functions**:

| Módulo F06                                              |                       Cobertura |
| ------------------------------------------------------- | ------------------------------: |
| `subscribers.service.ts`                                | 96,04 / 95,89 / 85,25 / 98,38 % |
| `subscribers.controller.ts`                             | 95,53 / 94,76 / 86,82 / 90,62 % |
| `subscriber-projection.ts`                              |       100 / 100 / 87,23 / 100 % |
| `subscriber-queue-predicates.ts`                        |         100 / 100 / 100 / 100 % |
| `contract-read-projection.ts`                           |   97,36 / 97,72 / 96,96 / 100 % |
| `commercial-catalog-read.adapter.ts`                    |       100 / 100 / 81,57 / 100 % |
| `SubscriberMoreFilters.tsx`                             |         100 / 100 / 100 / 100 % |
| `use-portal-side-drawer-a11y.ts`                        |       94,87 / 93,75 / 80 / 90 % |
| `subscriber.schema.ts` y `useDeferredInitialFocus`      |    100 % en las cuatro métricas |
| `SubscribersListClient.tsx`                             | 82,54 / 80,75 / 72,78 / 75,75 % |
| `SubscriberPeek.tsx`                                    | 83,56 / 81,70 / 81,72 / 78,94 % |
| `SubscriberQueueChips.tsx`                              |    93,75 / 93,75 / 90 / 83,33 % |
| `SubscriberLifecycleDialog.tsx`                         |    84,76 / 84,24 / 77,62 / 75 % |
| `portal-ui.tsx`                                         | 93,84 / 92,50 / 89,11 / 96,77 % |
| `subscriber-ui.ts`                                      |    92,42 / 90,14 / 50 / 92,30 % |
| `SessionRecoveryModal.tsx`                              | 74,87 / 74,50 / 47,76 / 83,33 % |
| `api-client.ts` (archivo compartido extenso)            | 24,23 / 22,53 / 13,78 / 12,24 % |
| `tenant-crm-read-adapter.service.ts` (adaptador legado) |         29,26 / 30,76 / 0 / 0 % |

En el resumen global de `@iwana/ui`, `Dialog.tsx`, `OperationalSidePeek.tsx` e `index.ts` no recibieron entrada de cobertura. Los dos primeros consumen el hook compartido, cuya lógica nueva está cubierta al 100%; el suite `@iwana/ui` pasó 6/6.

Los agregados de la corrida global fueron API 71,16 % líneas, Shared 89,27 %, UI 86,95 % y Portal 71,22 %. La corrida global de Portal fue anterior a los seis tests adicionales arriba; no se recalculó su agregado después. El umbral configurado global del Portal es un trinquete histórico inferior al 80 %; el gate de `AGENTS.md` se refiere a módulos core. La corrida completa de cobertura Portal tuvo un fallo en `InventoryCategoryDrawer.spec.tsx > uses server suggestion when available` bajo instrumentación; el archivo no está en el diff, el test aislado pasó 1/1 y la suite Portal completa sin cobertura pasó 313/313 suites. La causa de la variación bajo cobertura no quedó confirmada. Se deja como incidencia de cobertura ajena a F06, sin atribuirla a una regresión.

No se conservó una medición de cobertura de `ec0e4e16` para comparar regresión por módulo. La implementación F06 de los módulos core listados arriba sí tiene evidencia focal.

## Gates

| Gate                         | Estado                             | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 — decisiones aprobadas    | Cumple                             | D-F6-1 a D-F6-6 aprobadas el 2026-10-19; PRD en estado Aprobado.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| G1 — contratos y rendimiento | Cumple                             | S1/S2/S3; tres consultas principales y mediciones separadas Party/Privacy; índice esperado en `EXPLAIN`.                                                                                                                                                                                                                                                                                                                                                                           |
| G2 — aceptación              | Cumple                             | CA-LO-01 a CA-LO-10 trazados a pruebas; V1 GO; E2E F06 5/5.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G3 — privacidad              | Cumple                             | V2 GO; la proyección redacciona PII de registros anonimizados incluso con permisos para registros bloqueados; `?peek=` usa solo el id.                                                                                                                                                                                                                                                                                                                                             |
| G4 — Modulith y contratos    | Cumple con observación menor       | V3: sin violación de producción/tenancy ni deriva de contratos. El test PostgreSQL de CRM importa el adaptador y entidad Commercial; el acoplamiento es solo de pruebas.                                                                                                                                                                                                                                                                                                           |
| G5 — identidad               | Cumple                             | V4 GO, 100/100; `audit-ui.mjs apps/portal/src/components/crm/subscribers` dio 0 P0-P3. El barrido adicional de archivos UI tocados detectó 1 P2 heurístico en `portal-ui.tsx:435`, línea preexistente sin cambio.                                                                                                                                                                                                                                                                  |
| G6 — gates locales           | Cumple con incidencias registradas | Suites, lint, typecheck, OpenAPI, seguridad y diff check como arriba. El barrido UI de workspace fue P0=0, P1=4, P2=52, P3=19; P1 heurísticos.                                                                                                                                                                                                                                                                                                                                     |
| G7 — commit, push y CI       | Cumple                             | `32610ae0` está en `main`; CI de código (`39326055614`), CI del cierre documental (`39332467391`) y E2E Web Admin Smoke final (`39332467361`) concluyeron en verde. Conteo informativo de Portal: 180/123/1/0 en CI de código y 178/125/1/0 en CI documental (pasaron/fallaron/omitidas/flaky). El CI previo (`39318226363`) terminó verde y su smoke (`39318226298`) pasó. El primer CI (`39315448739`) detectó el provider faltante en el fixture B2; se corrigió en `64793581`. |

## Seguridad, OpenAPI y migraciones

- `pnpm audit --prod --audit-level critical`: exit 0; 0 críticas, 1 baja y 4 moderadas.
- La prueba Swagger/controller pasó 1 suite y 38 tests; cubre el contrato de lista, filtros y `GET /crm/subscribers/queue-counts`.
- No hay migraciones F06: `git diff --name-only` para `packages/database/src/migrations` no encontró archivos. No aplica migration-order.
- La revisión de PII encontró dos `console.info` en la integración PostgreSQL; emiten metadatos de `EXPLAIN`, schema de fixture y conteos, sin datos personales ni payloads.
- `git diff --check`: limpio. `pnpm audit:doc-locations`: 0 bloqueantes y 3 avisos preexistentes. `pnpm audit:adr-citations`: 0 bloqueantes y 144 avisos heurísticos globales.

## Pendientes y deuda

- **Portal / suite de cobertura:** revisar en el carril dueño de Inventario la variación de `InventoryCategoryDrawer` bajo cobertura completa. El test aislado y la suite regular pasan; causa raíz no confirmada. No bloquea el test Portal sin caché ni los archivos F06.
- **Portal / contador E2E:** el CI de código `32610ae0` (`39326055614`) registró 304 pruebas: 180 pasaron, 123 fallaron, 1 omitida y 0 flaky. La CI sobre el cierre documental (`39332467391`) registró 178 pasaron, 125 fallaron, 1 omitida y 0 flaky. Ambas quedaron bajo la corrida real anterior sin F06 (`39300357198`, commit `ea49fb4c`), que tuvo 127 fallos en 299 pruebas. En la comparación por spec del primer run, 123 fallos se repitieron, 4 anteriores se resolvieron y 3 fallos nuevos eran del fixture de `portal-pager-a11y.spec.ts`, que no simulaba `GET /crm/subscribers/queue-counts`. El helper ahora incluye esa respuesta y los tres escenarios afectados pasaron aislados (3/3). La diferencia agregada entre las dos corridas post-fix fue de dos fallos más en la repetición documental; no hubo flaky dentro de ninguno de los conteos. El umbral histórico configurado en 100 sigue por debajo de la corrida pre-F06; no atribuir los 25 sobre umbral a regresiones de producto. El job es informativo y no bloquea el workflow.
- **Prueba de integración CRM:** desacoplar el fixture de Commercial si se reemplaza el adaptador por un puerto de pruebas; severidad menor, sin acceso cruzado en producción.
- **Integración B5 basal:** su spec PostgreSQL produjo 15 fallos y 2 pases por la ausencia preexistente de `ExpedienteRecord.anonymized_at`; el mismo resultado se reprodujo en `ec0e4e16`. No corresponde a una regresión de F06.
- No quedan decisiones abiertas para el CTO.

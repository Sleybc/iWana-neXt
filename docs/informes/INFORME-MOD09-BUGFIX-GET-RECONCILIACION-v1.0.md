# Informe MOD09 — Corrección de reconciliación en lecturas WFM

**Versión:** 1.0  
**Estado:** Ejecutado sin commit  
**Fecha:** 2026-08-24  
**Módulo:** MOD09 Programación / WFM

## Alcance

Se retiró la invocación de `reconcileOpenVisitRequestStatuses` de los métodos
estrictamente de lectura de `VisitRequestsService`:

- `listVisitRequests`
- `getFilterOptions`
- `getVisitRequestById`

La proyección de estados se mantiene en memoria para conservar las respuestas.
No se modificaron autorización, contratos HTTP, portal ni migraciones. No se

## Regresión cubierta

Las pruebas de servicio verifican que los tres GET anteriores no invocan
`EntityManager.query`, evitando el `UPDATE` implícito, y que los estados
proyectados siguen siendo visibles en la respuesta.

## Evidencia de verificación

- Tests WFM focalizados — `pnpm.cmd --filter @iwana/api exec jest --runInBand src/modules/wfm/services/visit-requests.service.spec.ts src/modules/wfm/services/visit-requests.remediacion-auditoria.spec.ts src/modules/wfm/tests/visit-requests.controller.http.spec.ts` — 3 suites, 82 tests, todos en verde.
- Typecheck API: `pnpm.cmd --filter @iwana/api typecheck` — verde.
- Lint focalizado: `pnpm.cmd --filter @iwana/api exec eslint src/modules/wfm/services/visit-requests.service.ts src/modules/wfm/services/visit-requests.service.spec.ts` — verde.

## Trazabilidad

- `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`

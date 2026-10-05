# Informe MOD11 — Hotfix de ventana nula

**Versión:** 1.0  
**Fecha:** 2026-10-05  
**Agente:** AI-FE-PLATFORM (`fe-platform`)  
**Resultado:** **GO**

## Alcance

Se corrigió la lectura de `schedule.window` en la bandeja y el resumen de detalle. El contrato compartido `packages/shared/src/contracts/operations/execution-orders.ts` v1.4 conserva la nulabilidad introducida en v1.3; no se modificó el contrato ni el api-client. Cuando `window` es nulo, ambas presentaciones muestran `—`, conforme al contrato de tablas operativas v1.1.

No se añadió copy ni se modificó la estructura de la consola.

## Cambios

- `apps/portal/src/components/operations/ExecutionOrdersTable.tsx`: la celda de ventana devuelve `—` antes de leer `startAt` o `endAt` si la ventana es nula.
- `apps/portal/src/components/operations/ExecutionOrdersTable.spec.tsx`: caso de bandeja con `schedule.window: null`.
- `apps/portal/src/components/operations/ExecutionOrderSummary.tsx`: el detalle muestra `—` con una ventana nula.
- `apps/portal/src/components/operations/ExecutionOrderSummary.spec.tsx`: caso de resumen con `schedule.window: null`.

## Evidencia de gates (§4)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal typecheck` | **PASS**, salida 0. |
| `turbo run test --filter=@iwana/portal --force -- --runInBand --no-cache src/components/operations` | **PASS**; 27 suites y 366 pruebas aprobadas; `Cached: 0 cached, 2 total` (se ejecutaron `@iwana/shared:build` y `@iwana/portal:test`). |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations/ExecutionOrdersTable.tsx apps/portal/src/components/operations/ExecutionOrderSummary.tsx` | **PASS**; `audit-ui: sin hallazgos en las rutas analizadas.` |
| `git diff --check` sobre los cuatro archivos de implementación y prueba | **PASS**, sin errores de whitespace. |

Jest imprimió advertencias existentes de `act(...)` desde `ExecutionOrdersToolbar.tsx:89`; no falló ninguna prueba. También aparecieron avisos de configuración de `ts-jest` y deprecación de `punycode`, sin impacto en el resultado.

## Derefs pendientes y deuda

El typecheck no señaló otros derefs de `schedule.window` que deban documentarse. La búsqueda en `apps/portal/src` encontró las dos lecturas de los componentes de este hotfix; ambas ahora están protegidas por una comprobación de nulidad. No queda un deref adicional sin arreglar.

No se amplió el alcance a ordenación ni a la presentación de E4 de Ola 2b. Sin bloqueos ni consultas pendientes.

## Stop/go

**GO.** La bandeja y el resumen toleran `window: null`, los dos casos nuevos están incluidos en la suite real, y no se añadió copy ni se alteró la estructura de la consola.

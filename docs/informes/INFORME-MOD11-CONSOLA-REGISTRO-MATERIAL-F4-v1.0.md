# Informe MOD11 — Consola de registro de material F4

**Fecha:** 2026-10-11  
**Resultado:** GO F4  
**Commit/PR:** no creados.

## Hallazgos y correcciones

- La tarjeta serializada usaba `Serial {serial}` como título cuando faltaban marca y modelo, y volvía a mostrar el mismo serial en la descripción. Ahora usa el título del maestro: marca + modelo tal como están guardados, o el nombre/referencia del artículo si falta alguno. Debajo aparece el serial una sola vez y la MAC solo cuando existe. Si el título ya contiene el serial, se omite la repetición.
- La expresión regular que cambiaba manualmente `TP Link` a `Tp Link` fue eliminada. La tarjeta conserva la grafía del maestro.
- Se recuperó el SKU junto al estado en la metadata de la tarjeta (`{SKU} · {estado}`). Se conserva el comportamiento de equipos sin serial: solo MAC o sin identificadores se muestran deshabilitados con su motivo, sin repetir la MAC.
- La fila consumible muestra el saldo localizado con su unidad; el campo de cantidad incluye la unidad y los nombres accesibles de −/+ indican cuánto ajustan. Las unidades de conteo mantienen cantidades enteras. Las unidades físicas admiten dos decimales, de acuerdo con la precisión del ledger, y se limita el valor al saldo disponible.

## Pruebas añadidas y actualizadas

- Se actualizaron las expectativas obsoletas en `ExecutionOrderMaterialAction.spec.tsx`, `ExecutionOrderMaterialConsole.spec.tsx` y `ExecutionOrderDrawer.spec.tsx` para el orden título → serial/MAC → SKU/estado y las unidades en las etiquetas de cantidad y controles.
- Se añadió cobertura para un artículo sin marca/modelo: usa el nombre del artículo como título, muestra la referencia y SKU, y el serial aparece una sola vez.
- Se añadió cobertura para Fibra Drop en metros: el saldo se presenta en metros, el campo y −/+ nombran la unidad, el paso permite centésimas y se registra `1.25` sin truncarlo.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm exec jest src/components/operations --no-cache --runInBand --silent` (`apps/portal`) | **45 suites, 785/785 tests aprobados** |
| `pnpm exec jest src/lib/api-client.spec.ts --no-cache --runInBand --silent` (`apps/portal`) | **1 suite, 18/18 tests aprobados** |
| `pnpm typecheck --force` | **8/8 tareas exitosas; 0 en caché** |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx` | **Sin hallazgos** |

Antes de la corrección, `operations/` tenía 22 fallos en tres suites. Tras ella, las tres suites afectadas pasaron 193/193 tests y el gate completo pasó 785/785. Jest mostró avisos preexistentes de `ts-jest` (`allowJs`) y Node (`punycode`); no afectaron los resultados.

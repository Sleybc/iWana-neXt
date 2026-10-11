# Informe MOD11 — Consola de registro de material F3c

**Fecha:** 2026-10-11  
**Resultado:** GO F3c  
**Commit/PR:** no creados.

## Cambios

- Las tarjetas de activos serializados muestran `Serial {serial}` como título. La línea `MAC {mac}` aparece debajo solo cuando existe, antes de la referencia. Los activos que solo tienen MAC usan `MAC {mac}` como título y conservan el estado deshabilitado y el motivo de F3b. También se conserva el caso sin identificadores.
- El resumen del pie muestra `Serial {serial}` y añade `· MAC {mac}` únicamente si el activo seleccionado tiene MAC.
- `Registrar equipo` y `Cancelar` están juntos en una fila del pie sticky. La causa del hueco era `pb-28` en el formulario, que reservaba 7rem, junto con el Cancelar genérico que `RequirementActionSheet` ubicaba fuera del pie. Se quitó esa reserva y el slot de consumo administra Cancelar dentro del mismo pie; el padre oculta su botón duplicado solo para formularios de consumo.
- No se cambió el contrato de `RadioCardGroup`.

## Especificaciones

`ExecutionOrderMaterialAction.spec.tsx` verifica el prefijo `Serial`, la presencia condicional de `MAC` en tarjeta y resumen, el título del caso solo-MAC, los motivos deshabilitados de F3b, y que registro y cancelación comparten el pie sticky sin `pb-28`. `ExecutionOrderSlots.contract.spec.tsx` actualiza el doble del slot para incluir el botón Cancelar del propio formulario.

## Verificación responsive

Con la consola real abierta en el navegador autenticado, se seleccionó un equipo sin enviar el registro. Se emuló el viewport a 375×812 y 1280×812; en ambos tamaños se comprobó el DOM renderizado. Los dos botones miden 44 px de alto, conservan la misma coordenada Y y caben en el ancho del pie:

| Viewport | `Registrar equipo` (x, y, ancho) | `Cancelar` (x, y, ancho) | Ancho del pie |
| --- | ---: | ---: | ---: |
| 375×812 | 34.4, 734.4, 147.5 px | 189.9, 734.4, 97 px | 339.2 px |
| 1280×812 | 546.4, 598.2, 147.5 px | 701.9, 598.2, 97 px | 732 px |

El viewport original se restauró y la hoja se cerró con Cancelar. No se envió ningún registro.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal exec jest src/components/operations/ --runInBand --no-cache` | 45 suites, 784 tests aprobados |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx apps/portal/src/components/operations/RequirementActionSheet.tsx` | Sin hallazgos |

Jest mostró warnings de `ts-jest` (`allowJs`), `punycode` y React `act(...)` en pruebas del listado; no afectaron los resultados.

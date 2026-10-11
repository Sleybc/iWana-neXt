# Informe MOD11 — Consola de registro de material F3

**Fecha:** 2026-10-11  
**Resultado:** GO F3  
**Commit/PR:** no creados.

## Cambios

- En `ExecutionOrderMaterialAction.tsx`, el serial ocupa el título de la tarjeta, con tipografía monoespaciada y mayor peso. Debajo aparece `MAC {mac}` o `MAC no registrada`, seguido de la referencia y de `SKU · estado`.
- Al seleccionar un equipo, el pie fijo muestra `{serial} · MAC {mac}` sobre el botón `Registrar equipo {serial}`.
- `requirementActionLabel` toma la etiqueta del requisito del snapshot y forma `Registrar {requisito}`. No depende de claves concretas; por ejemplo, produce `Registrar materiales usados en la instalación`.
- No se modificó el contrato de `RadioCardGroup`.

## Especificaciones

Las pruebas cubren los cuatro puntos solicitados:

1. Serial como título en fuente monoespaciada y negrita, con MAC y luego referencia, SKU y estado.
2. Copy accesible `MAC no registrada` cuando el activo no tiene MAC.
3. Resumen de serial/MAC inmediatamente encima del botón con el serial.
4. Etiqueta de acción generada desde un requisito con clave arbitraria y el texto del snapshot.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal exec jest src/components/operations/ --runInBand --no-cache` | 45 suites, 782 tests aprobados |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx apps/portal/src/components/operations/execution-order-actions.ts` | Sin hallazgos |

Jest mostró warnings de `ts-jest` (`allowJs`), `punycode` y React `act(...)`; no afectaron los resultados.


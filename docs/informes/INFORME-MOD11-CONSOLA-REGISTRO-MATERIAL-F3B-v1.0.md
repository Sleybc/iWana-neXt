# Informe MOD11 — Consola de registro de material F3b

**Fecha:** 2026-10-11  
**Resultado:** GO F3b  
**Commit/PR:** no creados.

## Cambios

La hoja conserva ahora todos los activos serializados compatibles, incluidos los que no tienen serial. Las opciones de `RadioCardGroup` muestran los identificadores disponibles y aplican los motivos de bloqueo del contrato:

| Datos del activo | Presentación | Estado |
| --- | --- | --- |
| Serial y MAC | Serial como título; MAC y referencia debajo | Habilitado |
| Solo serial | Serial como título; referencia debajo | Habilitado |
| Solo MAC | MAC como título; referencia debajo y motivo visible | Deshabilitado |
| Sin serial ni MAC | «Equipo sin identificar», referencia y motivo visible | Deshabilitado |

Se retiró «MAC no registrada». El pie solo incluye la MAC cuando existe; no permite enviar un activo sin serial. La búsqueda sigue cubriendo serial y MAC. Se eliminaron los selectores descendientes y no se modificó `RadioCardGroup`.

El serial se mantiene como título, conforme a la tabla de presentación de la adenda 5, y no se forzó tipografía monoespaciada. Se solicita a DS-OWNER considerar en RadioCardGroup v1.1 una propiedad contractual para estilo monoespaciado del título si la identidad visual del serial lo requiere. La prop `meta` sigue mostrando SKU y estado.

## Especificaciones

`ExecutionOrderMaterialAction.spec.tsx` cubre los cuatro casos de identificación, sus estados seleccionables/deshabilitados y los motivos accesibles. También verifica que desapareció «MAC no registrada», que el pie no añade una MAC ausente y que no quedan selectores descendientes en el marcado.

## Gates

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/portal exec jest src/components/operations/ --runInBand --no-cache` | 45 suites, 784 tests aprobados |
| `pnpm typecheck --force` | 8 tareas exitosas, 0 cacheadas |
| `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx` | Sin hallazgos |

Jest mostró warnings de `ts-jest` (`allowJs`), `punycode` y React `act(...)`; no afectaron los resultados.


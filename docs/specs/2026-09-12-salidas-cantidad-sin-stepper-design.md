# Salidas de inventario — la cantidad se edita por tipeo, sin stepper −/+ (cambio de diseño)

**Fecha:** 2026-09-12 · **Estado:** Aprobado por el solicitante (2026-09-12, sesión de trabajo MOD12 salidas) · **Sustituye parcialmente a:** spec `2026-09-08-composer-buscar-y-agregar-design.md` (que declaraba «el stepper −/+ … no cambia»)

## Problema

En «Líneas seleccionadas» del composer de salidas, la celda Cantidad usaba un stepper −/+ con botones de 44 px y un input sin ancho fijo (`w-full` colapsable entre dos botones `shrink-0`): en columnas angostas el input colapsaba a casi cero y **la cantidad no era visible** (hallazgo P1 de usabilidad, verificado contra el `Input` de `@iwana/ui`, cuyo `<input>` es `flex h-10 w-full` sin `min-width`). Era además el único stepper del portal y el único input de cantidad colapsable; el resto de las tablas usa anchos fijos (`w-20` compras, `w-24` adjudicación/reposición, `w-28` conteos).

## Decisión (opción B de tres evaluadas)

1. **Se elimina el stepper −/+** de la fila. La cantidad se edita por tipeo en un input de **ancho fijo `w-16`**, centrado y con `tabular-nums` (`inputMode="decimal"` se conserva para el teclado numérico). Paridad visual con el Borrador de compras.
2. **Líneas serializadas sin cambio:** la cantidad sigue siendo texto de solo lectura — la fija el grupo de seriales y se ajusta con «Modificar».
3. **Sin cambio de comportamiento:** validaciones, error «Supera el material disponible…», estado busy, edición masiva, barra de selección y «Modificar» permanecen idénticos. `stepDraftQuantity` se elimina por quedar sin uso.

## Alternativas descartadas

- **Compactar el stepper** (botones 36 px con área táctil extendida + input `w-14` fijo): viable, pero mantiene dos anatomías de edición de cantidad en el repo y conserva la fricción visual señalada.
- **Pill unificada** (− valor + dentro de un solo control con borde): requiere primitive nueva en `@iwana/ui` (esfuerzo L, revisión DS-OWNER) para un beneficio marginal en una celda.

## Consecuencias

- El ajuste rápido ±1 pasa a hacerse por teclado o con la edición masiva existente («Aplicar cantidad»).
- El spec `2026-09-08` queda actualizado en su punto de anatomía de fila: «el stepper −/+» pasa a «input de cantidad de ancho fijo»; el resto de la frase (edición masiva, «Agregar línea manual», panel y «Modificar») sigue vigente.
- Vocabulario sin cambios: «Cantidad», «Unidad», «Modificar», «Quitar» y el mensaje de saldo ya cumplen el vocabulario canónico.

## Verificación

`StockIssueDraftLinesTable.spec` (tests de stepper reemplazados por: edición por tipeo sin botones, busy, serializada como texto) · suite inventory del portal completa · `tsc` portal · lint · script `audit-ui.mjs` sobre los archivos tocados.

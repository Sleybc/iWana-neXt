# INFORME - MOD09 Bugfix: Opciones territoriales duplicadas en `Select`

**Version:** v1.0  
**Estado:** Cerrado  
**Fecha:** 2026-08-22

## Problema

La bandeja de visitas pendientes mostraba el error de React por claves repetidas
`__missing__` al renderizar el selector de sector.

## Causa raíz

El endpoint de opciones territoriales agrupa los sectores por sector y municipio.
La bandeja conserva únicamente el valor del sector para construir un selector
global, por lo que el mismo sector puede llegar varias veces. El valor sentinel
`__missing__` hacía visible el problema cuando existían solicitudes sin sector en
más de un municipio.

`packages/ui/src/components/Select.tsx` usa el valor de cada opción como clave del
`<option>`, por lo que pasar valores repetidos produce el warning y deja el filtro
ambiguo.

## Corrección

`apps/portal/src/components/scheduling/PendingVisitRequestInbox.tsx` ahora
consolida las opciones territoriales por `value`, conserva el primer label
presentado y suma los conteos de las filas agrupadas. Así cada selector recibe un
valor único y el conteo representa el total del sector en todos los municipios.

No se cambió la clave interna de `Select`, porque eso ocultaría el warning sin
resolver la ambigüedad del filtro.

## Validación

- Regresión en `PendingVisitRequestsView.spec.tsx`: verifica que dos opciones
  `__missing__` y dos opciones `Chapinero` se convierten en una opción cada una,
  con conteos acumulados.
- Suites relacionadas: 2 suites y 6 pruebas en verde.
- Typecheck de `@iwana/portal`: sin errores.
- Lint de `@iwana/portal`: 0 errores; permanecen 48 warnings preexistentes fuera
  de esta corrección.

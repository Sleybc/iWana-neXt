# Refinamiento visual — CRM expediente vista general

- **Version:** v1.0
- **Estado:** Aprobado
- **Fecha:** 2026-05-05

## Contexto

La vista `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` muestra un bloque superior de resumen con barra de progreso y estados por seccion, seguido por una grilla de tarjetas que repite la misma informacion de completitud por seccion.

## Problema

La pantalla de `vista general` se siente sobrecargada porque:

1. la barra superior ya comunica el progreso global y el estado de cada seccion,
2. las tarjetas inferiores duplican el mismo mensaje en una superficie pensada como resumen rapido,
3. el detalle por seccion ya vive dentro del workspace del expediente y no necesita repetirse en esta vista.

## Objetivo

Reducir densidad visual en `vista general` para que funcione como resumen ejecutivo rapido, sin tocar la logica de completitud ni el backend.

## Decision aprobada

Se elimina por completo la grilla de tarjetas renderizada desde `sectionCompleteness.map(...)` y se conserva un unico bloque de resumen con:

1. titulo `Resumen de la oportunidad`,
2. contador de secciones completas,
3. barra de progreso general,
4. estados por seccion dentro del `ProgressMeter`.

Tambien se conservan sin cambios:

1. el bloque de readiness / pendientes principales,
2. el bloque de informacion del caso.

## Alcance

### Incluye

- remocion de la grilla de tarjetas por seccion en `vista general`,
- mantenimiento del progreso y estados por seccion como unica fuente visual de resumen,
- ajuste menor de espaciado si es necesario despues de remover la grilla.

### No incluye

- cambios en reglas de completitud,
- cambios en contratos backend,
- nuevos widgets de resumen,
- mover detalle de pendientes a otra superficie.

## Impacto esperado

- menor ruido visual,
- mejor jerarquia de informacion,
- lectura mas rapida del estado general del expediente,
- menos redundancia entre resumen y detalle.

## Implementacion prevista

1. editar `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`,
2. remover el bloque de cards ubicado despues del `ProgressMeter`,
3. validar que el layout restante mantenga espaciado coherente.

## Riesgos y mitigacion

- **Riesgo:** perder visibilidad rapida de conteos por seccion.  
  **Mitigacion:** el `ProgressMeter` ya muestra el porcentaje de cada seccion y el detalle sigue disponible en el resto del expediente.

- **Riesgo:** dejar un hueco visual por la remocion del bloque.  
  **Mitigacion:** ajustar espaciado local en el mismo contenedor si el resultado lo requiere.

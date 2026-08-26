# Diseno WFM - Cancelar recomendaciones

## Objetivo

Permitir que el usuario descarte las recomendaciones calculadas cuando ninguna
le sirve, dejando el Drawer limpio y conservando los datos del paso 1 para
repetir la búsqueda.

## Alcance

- Agregar la acción visible `Cancelar recomendaciones` debajo de la lista.
- Mostrarla solo cuando existan recomendaciones calculadas.
- Limpiar la lista y la recomendación seleccionada en el contenedor propietario.
- Conservar contexto, duración, horizonte de búsqueda y el flujo de agenda
  manual.
- No ejecutar una llamada API adicional al cancelar.

## Contrato de estado

`VisitRequestRecommendationPanel` recibirá una callback opcional para cancelar
las recomendaciones. `PendingVisitRequestsView` y `SchedulingClient` serán
responsables de poner la lista en `[]` y la selección en `null`, porque ambos
son propietarios del estado según el modo de uso actual.

La accion no modifica `durationMinutes`, `searchHorizonDays`, `contextDraft`, ni
`manualSelectionDraft`.

## Experiencia

- El botón usa una acción secundaria, con foco visible y texto explícito.
- Después de cancelar, se muestra nuevamente el estado vacío existente y queda
  disponible `Calcular recomendaciones`.
- El usuario puede volver a calcular sin perder los criterios ya definidos.

## Validación

- Prueba del panel: el botón aparece con resultados y no aparece sin resultados.
- Prueba del panel: al pulsarlo se ejecuta la callback y no se modifica la
  sección de agenda manual.
- Typecheck, lint y pruebas específicas del portal deben pasar.

## Decisiones descartadas

- Ocultar la lista solo dentro del panel, porque dejaría la selección viva en
  el contenedor padre.
- Hacer una llamada API para devolver una lista vacía, porque cancelar es una
  operación local.

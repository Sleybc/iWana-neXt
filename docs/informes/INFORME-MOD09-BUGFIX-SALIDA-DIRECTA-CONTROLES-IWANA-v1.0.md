# Informe MOD09 — Alineacion de controles de salida directa

## Problema

La salida directa del despacho usaba controles nativos `input[type="date"]` e
`input[type="time"]`. Sus calendarios y relojes dependian del navegador y no
respetaban el lenguaje visual ni la navegacion accesible de iWana.

## Correccion

- `Fecha` usa el `DatePicker` oficial de `@iwana/ui`.
- `Hora de inicio` usa `TimeFieldSelect`, el selector iWana de 24 horas, ahora
  promovido a `components/shared` para reutilizarlo fuera de Configuracion.
- Los consumidores existentes de Configuracion fueron actualizados a la
  ubicacion compartida.
- Se conservaron los valores de dominio `YYYY-MM-DD` y `HH:mm`, junto con las
  validaciones de ventana operativa y confirmacion manual.
- La duracion visible ahora sigue el patron existente de iWana: duraciones
  rapidas y una opcion personalizada con campos `Horas` y `Minutos`.
- La duracion se define una sola vez en el paso de contexto y busqueda; la
  agenda manual solo muestra un resumen de la duracion aplicada.
- Las horas sugeridas quedaron como atajos secundarios y solo aparecen cuando
  existe una ventana operativa abierta con opciones validas.
- El payload conserva `durationMinutes` para mantener el contrato tecnico y el
  calculo exacto en incrementos de 15 minutos.

## Validacion

- Salida directa y selector compartido: 46 pruebas en verde.
- Configuracion afectada: 37 pruebas en verde.
- Typecheck de `@iwana/portal`: sin errores.
- Build de `@iwana/portal`: exitoso.
- Lint: 0 errores; permanecen warnings preexistentes.
- Auditoria de identidad UI: sin hallazgos.
- Validacion funcional en navegador: fecha abre el calendario iWana y hora abre
  un popover con columnas accesibles de hora y minutos, sin controles nativos;
  la duracion muestra las acciones `Duracion rapida` y `Personalizada`.

## Refinamiento de flujo

- La duracion rapida y personalizada viven en un unico control del paso 1.
- La salida manual reutiliza esa seleccion y evita una segunda edicion de
  duracion dentro del formulario.
- La lista de recomendaciones calculadas incluye `Cancelar recomendaciones`;
  la accion limpia la lista y su seleccion sin perder los criterios del paso 1
  ni el borrador de agenda manual.
- Pruebas especificas del panel: 8 en verde, incluida la cancelacion de
  recomendaciones.
- Typecheck de `@iwana/portal`: sin errores.
- Prettier: archivos alineados.
- Lint del panel: 0 errores; permanecen 3 warnings preexistentes de
  dependencias de hooks.

## Contexto desde la oportunidad

- El flujo de coordinacion desde una oportunidad ya transporta la direccion
  operativa y el municipio; se corrigio el hueco que descartaba el sector antes
  de crear la solicitud WFM.
- `Sector / Barrio` de la oportunidad es la fuente de `sector`; `zoneType` no se
  usa como sustituto porque representa el tipo de zona, no el sector.
- El paso 2 precarga los tres valores persistidos en la solicitud: direccion
  operativa, municipio y sector.
- Se cubrieron el payload de creacion desde CRM y la precarga visual del paso 2
  con pruebas automatizadas.

## Cierre de hidratacion CRM

- Las solicitudes CRM existentes que llegan a la agenda sin contexto completo
  ahora consultan la oportunidad asociada antes de abrir el despacho.
- La hidratacion completa solo campos vacios: conserva direccion, municipio y
  sector ya persistidos en la solicitud WFM.
- La fuente canonica del sector sigue siendo `neighborhood` (`Sector / Barrio`);
  `zoneType` no participa en la asignacion.
- La normalizacion compartida se usa en la bandeja de pendientes y en la agenda
  detallada para evitar divergencias entre ambos accesos.

## Validacion de cierre

- `SchedulingClient`, `PendingVisitRequestsView` y
  `VisitRequestRecommendationPanel`: 34 pruebas en verde.
- `pnpm typecheck`: 8 paquetes exitosos, sin errores.
- `pnpm --filter @iwana/portal lint`: 0 errores; permanecen 48 warnings
  preexistentes de hooks y tipado.
- Validacion funcional en navegador: la bandeja y la agenda detallada muestran
  el sector real `Ipm Santandercito` en el resumen territorial y en el campo
  editable `Sector` del paso 2.

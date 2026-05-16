# SPEC - MOD09 Bandeja de visitas pendientes UX operativa

**Version:** 1.1  
**Estado:** En revisión  
**Fecha:** 2026-05-15  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Modulo:** MOD09 Programacion / WFM  
**Spec base aprobada:** docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**ADR aprobado:** docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md  
**Prompt base:** docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md  
**Informe vivo:** docs/informes/INFORME-MOD09-FASE-02-v1.0.md

---

## 1. Proposito

Refinar la experiencia operativa de `/dashboard/scheduling/pending-visits` despues de la primera revision visual en navegador. La implementacion actual ya materializa `VisitRequest`, calcula recomendaciones y agenda, pero la pantalla mezcla bandeja, matriz y despacho en tres columnas angostas. El resultado es confuso para operar 20+ tecnicos o 50+ solicitudes pendientes.

Esta spec no cambia el boundary ni la decision de ADR-039: WFM sigue siendo owner de `VisitRequest`. El ajuste se concentra en UX, contrato de filtros territoriales, flujo de recomendacion y consistencia al abrir solicitudes desde CRM.

## 2. Problemas observados

| Hallazgo | Impacto |
| --- | --- |
| Bandeja con filtros territoriales como texto libre | Municipio y sector aparecen vacios y no guian al operador. |
| Tres columnas simultaneas | La matriz semanal queda demasiado estrecha y no se puede leer bien. |
| Matriz semanal pasiva | Muestra capacidad, pero no queda claro como seleccionar una franja. |
| Despacho repite tarjeta de instalacion | Consume espacio y duplica informacion ya visible en la bandeja. |
| Flujo pide ventana antes que duracion | El operador debe adivinar fecha/hora antes de calcular recomendaciones. |
| Solicitud CRM no aparece siempre al instante | El usuario debe salir y volver a entrar para verla. |
| Cards de bandeja no escalan a 50 pendientes | Falta tabla/lista densa, conteos, prioridades y seleccion estable. |

## 3. Principios de rediseño

- La pantalla debe separar modos de trabajo: `Bandeja`, `Recomendar` y `Confirmar`.
- La bandeja debe priorizar escaneo masivo, no detalle completo.
- La matriz debe usarse como superficie de decision, no solo como referencia visual.
- La duracion de la tarea se captura antes de pedir recomendaciones.
- La fecha/hora se elige desde recomendaciones o matriz, no como requisito previo obligatorio.
- `SALES` conserva modo CRM asistido; la bandeja global y manual siguen reservadas para Operaciones.
- Todo texto visible permanece en español y con labels de negocio, no enums crudos.

## 4. UX objetivo

### 4.1 Layout general

Reemplazar el layout fijo de tres columnas por una consola en dos zonas:

1. **Zona principal:** bandeja o matriz, ocupando la mayor parte del ancho.
2. **Panel lateral derecho:** detalle contextual de la solicitud seleccionada.

Estados de pantalla:

- `Bandeja`: lista densa de solicitudes + filtros superiores.
- `Recomendacion`: matriz semanal amplia + lista de recomendaciones.
- `Confirmacion`: dialog compacto para confirmar tecnico, fecha, hora, duracion y Work Order.

### 4.2 Bandeja densa

La bandeja debe soportar 50+ pendientes sin obligar a leer cards largas.

Formato preferido:

- Tabla o lista densa con filas de altura estable.
- Columnas minimas:
  - prioridad
  - estado
  - origen
  - titulo operativo
  - referencia visible
  - municipio
  - sector
  - SLA o fecha de creacion
  - faltantes
- La fila seleccionada abre o actualiza el panel lateral.
- Cards actuales pueden mantenerse solo en mobile.

### 4.3 Filtros territoriales

`Municipio` y `Sector` deben ser selectores/autocomplete, no inputs libres por defecto.

Reglas:

- `Municipio` muestra opciones disponibles para el tenant con conteo.
- `Sector` depende del municipio seleccionado cuando exista.
- Debe existir opcion `Sin municipio` y `Sin sector` para detectar solicitudes incompletas.
- Si no hay catalogo disponible, se usan valores distintos presentes en `visit_requests` activas.
- El operador puede limpiar filtros rapidamente.

Contrato recomendado:

`GET /api/v1/wfm/visit-requests/filter-options`

Query opcional:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `municipality` | string opcional | Devuelve sectores de un municipio especifico. |
| `includeScheduled` | boolean opcional | Incluye solicitudes ya agendadas si se requiere analisis historico. Default `false`. |

Respuesta:

```json
{
  "municipalities": [
    { "value": "El Colegio", "label": "El Colegio", "count": 12 }
  ],
  "sectors": [
    { "value": "Vda la Virginia", "label": "Vda la Virginia", "municipality": "El Colegio", "count": 4 }
  ]
}
```

La fuente inicial debe ser WFM (`visit_requests`) para respetar boundaries. No leer tablas CRM ni Assurance.

### 4.4 Panel lateral de solicitud

El panel lateral debe mostrar solo informacion necesaria para decidir:

- titulo operativo
- referencia visible
- estado y faltantes
- direccion
- municipio
- sector
- prioridad
- tipo de trabajo
- nota operativa

La tarjeta repetida de instalacion debe compactarse. No debe duplicar toda la card de bandeja.

## 5. Flujo de recomendacion

### 5.1 Captura de duracion primero

Antes de calcular recomendaciones, el usuario debe indicar la duracion estimada de la tarea.

Campos del panel:

- `Duracion estimada`: presets `30 min`, `1 h`, `1 h 30 min`, `2 h`, `3 h`, `4 h` y opcion manual.
- `Horizonte de busqueda`: `Hoy`, `Proximos 3 dias`, `Esta semana`, `Proximos 14 dias`.
- `Municipio` y `Sector`: editables/autocomplete.
- `Direccion operativa`: obligatoria para `READY_TO_SCHEDULE` si no hay coordenadas.

La ventana exacta `requestedWindowStartAt` / `requestedWindowEndAt` deja de ser requisito visual primario. Se deriva desde el horizonte de busqueda, salvo que el origen traiga una ventana comprometida.

### 5.2 Reglas de readiness

Una solicitud puede recomendarse si tiene:

- tipo de trabajo
- duracion estimada valida
- municipio
- direccion o coordenadas
- al menos un tecnico elegible

Si falta sector, el sistema puede recomendar por municipio, pero debe advertir menor precision.

### 5.3 Recomendaciones

Al calcular recomendaciones:

- La matriz semanal cambia a modo amplio.
- Se resaltan franjas sugeridas por tecnico y dia.
- Las recomendaciones y la matriz comparten la misma seleccion.
- Seleccionar una recomendacion desde la lista resalta la franja en matriz.
- Seleccionar una franja en matriz selecciona la recomendacion equivalente o crea una seleccion manual si no viene del ranking.

### 5.4 Matriz interactiva

La matriz debe permitir accion directa:

- Celda con disponibilidad: abre franjas disponibles del dia/tecnico.
- Franja recomendada: boton `Usar esta franja`.
- Eventos existentes: se muestran compactos con hora y tipo.
- Bloqueos: se muestran como no seleccionables.
- Tecnico seleccionado queda resaltado.

La matriz debe tener:

- columnas con ancho minimo legible
- scroll horizontal estable
- cabecera sticky
- columna tecnico sticky
- modo compacto para 10+ tecnicos
- opcion de cambiar rango semanal

## 6. Flujo CRM y refresco inmediato

Cuando el usuario ejecuta `Agendar instalacion` desde CRM:

1. Portal navega a `/dashboard/scheduling/pending-visits?expedienteId=...`.
2. `PendingVisitRequestsView` valida el expediente.
3. Crea o recupera la `VisitRequest` CRM activa.
4. Limpia filtros que puedan ocultar la solicitud.
5. Refresca la bandeja o inserta la solicitud en memoria local.
6. Selecciona automaticamente la solicitud creada/recuperada.
7. Limpia el query y conserva `visitRequestId` en estado o URL si hace falta.

Criterio observable: la solicitud debe aparecer y quedar seleccionada sin salir y volver a entrar.

Si la solicitud ya existia, mostrar mensaje: `Ya existia una solicitud pendiente para esta oportunidad.`

## 7. Contratos y cambios tecnicos

### 7.1 Backend

Agregar endpoint:

- `GET /api/v1/wfm/visit-requests/filter-options`

Reglas:

- Protegido para roles con acceso a bandeja global.
- `SALES` no consume bandeja global; si se decide permitirlo en modo CRM, debe requerir `originContext=CRM` y referencia especifica.
- Query tenant-aware con `runInTenantSchema()`.
- No leer CRM/Assurance.
- Excluir terminales por defecto: `SCHEDULED`, `CANCELLED`, `REJECTED`, `EXPIRED`.

Actualizar recomendacion por solicitud:

- Aceptar `durationMinutes` como dato principal.
- Aceptar `searchHorizonDays` o resolver `windowStartAt/windowEndAt` desde el frontend.
- Permitir recomendar sin `requestedWindowStartAt/requestedWindowEndAt` persistidos si el request trae horizonte valido.

### 7.2 Portal

Componentes afectados:

- `PendingVisitRequestsView.tsx`
- `PendingVisitRequestInbox.tsx`
- `WeeklyTechnicianMatrix.tsx`
- `VisitRequestRecommendationPanel.tsx`
- `ScheduleVisitRequestConfirmDialog.tsx`
- `apps/portal/src/lib/api-client.ts`

Cambios esperados:

- bandeja en tabla/lista densa
- filtros horizontales con selectores territoriales
- panel lateral compacto
- duracion antes de recomendaciones
- matriz interactiva y amplia
- refresco inmediato del flujo CRM
- pruebas unitarias y E2E actualizadas

## 8. Criterios de aceptacion

- CA-BVP-UX-01: La bandeja muestra 50 solicitudes de forma escaneable sin cards largas en desktop.
- CA-BVP-UX-02: Estado, origen, prioridad, municipio y sector son filtros claros; municipio/sector usan opciones disponibles con conteos.
- CA-BVP-UX-03: Al abrir una oportunidad desde CRM, la solicitud aparece seleccionada sin salir y volver a entrar.
- CA-BVP-UX-04: El panel de despacho pide duracion antes de calcular recomendaciones.
- CA-BVP-UX-05: El usuario puede calcular recomendaciones sin ingresar manualmente fecha/hora exacta cuando existe horizonte de busqueda valido.
- CA-BVP-UX-06: La matriz semanal ocupa ancho suficiente y permite seleccionar o usar una franja.
- CA-BVP-UX-07: La seleccion de recomendacion y matriz queda sincronizada.
- CA-BVP-UX-08: La tarjeta repetida de instalacion se reduce a resumen compacto en el panel lateral.
- CA-BVP-UX-09: `SALES` mantiene modo CRM asistido y no accede a bandeja global/manual.
- CA-BVP-UX-10: Tests frontend, backend y Playwright cubren filtros territoriales, refresco CRM, duracion primero y seleccion desde matriz/recomendacion.

## 9. No objetivos

- Mapa operativo.
- Drag-and-drop real de agenda.
- Optimizacion de ruta con trafico.
- IA predictiva.
- Nuevo catalogo maestro territorial si no existe fuente aprobada.
- Cambiar el ownership de `VisitRequest` fuera de WFM.
- Leer tablas CRM o Assurance desde WFM para poblar filtros.

## 10. Stop/go

Detener ejecucion y escalar si:

- Se necesita cambiar ADR-039 o mover ownership de `VisitRequest` fuera de WFM.
- El filtro territorial exige leer directamente tablas CRM/Assurance.
- La solucion requiere mapa, drag-and-drop o motor externo de rutas para cumplir esta fase.
- No se puede garantizar que CRM seleccione la solicitud creada/recuperada sin duplicarla.
- La matriz interactiva compromete accesibilidad basica de teclado/foco.

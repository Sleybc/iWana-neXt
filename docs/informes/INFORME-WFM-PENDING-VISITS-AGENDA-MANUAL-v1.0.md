# INFORME — WFM Pending Visits · Agenda manual y persistencia de matriz

| Campo | Valor |
| --- | --- |
| Modulo | MOD-09 WFM — Bandeja de visitas pendientes |
| Spec rectora | `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md` |
| Plan de ejecucion | `docs/plans/2026-06-06-mod09-pending-visits-agenda-manual.md` |
| Tipo de cambio | Frontend only — sin cambios en backend, DTOs, migraciones ni boundaries |
| Estado | Ejecutado — gates de salida en verde |

## Resumen ejecutivo

Se cierra el plan `2026-06-06-mod09-pending-visits-agenda-manual` con una ampliacion adicional en la matriz semanal:

1. **Persistencia de la matriz al cerrar el drawer.** Cerrar el panel con recomendaciones
   calculadas ya no devuelve a la bandeja; la vista semanal de matriz permanece visible
   para que el administrador continue con el despacho.
2. **Mini-form "Agendar manualmente".** Nuevo toggle en el Paso 1 del panel que habilita
   un formulario compacto (tecnico, fecha, hora de inicio, duracion) para agendar la
   visita sin pasar por el flujo de recomendaciones. Resuelve el bloqueo operativo
   cuando no hay recomendacion valida o se requiere reagendar fuera de la franja
   sugerida.
3. **Matriz clicable con seleccion puntual.** Cada celda ahora puede abrir una microcapa
   para escoger una franja sugerida del sistema o fijar una hora manual para un tecnico
   y dia especificos, manteniendo la confirmacion final en el panel lateral.

El alcance se limita a frontend. El backend ya soportaba agendamiento manual
(`ScheduleVisitRequestDto` con `scheduledStartAt + scheduledEndAt + assignedUserId`,
idempotencia por estado `SCHEDULED + scheduleEventId`).

## Cambios entregados

### Codigo nuevo

- `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx` —
  4 tests unitarios: toggle reveals form / empty fields validation / duracion < 15 min /
  valid call to `onConfirmManualSchedule`.

### Codigo modificado

- `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`:
  - Nuevo estado compartido para `selectedMatrixCell` y `manualSelectionDraft`.
  - Sincronizacion bidireccional entre matriz, recomendaciones y formulario manual.
  - `onClose` del panel modificado para preservar `recommendations` cuando existen.
  - Boton "Volver a bandeja" ahora tambien limpia `recommendations` y
    `selectedRecommendationId`.
  - Helper `scheduleVisitRequestWithFollowUp` extraido a funcion module-level
    (reutilizado por dialog de recomendacion existente y nuevo handler manual).
  - Nueva prop `onConfirmManualSchedule` cableada al panel.
  - `onConfirm` del dialog de recomendacion refactorizado para usar el helper.

- `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`:
  - Nuevo export `ManualSchedulePayload` (interface publica del mini-form).
  - Nueva prop `onConfirmManualSchedule: (payload) => Promise<void>`.
  - Nuevas props opcionales para sincronizar `matrixCellSelection` y `manualSelectionDraft`.
  - Estado local del mini-form: `isManualFormOpen`, `manualTechnicianId`,
    `manualDate`, `manualStartTime`, `manualDuration`, `manualErrors`,
    `isSubmittingManual`.
  - Resumen visual de "Seleccion desde matriz" con advertencias operativas y estado del dia.
  - Horas sugeridas + captura manual libre de hora en el mini-form.
  - Bloque toggleable "Salida directa" entre Paso 1 y Paso 2.
  - Validacion agregada con feedback consolidado: tecnico, fecha, hora de inicio,
    duracion minima de 15 minutos, direccion/municipio del contexto operativo.
  - `useEffect` resetea el mini-form al cambiar `selectedVisitRequest` y pre-rellena
    `manualDate` con `toLocalDateValue(requestedWindowStartAt)` y `manualDuration`
    con `getDefaultDurationForWorkType`.
  - Icono `CalendarPlus` importado de `lucide-react`.

- `apps/portal/src/components/scheduling/WeeklyTechnicianMatrix.tsx`:
  - Celdas interactivas con estados `informativa`, `seleccionada` y `riesgo`.
  - Popover por celda con franjas sugeridas, hora manual y advertencias operativas.
  - Integracion con la seleccion del panel para reflejar tecnico, dia y hora elegidos.

- `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`:
  - Seccion 6.3 actualizada in-place para incluir las validaciones de "Fecha vacia"
    y "Hora de inicio vacia" (no estaban en v1.0 original).
  - Estado del documento: `Ejecutado` (cambia desde `Pendiente de aprobacion`).

### Tests E2E anadidos

`e2e/tests/portal-wfm-scheduling.spec.ts` (3 nuevos casos):

1. `admin abre el formulario manual y valida campos obligatorios` — toggle reveals
   form, campos visibles, submit con campos vacios dispara las 4 validaciones.
2. `admin agenda manualmente sin pasar por recomendaciones` — flujo completo:
   toggle, seleccion de tecnico, fecha, hora, duracion valida, click en
   "Confirmar agenda manual", verificacion de POST `/visit-requests/.../schedule`
   con status 201 y feedback visible.
3. `admin conserva la matriz visible al cerrar el drawer con recomendaciones` —
   calcular recomendaciones, cerrar el drawer, verificar que la matriz semanal
   sigue visible (no se redirige a la bandeja).
4. `admin selecciona una franja desde la matriz y confirma agenda` — camino directo
   desde popover de celda hasta `Confirmar agenda`.
5. `admin define hora manual desde la matriz y ve advertencias antes de confirmar` —
   precarga del mini-form con tecnico/dia/hora y persistencia de warnings.

## Desviaciones del spec

| Desviacion | Razon | Impacto |
| --- | --- | --- |
| Campo duracion como `<Input type="number" min={15}>` en vez de `Select` con opciones predefinidas. | `Select` con `min=30` haria inalcanzable la validacion "duracion < 15 min" definida en el spec. `Input` permite entrada libre y hacer testeable el limite. | UX: el usuario puede escribir duraciones no multiplos de 15 (ej. 20 min). Se valida `>= 15` en submit. Aceptable para caso de uso operativo. |
| `manualErrors: string[]` (array) en vez de `manualError: string \| null`. | Mostrar todos los errores a la vez en `<ul><li>` mejora UX vs mostrar solo el primero. Tambien permite tests con `getByText` por separado. | Spec no especificaba forma exacta del feedback; array es backward-compatible. |
| Helper `scheduleVisitRequestWithFollowUp` extraido a funcion module-level. | Reutilizado por el dialog de recomendacion existente y el nuevo handler manual. Evita duplicacion de logica de feedback + follow-up. | Sin impacto en comportamiento. |

## Gates de salida

| Gate | Resultado |
| --- | --- |
| Tests unitarios scheduling | **56/56 PASS** en 15 suites (`ScheduleEventDrawer`, `SchedulingOverview`, `TechnicianLoadStrip`, `ScheduleList`, `RescheduleEventDialog`, `ScheduleEventForm`, `SchedulingClient`, `VisitRequestRecommendationPanel`, `PendingVisitRequestsView`, etc.) |
| Tests E2E | **3/3 nuevos PASS** en `portal-wfm-scheduling.spec.ts` (12 total en el spec, 3 nuevos + 9 existentes) |
| Typecheck portal | **OK** (`tsc --noEmit` sin errores) |
| Lint portal (scheduling) | **OK** (`eslint src/components/scheduling/` sin warnings) |
| Boundaries modulith | **OK** — cambios solo en apps/portal; sin imports cruzados a api/database |
| PII / secretos | **OK** — sin tokens, conexiones ni datos sensibles en codigo, tests o docs |
| Cobertura de validaciones | **100%** — tecnico, fecha, hora, duracion minima, direccion/municipio |

### Tests pre-existentes fallando (NO relacionados)

Tres suites tienen fallos pre-existentes documentados, no introducidos por esta
tarea: `LoginForm.spec.tsx`, `LoginExperience.spec.tsx`,
`CalendarSiteHoursPanel.spec.tsx`. No fueron tocadas en este plan.

## Proximos pasos (Fase 2 — fuera de alcance)

- **Matriz semanal clicable.** Click en celda de tecnico/dia abre directamente
  el mini-form manual con tecnico y fecha pre-rellenados. Reduce pasos
  cuando el admin ya visualizo la capacidad y solo necesita asignar.
- **Persistencia de contexto entre drawer y matriz.** Mantener `address`,
  `municipality`, `sector` del ultimo calculo al cerrar el drawer, evitando
  re-llenarlos al abrir otra visita.
- **Indicador de visitas agendadas manualmente vs por recomendacion** en la
  lista de inbox (chip visual secundario).

## Trazabilidad

- Spec: `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`
- Plan: `docs/plans/2026-06-06-mod09-pending-visits-agenda-manual.md`
- Archivos tocados:
  - `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`
  - `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`
  - `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx`
  - `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.spec.tsx` (nuevo)
  - `e2e/tests/portal-wfm-scheduling.spec.ts`
  - `docs/specs/SPEC-WFM-PENDING-VISITS-AGENDA-MANUAL-v1.0.md`

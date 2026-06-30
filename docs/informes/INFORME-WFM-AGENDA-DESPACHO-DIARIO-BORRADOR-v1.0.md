# INFORME: Despacho diario con borrador editable

**Version:** 1.1  
**Estado:** Completado  
**Fecha:** 2026-06-19  
**Modulo:** WFM Scheduling (Portal + API)  
**Spec ejecutada:** SPEC-WFM-AGENDA-DESPACHO-DIARIO-BORRADOR-EDITABLE-v1.0.md  
**Responsable de ejecucion:** Sr. Dev Fullstack

---

## 1. Resumen

La vista `Despacho diario` evoluciona de grilla consultiva con CTA lateral a mesa operativa calendar-first: arrastre directo desde pendientes, borrador editable antes de confirmar y alineacion minima entre viewport diario y ventana operativa real.

En la iteracion complementaria de la misma fecha se incorporo la **regla anti-pasado**: no se permite agendar tareas en una fecha u hora anterior al momento actual, con enforcement en API y validacion previa en portal.

---

## 2. Entregables

### Backend

1. `OperatingWindowResolverService` resuelve `SITE_HOURS` cuando existe configuracion de sede.
2. Prioridad mantenida: `HOLIDAY_BLACKOUT` > `SITE_HOURS` > `COMPANY_HOURS` > `MISSING_CONFIGURATION`.
3. Pruebas unitarias ampliadas en `operating-window-resolver.service.spec.ts`.

### Frontend portal

1. `daily-schedule-draft.ts`: modelo de borrador, display window, validacion y helpers de snap/resize.
2. `ScheduleCalendar.tsx`: columna `Responsable` compacta, rail simplificada, tarjeta pendiente como drag source, drop targets, bloque borrador con move/resize y sombreado fuera de ventana.
3. `SchedulingClient.tsx`: orquestacion del borrador y confirmacion via flujo existente (`ScheduleVisitRequestConfirmDialog`).
4. `useOperatingWindow.ts`: hook `useDailyDisplayOperatingWindow` para viewport diario.

### E2E

1. Caso `admin arrastra pendiente a la grilla, ajusta borrador y confirma agenda` en `portal-wfm-scheduling.spec.ts`.

---

## 3. Evidencia de pruebas

```bash
pnpm --filter @iwana/api test -- operating-window-resolver.service.spec.ts
pnpm --filter @iwana/portal test -- daily-schedule-draft.spec.ts ScheduleCalendar.spec.tsx SchedulingClient.spec.tsx
```

Resultado: suites anteriores en verde (6 API + 22 portal en el alcance del cambio).

E2E: requiere `npx playwright install` en el entorno local para ejecutar el nuevo caso.

---

## 4. Criterios de aceptacion cubiertos

| Criterio | Estado |
| --- | --- |
| Arrastre de pendiente a franja diaria | Cubierto |
| Drop crea borrador, no evento persistido | Cubierto |
| Move + resize antes de confirmar | Cubierto |
| Confirmacion via flujo existente | Cubierto |
| Columna responsable compacta y rail sin copy redundante | Cubierto |
| Display window alineado a ventana operativa | Cubierto |
| Backend emite `SITE_HOURS` | Cubierto |
| Regla anti-pasado en borrador, grilla y API | Cubierto (v1.1) |

---

## 5. Deuda tecnica

1. Ajuste fino del borrador por teclado puede ampliarse en iteracion posterior (handles ya son focuseables).
2. E2E de drag depende de browsers Playwright instalados en el entorno de ejecucion.

---

## 6. Actualizacion v1.1 — Regla anti-pasado (2026-06-19)

### Objetivo

Impedir que coordinadores, despachadores o flujos automatizados persistan agendas con inicio en el pasado respecto al reloj del servidor en el momento de la operacion.

### Regla de negocio

1. `scheduledStartAt` debe ser mayor o igual al instante actual al crear, reagendar o actualizar horario de un evento.
2. La misma regla aplica al agendar una solicitud de visita (`scheduleVisitRequest`).
3. Mensaje canonico de rechazo: *No se pueden agendar tareas en una fecha u hora anterior al momento actual*.

### Backend (fuente de verdad)

1. Nuevo helper `apps/api/src/modules/wfm/services/schedule-past-guard.ts` con `assertScheduleStartNotInPast()`.
2. Invocado en `ScheduleEventsService.create()`, `update()` (cuando cambia horario) y `reschedule()`.
3. Invocado en `VisitRequestsService.scheduleVisitRequest()` antes de persistir.

### Frontend (UX y coherencia)

1. Helpers `isScheduleStartInPast()` e `isScheduleDaySlotInPast()` en `schedule-event-time.ts`.
2. Borrador diario: nuevo estado de validacion `in-the-past`; bloquea confirmacion y muestra hint *La franja ya pasó*.
3. Grilla diaria: franjas pasadas deshabilitadas para clic y drop.
4. Formularios y dialogos: validacion previa al enviar en `ScheduleEventForm`, `SchedulingQuickCreateDialog`, `RescheduleEventDialog` y agenda manual en `VisitRequestRecommendationPanel`.

### Evidencia de pruebas

Comandos ejecutados:

```bash
pnpm --filter @iwana/api test -- schedule-events.service.spec.ts visit-requests.service.spec.ts
pnpm --filter @iwana/portal test -- daily-schedule-draft.spec.ts
```

Resultado:

1. API: suites `schedule-events.service.spec.ts` y `visit-requests.service.spec.ts` en verde, incluyendo casos de rechazo por fecha pasada.
2. Portal: `daily-schedule-draft.spec.ts` en verde, incluyendo borrador marcado como `in-the-past`.

### Limitaciones conocidas

1. La comparacion usa el reloj del servidor/API; no hay normalizacion adicional por zona horaria del tenant mas alla de la ya existente en helpers de ventana operativa.
2. Recomendaciones algoritmicas no fueron re-auditadas en esta iteracion; el guard backend rechaza cualquier intento de persistencia en el pasado aunque la UI sugiera una franja obsoleta.

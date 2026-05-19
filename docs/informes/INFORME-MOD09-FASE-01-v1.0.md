# INFORME - MOD09 Programacion / WFM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Ultima actualizacion:** 2026-05-15  
**Modo activo:** Mixto  
**Modulo:** MOD09 Programacion / WFM  
**Responsable principal:** GitHub Copilot

---

## 1. Vinculos de trazabilidad

- Prompt: `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md`
- PRD: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Spec: `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md`
- ADR principal: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Plan: `docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md`
- Stack: `docs/prds/Stack_Tecnologico.md`
- Informe de definicion: `docs/informes/INFORME-MOD09-DEFINICION-v1.0.md`

---

## 2. Resumen ejecutivo

Se implemento la Fase 01 de MOD09 como bounded context `WfmModule`, cubriendo agenda operativa tenant-aware, work order ligera, dashboard basico y UI portal en `/dashboard/scheduling`.

El alcance entregado incluye persistencia TypeORM por schema tenant, endpoints REST `/api/v1/wfm`, controles de ownership para roles restringidos, formularios y vistas operativas en portal, pruebas backend/frontend focalizadas y un E2E de portal para crear, reagendar y completar.

---

## 3. Entregables implementados

### Backend

- Enums WFM en `packages/shared/src/enums/wfm/**`.
- Entidades tenant-aware:
  - `schedule-event.entity.ts`
  - `work-order.entity.ts`
  - `work-order-task.entity.ts`
  - `schedule-reschedule-log.entity.ts`
  - `technician-availability.entity.ts`
- Migracion reversible: `packages/database/src/migrations/tenant/030_create_wfm_module.ts`
- Modulo API: `apps/api/src/modules/wfm/**`
  - controller
  - services
  - DTOs
  - port/adapter tipado
  - suites de prueba

### Frontend portal

- Ruta: `apps/portal/src/app/dashboard/scheduling/page.tsx`
- Componentes: `apps/portal/src/components/scheduling/**`
- Cliente API tipado WFM en `apps/portal/src/lib/api-client.ts`
- Navegacion real en `apps/portal/src/components/layout/Sidebar.tsx`

### E2E

- `e2e/tests/portal-wfm-scheduling.spec.ts`
  - flujo ADMIN: crear -> reagendar -> completar evento -> cerrar OT
  - flujo TECHNICIAN: solo visibilidad de trabajos asignados

---

## 4. Decisiones tecnicas materializadas

1. `WfmModule` se mantiene desacoplado de CRM por puerto tipado; no accede a tablas de otro modulo.
2. Multi-tenancy por schema desde el inicio, usando `TenantContext` y `runInTenantSchema()`.
3. `ScheduleEvent.workOrderId` es el vinculo canonico; `WorkOrder.scheduledEventId` actua como mirror/backlink transaccional.
4. La generacion de codigo de OT fue endurecida con retry ante colision de constraint unica por tenant.
5. La UI evita dependencia pesada de calendario y opera con vistas calendario/lista mas filtros.

---

## 5. Evidencia funcional

- Crear evento con OT ligera desde portal: validado en unit tests frontend y E2E.
- Rechazo de solapamientos activos por tecnico: validado en backend.
- Reagendamiento con motivo obligatorio: validado en backend y E2E.
- Transicion de evento y OT: validada en backend y E2E.
- Dashboard operativo basico y carga por tecnico: validado por servicios backend y render portal.
- Ownership `TECHNICIAN`: validado en servicio backend, controller HTTP y E2E.

---

## 6. Evidencia de calidad ejecutada

Para no saturar el equipo, la verificacion final se ejecuto **sin Turbo global**, por workspace afectado y en serie con prioridad reducida (`nice -n 10`).

### 6.1 Typecheck

- `pnpm --filter @iwana/shared typecheck` ✅
- `pnpm --filter @iwana/db typecheck` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/portal typecheck` ✅

### 6.2 Lint

- `pnpm --filter @iwana/shared lint` ✅
- `pnpm --filter @iwana/db lint` ✅
- `pnpm --filter @iwana/api lint` ✅
- `pnpm --filter @iwana/portal lint` ✅

### 6.3 Build

- `pnpm --filter @iwana/shared build` ✅
- `pnpm --filter @iwana/db build` ✅
- `pnpm --filter @iwana/api build` ✅
- `pnpm --filter @iwana/portal build` ✅

### 6.4 Tests focalizados

- `pnpm --filter @iwana/api test -- wfm` ✅  
  Resultado: **5 suites, 39 tests aprobados**.

- `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/ScheduleEventForm.spec.tsx` ✅  
  Resultado: **2 suites, 8 tests aprobados**.

- `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` ✅  
  Resultado: **4 tests aprobados**.

---

## 7. OpenAPI

La superficie WFM quedo incorporada al esquema OpenAPI runtime del API mediante decoradores Swagger en `apps/api/src/modules/wfm/wfm.controller.ts` y DTOs documentados en `apps/api/src/modules/wfm/dto/**`.

La documentacion queda expuesta, fuera de produccion, en `/api/v1/docs` segun `apps/api/src/main.ts`.

---

## 8. Riesgos y deuda tecnica residual

No se identifican deudas criticas abiertas dentro del alcance de la Fase 01.

Quedan como mejoras futuras no bloqueantes, fuera del criterio de salida de esta fase, posibles ampliaciones de cobertura para escenarios adicionales de contratistas en portal y exploraciones visuales mas amplias sobre breakpoints secundarios.

---

## 9. Decision de salida

**Veredicto:** Go.

La fase queda funcionalmente implementada y validada sobre los workspaces afectados, con build, lint, typecheck, tests focalizados y E2E principal en verde.

No se identifican bloqueos criticos de arquitectura, seguridad, tenancy o compilacion dentro del alcance aprobado.

---

## 10. Consolidacion final aplicada

1. Se agrego cobertura explicita de `CONTRACTOR` en pruebas backend HTTP y unitarias.
2. Se agrego `wfm.tenant-isolation.spec.ts` para validar resolucion request-level por schema tenant.
3. Se amplio `portal-wfm-scheduling.spec.ts` con evidencia responsive mobile y consulta por rango diario, semanal y mensual.
4. Se corrigio un defecto post-cierre en portal scheduling donde `wfmApi` consumia respuestas WFM como envelope `{ data }` aunque el backend devolvia payload crudo. El ajuste se aplico en `apps/portal/src/lib/api-client.ts` con `returnFullResponse: true` para la superficie WFM y se reforzo `SchedulingClient` con fallback a colecciones vacias para evitar una caida total de la UI ante respuestas invalidas.
5. Se agrego regresion en `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx` para cubrir el caso `events.list() -> undefined` y confirmar que la vista cae a estado vacio en lugar de lanzar `TypeError`.
6. Se aplico un correctivo UX en `apps/portal/src/components/scheduling/VisitRequestRecommendationPanel.tsx` para que la duracion de la instalacion deje de venir preseleccionada y pase a ser un prerequisito explicito antes de habilitar `Calcular recomendaciones`. En el mismo ajuste se reorganizo el panel lateral de despacho: la configuracion de duracion y horizonte ahora lidera el flujo, mientras el contexto operativo pasa a un bloque expandible menos denso.
7. Se actualizo la regresion de `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` para cubrir el nuevo gating de duracion, la interaccion real del `Select` custom y el acceso al bloque de contexto colapsable.
8. Se normalizo el rango horario de instalaciones en portal para operar solo entre `07:00` y `18:00`, reutilizando un helper compartido de franjas por tipo de trabajo en creacion, reagenda y contexto de solicitudes pendientes.
9. Se endurecio la misma regla en backend WFM mediante un port de lectura de timezone tenant-aware, de modo que `create`, `update`, `reschedule` y `scheduleVisitRequest` rechacen instalaciones fuera de la ventana local `07:00`-`18:00` del tenant.

### Actualizacion correctiva 2026-05-15

- Flujo corregido: la recomendacion de franja ya no arranca con 120 minutos implicitos; el usuario debe elegir la duracion estimada de la tarea antes de disparar el calculo.
- Densidad visual reducida: el panel `Despacho de la solicitud` prioriza el paso de duracion y busqueda, conserva la confirmacion en el mismo rail y mueve el contexto operativo a una superficie expandible para evitar amontonamiento en columna angosta.
- Evidencia ejecutada: `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` ✅
- Rango operativo corregido: las instalaciones ahora solo exponen y aceptan franjas locales entre `07:00` y `18:00` en `ScheduleEventForm`, `RescheduleEventDialog`, `PendingVisitRequestsView` y `VisitRequestRecommendationPanel`.
- Evidencia ejecutada: `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` ✅
- Defensa en servidor: WFM ahora valida la franja de instalaciones contra la timezone IANA efectiva del tenant antes de crear, actualizar, reagendar o materializar la agenda desde una visit request, evitando bypass por llamadas directas al API.
- Evidencia ejecutada: `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts apps/api/src/modules/wfm/services/visit-requests.service.spec.ts` ✅
- Contrato HTTP reforzado: los endpoints `POST /wfm/events`, `POST /wfm/events/:id/reschedule` y `POST /wfm/visit-requests/:id/schedule` ya exponen `400` con el mensaje de negocio correspondiente cuando la regla de horario `07:00`-`18:00` rechaza una instalación.
- Evidencia ejecutada: `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/wfm.controller.http.spec.ts apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts` ✅

### Actualizacion de preparacion para ejecucion 2026-05-15

- Se aprobó la evolucion de horario fijo a modelo relacional tenant-aware con soporte de empresa, sede operativa, overrides por técnico y festivos/cierres.
- Se dejó explícito que `sede` significa oficina/base operativa real y no `CommercialNode`.
- Se cerró la precedencia ejecutable: `override técnico > festivo/cierre > sede > empresa`.
- Se aprobó que `operatingSiteId` sea opcional en el primer corte para no romper flujos legacy ni tenants monosede.
- Se aprobó que la administración inicial viva dentro de la pestaña `operations` del portal, pero en un manager WFM separado de `OperationalSettingsForm`.
- Se generó la spec ejecutable en `docs/superpowers/specs/2026-05-15-mod09-wfm-operating-hours-design.md`.
- Se generó el plan task-by-task en `docs/superpowers/plans/2026-05-15-mod09-wfm-operating-hours.md`.
- Se generó el prompt de ejecución para fullstack en `docs/prompts/PROMPT-MOD09-HORARIOS-OPERATIVOS-WFM-v1.0.md`.
- Estado actual: listo para ejecución fullstack; aún no se han corrido pruebas de implementación de esta nueva fase porque este corte fue documental y de gobierno técnico.

### Actualizacion WFM operating hours 2026-05-16

- Se completó el slice portal de `settings` dentro de la pestaña `operations` con `apps/portal/src/components/settings/WfmOperatingHoursManager.tsx`, manteniendo `OperationalSettingsForm` enfocado solo en timezone, moneda, idioma y país.
- El portal ahora consume CRUD tipado para sedes operativas, horario base, horario por sede, overrides por técnico y festivos/cierres desde `apps/portal/src/lib/api-client.ts`.
- Se agregó la consulta self-service `POST /api/v1/wfm/operating-window/resolve` para exponer al portal la ventana operativa efectiva resuelta por backend sin duplicar la precedencia en cliente.
- `ScheduleEventForm`, `RescheduleEventDialog`, `VisitRequestRecommendationPanel` y `PendingVisitRequestsView` dejaron de depender del hardcode `07:00-18:00` y ahora resuelven la ventana efectiva para instalaciones, filtran horas según esa ventana y muestran mensajes de cierre cuando la fecha no está habilitada.
- El helper `apps/portal/src/components/scheduling/schedule-event-time.ts` quedó generalizado para filtrar horas por una ventana operativa dinámica en lugar de un rango fijo embebido.
- Se creó el hook `apps/portal/src/components/scheduling/useOperatingWindow.ts` para centralizar la lectura de ventana efectiva y el copy explicativo usado por scheduling.

#### Evidencia ejecutada 2026-05-16

- `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/settings/WfmOperatingHoursManager.spec.tsx apps/portal/src/components/settings/SettingsClient.spec.tsx` ✅
- `pnpm exec jest -c apps/api/jest.config.js --runInBand apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts` ✅
- `pnpm exec jest -c apps/portal/jest.config.js --runInBand apps/portal/src/components/scheduling/ScheduleEventForm.spec.tsx apps/portal/src/components/scheduling/RescheduleEventDialog.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` ✅

#### Estado resultante

- `settings` del portal ya permite administrar configuración WFM sin mezclar ownership con `tenant.settings`.
- Scheduling del portal ya explica cierres operativos usando la misma resolución efectiva que backend.
- La validación quedó focalizada sobre los slices modificados de API y portal; no se ejecutó en este corte un `typecheck` global del monorepo completo.

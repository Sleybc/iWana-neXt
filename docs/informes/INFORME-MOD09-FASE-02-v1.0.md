# INFORME - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modo activo:** Mixto  
**Modulo:** MOD09 Programacion / WFM  
**Responsable principal:** GitHub Copilot

---

## 1. Vinculos de trazabilidad

- PRD base: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Addendum funcional: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-ADDENDUM-COMMAND-CENTER-v1.1.md`
- HLD vigente: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Spec de fase: `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md`
- ADR principal: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Plan: `docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- Prompt: `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-02-v1.0.md`
- Informe previo: `docs/informes/INFORME-MOD09-FASE-01-v1.0.md`
- Evidencia de calidad: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`

---

## 2. Resumen ejecutivo

Se implemento la Fase 02 de MOD09 como command center liviano dentro de `/dashboard/scheduling`, sin cambiar el boundary `WfmModule` ni introducir tablas, endpoints, realtime, mapa, Kanban, drag-and-drop o dispatch asistido.

El resultado entrega KPIs priorizados, alertas deterministicas, timeline diario por tecnico y banda de saturacion por responsable para roles `ADMIN`, `NOC` y `SUPPORT`. Los roles `TECHNICIAN` y `CONTRACTOR` conservan agenda/lista por ownership sin consumir summary global ni alertas agregadas.

---

## 3. Entregables implementados

### Backend

- `WfmDashboardSummary` ampliado de forma aditiva con:
  - `activeCount`
  - `enRouteCount`
  - `atRiskCount`
  - `alerts[]`
  - `technicianLoad[].overdueCount`
  - `technicianLoad[].totalScheduledMinutes`
  - `technicianLoad[].utilizationPercent`
  - `technicianLoad[].riskLevel`
- Reglas de alertas derivadas:
  - evento atrasado
  - borrador que inicia pronto
  - tecnico con saturacion alta
- Banda de saturacion por tecnico calculada desde minutos programados del dia.
- Gating backend preservado: `GET /api/v1/wfm/dashboard/summary` sigue restringido a `ADMIN`, `NOC` y `SUPPORT`.

### Frontend portal

- Vista `command-center` agregada a `SchedulingClient` como default para roles de supervision.
- Componentes nuevos:
  - `SchedulingOverview.tsx`
  - `SchedulingAlertRail.tsx`
  - `SchedulingTimelineBoard.tsx`
  - `TechnicianLoadStrip.tsx`
- `SchedulingToolbar` mantiene filtros compartidos y permite alternar entre command center, calendario y lista.
- Roles restringidos no visualizan command center ni disparan llamadas a summary/availability global.
- Calendario y lista existentes siguen disponibles y sincronizados con filtros.

### Base de datos

- Sin migraciones nuevas.
- Sin tablas nuevas para alertas o timeline.

### Integraciones

- Sin dependencias nuevas.
- Sin mapa, realtime, WebSocket, SSE, inventario, IA ni dispatch automatico.

---

## 4. Evidencia funcional

- CA-WFM-13: `ADMIN` visualiza command center con KPIs priorizados.
- CA-WFM-14: Timeline diario agrupa eventos por tecnico y abre detalle desde el bloque.
- CA-WFM-15: Carga y saturacion por tecnico visibles mediante banda `LOW`, `MEDIUM`, `HIGH`.
- CA-WFM-16: Alertas derivadas sin persistencia nueva.
- CA-WFM-17: `TECHNICIAN` no ve command center global ni consume summary agregado.
- CA-WFM-18: Summary faltante muestra cobertura parcial y conserva timeline/lista con eventos.
- CA-WFM-19: Calendario y lista se conservan y comparten filtros.
- CA-WFM-20: Tests focalizados ejecutados en verde.

---

## 5. Evidencia de calidad

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api typecheck` | Verde |
| `pnpm --filter @iwana/portal typecheck` | Verde |
| `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts` | Verde: 2 suites, 25 tests |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx` | Verde: 2 suites, 9 tests |
| `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` | Verde: 5 tests |

---

## 6. Cambios documentales

- Informe vivo actualizado: `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
- Evidencia de calidad creada: `docs/quality/QUALITY-MOD09-FASE-02-v1.0.md`.
- PRD/HLD/ADR no se modifican porque no hubo cambio estructural ni desviacion aprobada.

---

## 7. Riesgos y bloqueos

- Scope creep hacia mapa, Kanban o dispatch asistido: controlado; no se implemento.
- Crecimiento de `SchedulingClient`: mitigado con componentes dedicados.
- Inconsistencia entre alertas backend/frontend: mitigada con contrato tipado, helpers y pruebas focalizadas.
- Bloqueos tecnicos abiertos: ninguno.

---

## 8. Decision de salida

**Veredicto:** Go.

La Fase 02 queda implementada y validada con pruebas backend, frontend, typecheck y E2E portal focalizado en verde. No se identifican bloqueos criticos de arquitectura, seguridad, tenancy o stack dentro del alcance aprobado.

---

## 9. Correcciones posteriores

- 2026-05-09: Se integró la entrada operativa desde CRM hacia `Programacion` en `apps/portal/src/components/scheduling/SchedulingClient.tsx` y `apps/portal/src/components/scheduling/ScheduleEventForm.tsx`. El módulo ahora acepta `open=create&type=INSTALLATION&expedienteId=...`, hidrata el expediente autenticado vía `crmApi.getExpediente()`, prellena el formulario WFM sin exponer PII en la URL y, tras crear el evento, ejecuta la transición de CRM a `INSTALACION_AGENDADA` con manejo explícito de fallo parcial. Se agregó cobertura focalizada en `SchedulingClient.spec.tsx` y `scheduling-expediente-sync.spec.ts`. Validación: `pnpm --filter @iwana/portal test -- --runInBand src/components/crm/expedientes/expediente-scheduling.spec.ts src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx src/components/scheduling/scheduling-expediente-sync.spec.ts` y `pnpm --filter @iwana/portal typecheck` en verde.
- 2026-05-09: Se reforzó la consistencia operativa entre CRM y WFM para impedir agendas duplicadas por expediente. Backend: `apps/api/src/modules/wfm/services/schedule-events.service.ts` ahora rechaza la creación de un nuevo evento cuando ya existe uno activo para el mismo `expedienteId`, y `apps/api/src/modules/wfm/dto/list-schedule-events-query.dto.ts` expone el filtro aditivo para consulta segura desde portal. Portal: `apps/portal/src/components/scheduling/SchedulingClient.tsx` consulta eventos por `expedienteId` antes de abrir el formulario y redirige al detalle del evento existente cuando encuentra una agenda activa. Validación: `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/schedule-events.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts`, `pnpm --filter @iwana/api typecheck`, `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx src/components/scheduling/scheduling-expediente-sync.spec.ts src/components/crm/expedientes/expediente-scheduling.spec.ts`, `pnpm --filter @iwana/portal typecheck` y `pnpm exec playwright test --config e2e/playwright.portal.config.ts --grep "admin abre Scheduling desde expediente CRM"` en verde.
- 2026-05-09: Se corrigió la exposición del UUID técnico del expediente en el formulario de creación de Programación cuando el flujo se abre desde CRM. El portal ahora conserva el `expedienteId` real de forma interna para el payload WFM, pero muestra al usuario la referencia corta visible en CRM y actualiza la descripción prellenada para evitar ruido técnico en la UI. Validación: Jest focalizado de `ScheduleEventForm.tsx`, `SchedulingClient.spec.tsx`, typecheck de portal y Playwright focalizado del flujo CRM → Programación.
- 2026-05-09: Se extendió la corrección visual para que WFM no exponga el UUID técnico del expediente en otras superficies del portal. Ajustes aplicados: (1) `ScheduleEventForm.tsx` ahora muestra también referencia corta en `Referencia de origen` cuando la OT proviene de CRM, manteniendo el UUID real oculto para el payload; (2) `ScheduleEventDrawer.tsx` humaniza la referencia de la work order y sanea descripciones legacy creadas antes del ajuste; (3) `ScheduleList.tsx` reutiliza la misma sanitización para no mostrar UUIDs históricos en la tabla. Cobertura agregada en `scheduling-ui.spec.ts` y refuerzo de E2E focalizada del flujo CRM → Programación.
- 2026-05-09: Se realizó barrido transversal para cerrar exposición de identificadores técnicos de expediente en superficies runtime de portal/API. Se centralizó el formateo en `apps/portal/src/lib/expediente-labels.ts`, se reutilizó desde Scheduling, listado/detalle CRM, notificaciones y vista 360 de suscriptor, y se reemplazaron mensajes API `NotFound` de CRM que incluían `expedienteId` por mensajes genéricos. Validación: Jest focalizado portal en verde (4 suites, 19 tests), Jest focalizado API CRM en verde (2 suites, 58 tests), `pnpm --filter @iwana/portal typecheck`, `pnpm --filter @iwana/api typecheck` y Playwright focalizado CRM → Programación en verde.
- 2026-05-09: **Orquestación ticket instalación en SchedulingClient** — El módulo de Programación ahora integra Assurance como capa de trazabilidad antes de abrir el formulario de instalación desde CRM. Cambios aplicados: (1) `SchedulingClient.tsx` llama `assuranceApi.tickets.findOrCreateInstallation` durante `hydrateCreateFromExpediente` y guarda `installationTicketId` en estado; si falla, el modal no se abre y el usuario recibe error claro; (2) el `ticketId` del ticket Assurance se incluye en `initialValues` del formulario; (3) prop `lockOperationalFlow={Boolean(expedienteContextId)}` pasa al `ScheduleEventForm` para bloquear el campo ticketId y el toggle createWorkOrder; (4) tras crear el evento WFM, se vincula la work order al ticket (`assuranceApi.tickets.linkWorkOrder`) y se persisten las refs en CRM (`crmApi.linkInstallationOperationalRefs`); todos los pasos post-creación son no bloqueantes. El flujo de agendamiento no expediente queda sin cambios. Validación: typecheck portal en verde, flujo sin expediente no roto.

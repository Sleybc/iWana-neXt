# QUALITY - MOD09 Programacion / WFM Fase 02

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-09  
**Modulo:** MOD09 Programacion / WFM  
**Fase:** Fase 02 - Command center liviano

---

## 1. Evidencia ejecutada

- `pnpm --filter @iwana/api typecheck` → Verde.
- `pnpm --filter @iwana/portal typecheck` → Verde.
- `pnpm --filter @iwana/api test -- --runInBand src/modules/wfm/tests/wfm-dashboard.service.spec.ts src/modules/wfm/tests/wfm.controller.http.spec.ts` → Verde: 2 suites, 25 tests.
- `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/SchedulingOverview.spec.tsx` → Verde: 2 suites, 9 tests.
- `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` → Verde: 5 tests.
- `runTests :: apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts` → Verde: 1 suite, 31 tests.
- `runTests :: apps/portal/src/components/scheduling/SchedulingClient.spec.tsx apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 2 suites, 9 tests.
- `runTests :: apps/portal/src/components/crm/expedientes/expediente-scheduling.spec.ts apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 2 suites, 7 tests.
- `runTests :: apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx apps/portal/src/components/scheduling/pending-visits-ui.spec.ts` → Verde: 39 tests.
- `pnpm --filter @iwana/db typecheck` → Verde.
- `runTests :: apps/api/src/modules/wfm/services/visit-requests.service.spec.ts apps/api/src/modules/assurance/tests/tickets.service.spec.ts apps/worker/src/processors/assurance-field-service.processor.spec.ts` → Verde: 26 tests.
- `runTests :: apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 6 tests.
- `pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck && pnpm --filter @iwana/worker typecheck && pnpm --filter @iwana/db typecheck` → Verde.
- `pnpm exec playwright test -c e2e/playwright.portal.config.ts --grep "admin confirma una visita pendiente desde la bandeja WFM"` → Verde: 1 prueba.
- `runTests :: apps/api/src/modules/wfm/services/visit-requests.service.spec.ts` → Verde: 1 suite, 6 tests.
- `runTests :: apps/api/src/modules/wfm/tests/visit-requests.controller.http.spec.ts` → Verde: 1 suite, 33 tests.
- `runTests :: apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 1 suite, 7 tests.
- `pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck` → Verde.
- `runTests :: apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 1 suite, 8 tests.
- `pnpm --filter @iwana/portal typecheck` → Verde.
- `runTests :: apps/api/src/modules/wfm/services/visit-requests.service.spec.ts` → Verde: 1 suite, 7 tests.
- `runTests :: apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx` → Verde: 1 suite, 9 tests.
- `get_errors :: visit-requests.service.ts + VisitRequestRecommendationPanel.tsx + pending-visits-ui.ts + specs focalizados` → Sin errores.

---

## 2. Criterios cubiertos

- CA-WFM-13: Command center visible para `ADMIN`, `NOC` y `SUPPORT`.
- CA-WFM-14: Timeline diario agrupa eventos por tecnico y permite abrir detalle.
- CA-WFM-15: Carga y saturacion por tecnico visibles con semantica `LOW`, `MEDIUM`, `HIGH`.
- CA-WFM-16: Alertas deterministicas sin tabla nueva.
- CA-WFM-17: `TECHNICIAN` y `CONTRACTOR` sin KPIs globales ni alertas agregadas.
- CA-WFM-18: Cobertura parcial soportada cuando summary no esta disponible.
- CA-WFM-19: Calendario y lista conservan filtros compartidos.
- CA-WFM-20: Tests focalizados ejecutados en verde.
- CA-WFM-21: La bandeja de visitas pendientes lista solicitudes WFM y permite abrir un detalle operativo desde portal.
- CA-WFM-22: Una solicitud `READY_TO_SCHEDULE` puede pedir recomendaciones por solicitud y confirmar agenda desde una superficie dedicada.
- CA-WFM-23: El portal evita colisiones de selección cuando un mismo técnico recibe más de una franja recomendada.
- CA-WFM-24: El botón CRM `Agendar instalación` abre la bandeja pendiente y ya no dispara el modal legacy como primer paso.
- CA-WFM-25: La bandeja materializa solicitudes CRM desde `expedienteId` y preserva la sincronización operativa con Assurance/CRM al confirmar agenda.
- CA-WFM-26: Las solicitudes Assurance se materializan en `visit_requests` mediante worker BullMQ sin acceso cross-module a tablas WFM.
- CA-WFM-27: La idempotencia de `VisitRequest` activa queda protegida por restricción parcial en BD y recuperación segura ante carreras de escritura.
- CA-WFM-28: `SALES` opera solo solicitudes `CRM` y el portal lo restringe a modo asistido sin bandeja global ni creación manual.
- CA-WFM-29: La confirmación de agenda permite decidir si se crea `WorkOrder` y adjuntar notas operativas cuando aplica.
- CA-WFM-30: Existe cobertura Playwright focalizada del flujo `pending-visits` con confirmación real desde la bandeja.
- CA-BVP-UX-02: Municipio y sector ahora se consumen como opciones operativas con conteos desde WFM, sin texto libre por defecto en desktop.
- CA-BVP-UX-03: La solicitud CRM se reinyecta en bandeja con filtros limpiados y queda visible/seleccionada al aterrizar en `pending-visits`.
- CA-BVP-UX-04: La duración estimada se captura antes de pedir recomendaciones.
- CA-BVP-UX-05: Las recomendaciones aceptan horizonte de búsqueda sin requerir ventana persistida previa.
- CA-BVP-UX-06: La matriz semanal permite usar la franja recomendada desde la propia celda.
- CA-BVP-UX-07: La matriz y la lista de recomendaciones comparten selección activa.
- CA-BVP-UX-03A: Una solicitud CRM recién materializada permanece visible y seleccionada aunque la recarga inmediata de bandeja aún no la devuelva.
- CA-BVP-UX-08: Una solicitud terminal no permite volver a completar contexto ni recalcular recomendaciones desde el panel lateral.
- CA-BVP-UX-09: Guardar contexto parcial desde `PENDING` mueve la solicitud a `NEEDS_CONTEXT` y evita semántica ambigua en el estado.

---

## 3. Observaciones

- La fase ya incluye migraciones WFM `schedule_events.sector`, `visit_requests` y el hardening `035_harden_visit_requests_indexes.ts` para índices territoriales/SLA e idempotencia activa.
- No se introdujo mapa, realtime, WebSocket, SSE, Kanban, drag-and-drop, IA ni dispatch asistido.
- Los mocks E2E WFM se mantienen alineados con el contrato crudo usado por `returnFullResponse: true` en el cliente portal.
- La validación de la bandeja pendiente en esta sesión quedó cubierta con pruebas unitarias focalizadas, typecheck por workspace y una E2E Playwright específica del flujo de confirmación desde `pending-visits`.
- El rediseño UX v1.1 se validó sin alterar ownership de `VisitRequest` ni introducir lecturas cross-module desde CRM o Assurance.
- Auditoría EM-ARCH registrada en `docs/informes/INFORME-MOD09-AUDITORIA-BANDEJA-VISITAS-v1.0.md`: los hallazgos críticos del bloque correctivo quedaron atendidos en este corte; cualquier cierre productivo adicional debe seguir pasando por evidencia incremental del informe vivo.
- El cierre final del slice incorpora guardas UI para estados terminales y corrige la transición semántica `PENDING` → `NEEDS_CONTEXT` ante contexto parcial, reduciendo 400 evitables y alineando backend/frontend.

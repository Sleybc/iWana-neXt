# CHECKLIST - MOD10 Service Assurance / Mesa de Ayuda Fase 01

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09  
**Modo activo:** EM  
**Modulo:** MOD10 Service Assurance / Mesa de Ayuda  
**Informe relacionado:** docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md  
**Prompt:** docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md

---

## 1. Leyenda de estado

- **Cumplido:** existe evidencia directa en código y/o pruebas verificadas en este corte.
- **Parcial:** hay implementación o evidencia incompleta, pero falta prueba focalizada, cobertura complementaria o un tramo funcional del criterio.
- **Pendiente:** no existe evidencia suficiente en el repo para marcar avance real.

---

## 2. Estado actual de criterios CA-ASS-01 a CA-ASS-14

| Criterio | Estado | Evidencia real verificada | Lectura actual |
| --- | --- | --- | --- |
| **CA-ASS-01** Crear ticket externo con requester/subject tipado | **Cumplido** | `apps/api/src/modules/assurance/dto/index.ts`, `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts` | El DTO y el servicio persisten `requesterType`, `requesterRefId`, `subjectType` y `subjectRefId`; la prueba HTTP verifica creación válida por `SUPPORT`. |
| **CA-ASS-02** Crear ticket interno sin cliente asociado | **Cumplido** | `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `packages/shared/src/enums/assurance/ticket-type.enum.ts`, `packages/shared/src/enums/assurance/ticket-requester-type.enum.ts`, `apps/api/src/modules/assurance/dto/index.ts` | La prueba focalizada `creates an internal ticket without a client reference` verifica `INTERNAL_SUPPORT` con `requesterRefId` y `subjectRefId` nulos. |
| **CA-ASS-03** PQR crea registro regulatorio con deadlines y timestamps | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/services/pqr.service.ts`, `apps/api/src/modules/assurance/services/sla.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts` | Las pruebas focalizadas cubren creación de PQR con deadline de días hábiles y guardas de completitud regulatoria antes de resolver/cerrar. |
| **CA-ASS-04** Ticket no PQR calcula SLA de primera respuesta y resolución | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/services/sla.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts` | La prueba `calculates first response and resolution deadlines for non-PQR tickets with an SLA policy` verifica política aplicada y fechas `slaFirstResponseAt`/`slaResolveByAt`. |
| **CA-ASS-05** Transiciones inválidas son rechazadas | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts` | La prueba `rejects a general invalid status transition` verifica rechazo de `OPEN -> CLOSED`; `RESOLVED` exige nota por Zod. |
| **CA-ASS-06** Comentario interno no visible al solicitante por defecto | **Cumplido** | `apps/api/src/modules/assurance/dto/index.ts`, `apps/api/src/modules/assurance/services/comments.service.ts`, `apps/api/src/modules/assurance/tests/comments.service.spec.ts` | `isInternal` defaulta a `false` y el listado para roles restringidos excluye comentarios internos; la prueba actual verifica el filtro `c.is_internal = FALSE`. |
| **CA-ASS-07** Timeline registra creación, asignación, comentarios, transición y solicitud de campo | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/services/comments.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `apps/api/src/modules/assurance/tests/comments.service.spec.ts` | Las pruebas focalizadas verifican eventos `CREATED`, `ASSIGNED`, `COMMENT_ADDED`, `STATUS_CHANGED`, `FIELD_SERVICE_REQUESTED` y `WORK_ORDER_LINKED`. |
| **CA-ASS-08** Solicitar campo emite evento/puerto hacia WFM sin leer tablas WFM | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/ports/assurance-field-service.port.ts`, `apps/api/src/modules/assurance/ports/assurance-field-service.adapter.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts` | `requestFieldService()` invoca `AssuranceFieldServicePort`; la prueba focalizada verifica la llamada y el módulo no consulta tablas WFM. **Task 3:** Adapter ahora registra explícitamente "DEGRADED MODE" cuando cola no disponible. |
| **CA-ASS-09** `workOrderId` se asocia como referencia lógica | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts` | Existe alias REST `link-work-order`, se persiste la referencia lógica y la prueba valida el enlace sin FK cross-module. |
| **CA-ASS-10** Técnico/contratista no ve tickets ajenos | **Cumplido** | `apps/api/src/modules/assurance/services/tickets.service.ts`, `apps/api/src/modules/assurance/services/comments.service.ts`, `apps/api/src/modules/assurance/tests/tickets.service.spec.ts`, `apps/api/src/modules/assurance/tests/comments.service.spec.ts`, `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts` | La prueba focalizada `rejects access to tickets not assigned to a contractor` verifica `CONTRACTOR`; técnico ya estaba cubierto en comentarios y HTTP. |
| **CA-ASS-11** Dashboard muestra abiertos, en riesgo, vencidos y carga por cola | **Cumplido** | `apps/api/src/modules/assurance/services/assurance-dashboard.service.ts`, `apps/api/src/modules/assurance/assurance.controller.ts`, `apps/api/src/modules/assurance/tests/assurance.controller.http.spec.ts` | Ya existe `dashboard/summary` con abiertos, en riesgo, breached y agregados por prioridad/tipo. **Task 3:** Ahora incluye `byQueue` con carga por cola para tickets activos (excluye `CLOSED`, `CANCELLED` y `RESOLVED`), verificado en prueba HTTP. |
| **CA-ASS-12** UI portal permite crear, filtrar, comentar, resolver y solicitar campo | **Cumplido** | `apps/portal/src/app/dashboard/assurance/page.tsx`, `apps/portal/src/components/assurance/*`, `apps/portal/src/lib/api-client.ts`, `apps/portal/src/components/layout/Sidebar.tsx`, `apps/portal/src/components/assurance/AssuranceCreateTicketForm.spec.tsx`, `apps/portal/src/components/assurance/assurance-labels.spec.ts`, `e2e/tests/portal-assurance.spec.ts` | El portal expone la ruta `/dashboard/assurance`, permite operar la bandeja y el E2E focalizado verifica create/comment/in-progress/request-field-service/link-work-order/resolve. |
| **CA-ASS-13** OpenAPI actualizado | **Cumplido** | `apps/api/src/modules/assurance/assurance.controller.ts`, `apps/api/src/modules/assurance/dto/index.ts`, `apps/api/src/modules/assurance/assurance.swagger.spec.ts` | Hay decorators Swagger y prueba automatizada; además `dashboard/summary` valida schema crítico con `byQueue`, contadores y agregaciones por tipo/prioridad. |
| **CA-ASS-14** Tests focalizados en verde o bloqueo documentado | **Cumplido** | Comandos verificados: `pnpm --filter @iwana/api test -- src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/comments.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts src/modules/assurance/tests/assurance.tenant-isolation.spec.ts src/modules/assurance/assurance.swagger.spec.ts --runInBand`, `pnpm --filter @iwana/api typecheck`, `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/AssuranceCreateTicketForm.spec.tsx src/components/assurance/assurance-labels.spec.ts src/components/layout/Sidebar.spec.tsx`, `pnpm --filter @iwana/portal typecheck`, `pnpm --filter @iwana/portal lint`, `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-assurance.spec.ts` | Backend focalizado actualizado: **5 suites / 38 pruebas / OK**; portal: **3 suites / 6 pruebas / OK**, typecheck + lint OK; E2E portal MOD10: **1 prueba / OK**. |

---

## 3. Resumen ejecutivo del checklist

- **Cumplido:** 14 criterios (`CA-ASS-01` a `CA-ASS-14`)
- **Parcial:** 0 criterios
- **Pendiente:** 0 criterios

**Actualización cierre evidencias:** CA-ASS-02, CA-ASS-03, CA-ASS-04, CA-ASS-05, CA-ASS-07 y CA-ASS-10 pasan a Cumplido con pruebas focalizadas adicionales. CA-ASS-13 mantiene Cumplido con schema OpenAPI ampliado para `dashboard/summary`.

---

## 4. Decisión de uso del checklist

Este checklist ya habilita declarar cierre técnico de MOD10 Fase 01 desde la evidencia funcional focalizada: los 14 criterios CA-ASS quedan cumplidos. La integración WFM efectiva con consumidor downstream permanece como historia operativa posterior, no como bloqueo del bounded context Assurance ni de la evidencia de fase.

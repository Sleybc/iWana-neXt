# PLAN - MOD09 Bandeja de visitas pendientes

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-15  
**Modo activo:** EM  
**Modulo:** MOD09 Programacion / WFM  
**ADR requerido:** docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md  
**Spec base:** docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md

---

## 1. Objetivo del sprint

Implementar la bandeja de visitas pendientes como inbox operativo WFM para crear, priorizar, recomendar y agendar solicitudes originadas desde CRM, Assurance o flujos manuales, sin ampliar el modal actual ni romper boundaries entre bounded contexts.

## 2. Precondiciones

- ADR-039 aprobado por CTO.
- Migracion tenant autorizada.
- Contrato UI aceptado para matriz semanal sin drag-and-drop.
- Confirmacion de que el primer corte no incluye mapa, realtime ni optimizacion de rutas.

## 3. Alcance tecnico

### Backend API

- Crear enum `VisitRequestStatus` en `@iwana/shared`.
- Crear entidad tenant `VisitRequest` en `@iwana/db`.
- Crear migracion reversible para `visit_requests` e indices.
- Crear DTOs Zod para create/list/update/recommend/schedule/cancel/reject.
- Crear `VisitRequestsService` dentro de `WfmModule`.
- Exponer endpoints REST bajo `/api/v1/wfm/visit-requests`.
- Reutilizar `ScheduleRecommendationsService` para recomendaciones por solicitud.
- Agendar con transaccion: solicitud -> evento -> Work Order -> solicitud `SCHEDULED`.

### Integraciones

- CRM: evolucionar entrada desde expediente listo para crear/abrir `VisitRequest` antes de agendar.
- Assurance: crear materializacion inicial desde `requestFieldService` hacia solicitud WFM, con fallback `NEEDS_CONTEXT`.
- Manual: permitir creacion directa desde Programacion.

### Portal

- Agregar vista `pending-visits` en `SchedulingClient`.
- Crear componentes:
  - `PendingVisitRequestsView.tsx`
  - `PendingVisitRequestInbox.tsx`
  - `WeeklyTechnicianMatrix.tsx`
  - `VisitRequestRecommendationPanel.tsx`
  - `ScheduleVisitRequestConfirmDialog.tsx`
- Mantener `ScheduleEventForm` como fallback/confirmacion, no como superficie principal.

## 4. Dependencias y blockers

| Dependencia                           | Estado    | Accion                                              |
| ------------------------------------- | --------- | --------------------------------------------------- |
| ADR-039                               | Aprobado  | Ejecutar segun prompt operativo aprobado.           |
| Assurance queue consumer              | Pendiente | Definir si se implementa en API WFM o worker.       |
| Snapshot de ubicacion desde Assurance | Parcial   | Primer corte permite `NEEDS_CONTEXT`.               |
| Matriz semanal responsive             | Pendiente | Implementar sin drag-and-drop y con scroll estable. |
| OpenAPI                               | Pendiente | Actualizar con endpoints nuevos.                    |

## 5. Definition of Done

- ADR-039 aprobado o decision de CTO registrada.
- Migracion tenant reversible y registrada.
- Endpoints WFM protegidos con `UserRole.*`.
- DTOs validados con Zod.
- Tests backend unitarios y HTTP para estados, recomendaciones, agendamiento e idempotencia.
- Tests portal para bandeja, matriz, confirmacion y estados vacios.
- E2E focalizado: CRM -> solicitud -> agenda; Assurance -> solicitud; manual -> agenda.
- Typecheck API, DB y portal en verde.
- Informe vivo MOD09 actualizado con evidencia.

## 6. Riesgos

| Riesgo                                       | Severidad | Mitigacion                                                   |
| -------------------------------------------- | --------- | ------------------------------------------------------------ |
| Duplicar solicitudes por doble click o retry | Alta      | Idempotencia por origen y estado no terminal.                |
| Mezclar PII en WFM                           | Alta      | Snapshot operativo minimo; sin telefono, documento ni email. |
| Crecer `SchedulingClient` demasiado          | Media     | Extraer vista y subcomponentes dedicados.                    |
| Assurance sin ubicacion                      | Media     | Estado `NEEDS_CONTEXT` y completado desde WFM.               |
| UX pesada para 20+ tecnicos                  | Media     | Matriz con scroll, cabecera sticky y filtros.                |

## 7. Stop / Go

### Go

- ADR aprobado.
- Se acepta primer corte sin mapa ni drag-and-drop.
- Assurance puede iniciar solicitudes `NEEDS_CONTEXT`.

### Stop

- Se exige que WFM lea tablas CRM/Assurance directamente.
- Se exige incorporar mapa/realtime/IA en el mismo sprint.
- No se aprueba la nueva entidad WFM o la migracion tenant.

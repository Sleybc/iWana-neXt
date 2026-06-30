# PROMPT - MOD09 Bandeja de visitas pendientes

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-15  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Ejecutor previsto:** Sr. Dev Fullstack  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md

---

## Modulo

- **Nombre:** Programacion / WFM
- **Codigo:** MOD09
- **Fase:** Bandeja de visitas pendientes
- **Version:** 1.0
- **Fecha:** 2026-05-15
- **Aprobacion CTO:** ADR-039 aprobado el 2026-05-15

---

## 1. Objetivo exacto de la fase

Implementar fullstack la bandeja de visitas pendientes como inbox operativo WFM para recibir, priorizar, completar contexto, recomendar y agendar solicitudes originadas desde CRM, Assurance o flujos manuales, sin seguir ampliando el modal actual de creacion de eventos.

### Resultado esperado

Un usuario autorizado (`ADMIN`, `NOC`, `SUPPORT` y `SALES` solo en flujos CRM permitidos) puede ver solicitudes pendientes, seleccionar una solicitud, revisar disponibilidad semanal por tecnico, aplicar recomendaciones territoriales y confirmar agenda, generando `ScheduleEvent` y `WorkOrder` desde WFM de forma transaccional e idempotente.

### Lo que si entra

- Nueva entidad tenant-aware `VisitRequest` en WFM.
- Migracion reversible `visit_requests` con indices operativos.
- Enum `VisitRequestStatus` y contratos compartidos necesarios.
- Endpoints REST `/api/v1/wfm/visit-requests`.
- DTOs Zod para listar, crear, actualizar contexto, recomendar, agendar, cancelar y rechazar.
- Servicio WFM para estados, duplicidad, idempotencia, recomendaciones y agendamiento transaccional.
- Integracion CRM -> VisitRequest -> agenda -> sincronizacion de refs operativas.
- Integracion Assurance -> solicitud WFM desde trabajo de campo, con fallback `NEEDS_CONTEXT`.
- Creacion manual de solicitudes desde Programacion.
- UI portal de bandeja + matriz semanal + panel de recomendacion + confirmacion compacta.
- Tests backend, frontend y E2E focalizados.
- OpenAPI, informe vivo MOD09 y evidencia de calidad.

### Lo que no entra

- Mapa operativo.
- GPS realtime, WebSocket o SSE.
- Drag-and-drop o resize de agenda.
- Optimizacion de rutas con trafico.
- IA predictiva.
- App movil offline para tecnicos.
- Lecturas directas de WFM hacia tablas CRM, Assurance, Provisioning, Inventory o Contracts.
- Crecimiento adicional de `ScheduleEventForm` como superficie principal de decision.

---

## 2. Artefactos de entrada obligatorios

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD del modulo: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md
- ADR WFM aprobado: docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- ADR Assurance relacionado: docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
- ADR aprobado de bandeja: docs/adrs/ADR-039-Bandeja-Visitas-Pendientes-WFM.md
- Spec ejecutable: docs/specs/SPEC-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md
- Spec relacionada command center: docs/specs/SPEC-MOD09-PROGRAMACION-WFM-COMMAND-CENTER-v1.0.md
- Plan aprobado: docs/plans/PLAN-MOD09-BANDEJA-VISITAS-PENDIENTES-v1.0.md
- Informe vivo: docs/informes/INFORME-MOD09-FASE-02-v1.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/backend.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md, .github/instructions/e2e.instructions.md

### Artefactos faltantes detectados

- Ninguno para iniciar. ADR-039 esta aprobado por CTO y habilita ejecucion productiva controlada.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer todos los artefactos de entrada antes de tocar codigo y confirmar que ADR-039 permanece en estado `Aprobado`.
2. Trabajar por slices verticales, manteniendo commits/cambios revisables: contratos + migracion, backend WFM, integraciones CRM/Assurance/manual, portal, E2E y evidencia.
3. Implementar `VisitRequest` como entidad owner de `WfmModule`; no crear FKs fisicas ni consultas directas hacia tablas de otros bounded contexts.
4. Empezar por `@iwana/shared` y `@iwana/db`: enums, entidad, migracion reversible e indices definidos en la spec.
5. Implementar `VisitRequestsService` con maquina de estados explicita: `PENDING`, `NEEDS_CONTEXT`, `READY_TO_SCHEDULE`, `SCHEDULED`, `CANCELLED`, `REJECTED`, `EXPIRED`.
6. Hacer idempotente la creacion por `(tenantId, originContext, originRef, workType)` cuando `originRef` exista y la solicitud no sea terminal.
7. Reutilizar `ScheduleRecommendationsService` para recomendaciones por solicitud; no duplicar algoritmo territorial.
8. Agendar en una transaccion tenant-aware: validar solicitud, validar solape, crear `ScheduleEvent`, crear `WorkOrder` si aplica y pasar solicitud a `SCHEDULED`.
9. Proteger endpoints con `JwtAuthGuard`, `RolesGuard` y `@Roles(UserRole.*)`; no usar strings literales.
10. Materializar Assurance como solicitud WFM desde el flujo de trabajo de campo existente. Si el payload no trae ubicacion suficiente, crear `NEEDS_CONTEXT` y permitir completado desde WFM.
11. Evolucionar el flujo CRM para crear/abrir `VisitRequest` antes de agendar, preservando la sincronizacion posterior con Assurance y CRM.
12. Implementar la vista `pending-visits` dentro de `/dashboard/scheduling` con componentes dedicados; `ScheduleEventForm` queda como fallback o confirmacion, no como pantalla principal.
13. Mantener UI en espanol, operativa, densa y legible para 20+ tecnicos; usar matriz con scroll estable, cabeceras sticky y estados vacios utiles.
14. No mostrar PII sensible ni UUIDs tecnicos como informacion principal. Usar referencias cortas y labels operativos.
15. Actualizar OpenAPI, informe vivo y evidencia de calidad al cerrar la fase.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro modulo directamente.
- No hardcodear tenant, schema ni tenant slug.
- No usar `synchronize: true`.
- No guardar telefono, documento, email ni nombre completo en `originLabel` o logs WFM.
- No loguear `description` o notas completas.
- No omitir validacion Zod en boundaries externos.
- No crear otro evento activo desde una solicitud terminal o ya agendada.
- No introducir mapa, realtime, drag-and-drop ni IA en este corte.
- No convertir el modal actual en la superficie principal de despacho.
- No renderizar enums crudos en UI final; mapear a labels de negocio en espanol.
- No usar `npm` ni `yarn`; todo con `pnpm`.

---

## 5. Entregables tecnicos obligatorios

### Backend y contratos

- `VisitRequestStatus` y tipos compartidos necesarios en `@iwana/shared`.
- `VisitRequest` tenant-aware en `@iwana/db`.
- Migracion tenant reversible para `visit_requests` e indices.
- DTOs Zod para create/list/update/recommend/schedule/cancel/reject.
- `VisitRequestsService` dentro de `WfmModule`.
- Endpoints REST bajo `/api/v1/wfm/visit-requests`.
- Reutilizacion de `ScheduleRecommendationsService`.
- Agendamiento transaccional con `ScheduleEvent` y `WorkOrder`.
- OpenAPI actualizado.

### Integraciones

- CRM: expediente listo -> `VisitRequest` -> recomendaciones -> agenda -> refs operativas.
- Assurance: `requestFieldService` -> materializacion WFM -> `NEEDS_CONTEXT` cuando falten datos -> agenda -> `linkWorkOrder`.
- Manual/red: creacion directa desde Programacion con auditoria de actor.

### Portal

- Vista `pending-visits` en `/dashboard/scheduling`.
- Componentes sugeridos:
  - `PendingVisitRequestsView.tsx`
  - `PendingVisitRequestInbox.tsx`
  - `WeeklyTechnicianMatrix.tsx`
  - `VisitRequestRecommendationPanel.tsx`
  - `ScheduleVisitRequestConfirmDialog.tsx`
- Cliente API tipado para `visit-requests`.
- Estados vacios, faltantes `NEEDS_CONTEXT`, errores parciales y loading states.
- Gating de roles: `TECHNICIAN` y `CONTRACTOR` no acceden a la bandeja global.

### Tests

- Unitarios backend de estados, duplicidad, recomendaciones, solapes e idempotencia.
- HTTP tests de endpoints, roles, validaciones y aislamiento tenant.
- Unit/frontend tests de bandeja, matriz semanal, panel de recomendaciones y confirmacion.
- E2E portal focalizado para CRM, Assurance, manual y restriccion por rol.

---

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD09-FASE-02-v1.0.md` como documento vivo.
- Crear o actualizar evidencia de calidad en `docs/quality/`.
- Registrar comandos ejecutados y resultados relevantes.
- Actualizar PRD/HLD solo si aparece desviacion aprobada por EM-ARCH.
- Crear ADR nuevo solo si se propone cambio adicional de boundary, stack, seguridad o patron de integracion.
- Documentar decision stop/go si aparece bloqueo tecnico.

---

## 7. Criterios de aceptacion

- CA-BVP-01: Un usuario autorizado ve bandeja de visitas pendientes con filtros por origen, estado, zona y prioridad.
- CA-BVP-02: Una solicitud CRM lista se agenda desde la matriz semanal y genera evento + Work Order.
- CA-BVP-03: Una solicitud Assurance sin ubicacion suficiente aparece como `NEEDS_CONTEXT` y no permite recomendar hasta completar datos.
- CA-BVP-04: La matriz semanal muestra disponibilidad para 10, 20 o mas tecnicos sin depender de modal.
- CA-BVP-05: El backend impide doble agenda desde la misma solicitud.
- CA-BVP-06: Las referencias CRM/Assurance se preservan como IDs logicos, sin FKs cross-module.
- CA-BVP-07: Roles `TECHNICIAN` y `CONTRACTOR` no acceden a la bandeja global.
- CA-BVP-08: OpenAPI, migracion reversible y pruebas focalizadas quedan actualizadas.
- CA-BVP-09: Assurance puede originar solicitud WFM desde trabajo de campo sin que Assurance cree Work Orders.
- CA-BVP-10: El flujo manual permite crear, recomendar y agendar una visita sin origen externo.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- La implementacion exige que WFM lea directamente tablas de CRM, Assurance, Provisioning, Inventory o Contracts.
- Se requiere almacenar PII sensible no aprobada en `visit_requests`.
- La migracion exige FKs cross-module o cross-schema.
- Se necesita mapa, realtime, drag-and-drop o IA para cumplir el alcance minimo.
- La idempotencia no puede garantizarse para doble submit o retry.
- Un endpoint global queda accesible para `TECHNICIAN` o `CONTRACTOR`.
- La solucion exige cambiar el stack aprobado.

### Documentar causa en

- `docs/informes/INFORME-MOD09-FASE-02-v1.0.md`.
- `docs/quality/` usando plantilla o formato vigente de bloqueo/evidencia.

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy, stack o alcance aprobado.

### Recomendacion esperada

Presentar maximo 3 opciones con impacto, riesgo y recomendacion concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con pruebas unitarias/HTTP focalizadas.
- Frontend validado con pruebas de componentes y flujo.
- Base de datos validada con migracion reversible.
- E2E ejecutado para flujos CRM, Assurance, manual y rol restringido, o bloqueo documentado.
- Typecheck API, DB, portal y worker si se toca consumidor de cola.
- OpenAPI actualizado.
- Informe vivo y evidencia de calidad actualizados.
- Bandeja `pending-visits` operativa sin degradar calendario, lista ni command center existentes.

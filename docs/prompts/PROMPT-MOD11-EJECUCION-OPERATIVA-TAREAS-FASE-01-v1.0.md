# PROMPT - MOD11 Ejecucion Operativa / Tareas Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-22  
**Aprobado por:** CTO  
**Fecha aprobacion:** 2026-06-23  
**Modo activo:** Ejecucion  
**Generado por:** AI-EM-ARCH  
**Ejecutor:** Sr. Dev Fullstack (AI-SR-FULL)  
**Archivo destino:** docs/prompts/PROMPT-MOD11-EJECUCION-OPERATIVA-TAREAS-FASE-01-v1.0.md

---

## Modulo

- **Nombre:** Ejecucion Operativa / Tareas
- **Codigo:** MOD11
- **Fase:** Fase 01 - Tareas operativas transversales con responsable y destinatario
- **Version:** 1.0
- **Fecha:** 2026-06-22
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar el MVP de `TasksModule` con backend NestJS, migraciones TypeORM, contratos compartidos y UI Next.js en portal para gestionar tareas operativas transversales con responsable activo, destinatario explícito y vínculos lógicos con tickets, agenda y Work Orders.

### Resultado esperado

Un usuario autorizado puede crear una tarea manual o derivada de otro contexto, asignarla o reasignarla, consultar su historial, cambiar estados operativos y vincularla con `ticketId`, `scheduleEventId` o `workOrderId` sin romper boundaries del modulith.

### Lo que si entra

- `TasksModule` en `apps/api`.
- Enums de tareas en `@iwana/shared`.
- Entidades y migración tenant en `packages/database`.
- Endpoints REST `/api/v1/tasks`.
- Validaciones Zod.
- RBAC y ownership para técnico/contratista.
- Timeline append-only e historial de handoff.
- UI portal `/dashboard/operations`.
- Tests backend y frontend focalizados.
- Informe y checklist de calidad.

### Lo que no entra

- SLA propio de tareas independiente del ticket.
- Automatizaciones IA.
- BPM complejo de dependencias entre tareas.
- App móvil nativa.
- Integración profunda con tablas MOD10 o MOD09.
- Conversión de `WorkOrderTask` en tarea universal.

---

## 2. Artefactos de entrada obligatorios

- PRD del módulo: docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- HLD del módulo: docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md
- Spec de diseño: docs/specs/2026-06-22-mod11-operaciones-tareas-design.md
- ADR propuesto: docs/adrs/ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md
- Plan de implementación: docs/plans/2026-06-22-mod11-ejecucion-operativa-tareas-fase-01.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- MOD10 relacionado: docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md, docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
- MOD09 relacionado: docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md

### Artefactos faltantes detectados

- Ninguno. ADR-046 aprobado por CTO el 2026-06-23. Ejecución productiva autorizada.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer PRD, HLD, ADR, spec y plan antes de tocar código.
2. ADR-046 aprobado por CTO (2026-06-23). Proceder con implementación productiva.
3. Implementar primero contratos compartidos y migración reversible.
4. Implementar backend con TDD para creación, handoff, transición y ownership.
5. Implementar frontend solo después de estabilizar contratos backend.
6. Mantener `TasksModule` aislado de tablas MOD10, MOD09 y MOD05.
7. Tratar `ticketId`, `scheduleEventId` y `workOrderId` como referencias lógicas.
8. No duplicar PII sensible del destinatario.
9. Mantener UI operativa, densa y en español; no crear landing ni hero.
10. Actualizar OpenAPI y documentación de fase.

---

## 4. Restricciones no negociables

- No romper boundaries del modulith.
- No acceder a tablas de otro módulo directamente.
- No usar credenciales, tokens ni datos reales.
- No omitir validación Zod.
- No omitir pruebas de reglas core.
- No hardcodear tenant ni schema.
- No usar `synchronize: true`.
- No renderizar enums crudos en UI.
- No convertir `WorkOrderTask` en reemplazo de `OperationalTask`.
- No hacer que MOD10 sea owner de ejecución transversal.
- No hacer que MOD09 absorba tareas no agendables.

---

## 5. Entregables técnicos obligatorios

### Backend

- `packages/shared/src/enums/tasks/*`
- `packages/database/src/entities/operational-task.entity.ts`
- `packages/database/src/entities/task-timeline-event.entity.ts`
- `packages/database/src/entities/task-assignment-history.entity.ts`
- `packages/database/src/migrations/tenant/045_create_tasks_module.ts`
- `apps/api/src/modules/tasks/**`

### Frontend

- `apps/portal/src/app/dashboard/operations/page.tsx`
- `apps/portal/src/components/operations/**`
- Cliente API tipado para Tasks en `apps/portal/src/lib/api-client.ts`
- Navegación portal actualizada si corresponde

### Tests

- Unit tests backend de creación, reasignación y transición.
- Controller/integration tests de endpoints principales.
- Tests frontend de labels, formulario y listado.
- Verificación de ownership para técnico/contratista.

---

## 6. Entregables documentales obligatorios

- Actualizar `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-DEFINICION-v1.0.md`.
- Crear `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`.
- Crear `docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`.
- Actualizar PRD/HLD/ADR solo si cambia alcance aprobado.
- Documentar decisión stop/go si aparece bloqueo técnico.

---

## 7. Criterios de aceptación

- CA-TSK-01: Un usuario autorizado puede crear tarea manual sin ticket.
- CA-TSK-02: Una tarea diferencia responsable y destinatario.
- CA-TSK-03: El destinatario puede ser cliente o interno.
- CA-TSK-04: La tarea mantiene un único responsable activo.
- CA-TSK-05: La reasignación conserva historial.
- CA-TSK-06: La tarea puede existir sin agenda.
- CA-TSK-07: La tarea puede vincular `ticketId`, `scheduleEventId` y `workOrderId` como referencias lógicas.
- CA-TSK-08: Técnico/contratista no ve tareas ajenas.
- CA-TSK-09: OpenAPI actualizado.
- CA-TSK-10: Tests focalizados en verde o bloqueo documentado.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- ADR-046 no está aprobado y no existe autorización explícita para ejecución controlada.
- Se requiere acceso directo a tablas de MOD10, MOD09 o MOD05 para completar la fase.
- Se detecta necesidad de almacenar PII sensible en `OperationalTask`.
- La migración requiere FKs cross-schema.
- El diseño empuja a que `Ticket` y `Task` dupliquen el mismo ownership operativo.
- Se intenta usar `WorkOrderTask` como tarea universal.

### Documentar causa en

- `docs/informes/INFORME-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`
- `docs/quality/CHECKLIST-MOD11-EJECUCION-OPERATIVA-FASE-01-v1.0.md`

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy o numeración del módulo.

### Recomendación esperada

Presentar máximo 3 opciones, impacto y recomendación concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con tests focalizados.
- Frontend validado con tests focalizados.
- Base de datos validada con migración reversible.
- OpenAPI actualizado.
- Informe y checklist creados.
- Sin deuda crítica pendiente.
- ADR-046 en estado `Aprobado` (CTO, 2026-06-23).

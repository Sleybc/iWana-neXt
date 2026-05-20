# PROMPT - MOD10 Service Assurance / Mesa de Ayuda Fase 01

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09  
**Modo activo:** EM  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md  
**Archivo destino:** docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md

---

## Modulo

- **Nombre:** Service Assurance / Mesa de Ayuda
- **Codigo:** MOD10
- **Fase:** Fase 01 - Ticketing mixto + SLA + PQR + solicitud de campo
- **Version:** 1.0
- **Fecha:** 2026-05-09
- **Ejecutor previsto:** Sr. Dev Fullstack

---

## 1. Objetivo exacto de la fase

Implementar el MVP de Mesa de Ayuda con backend NestJS, migraciones TypeORM, contratos compartidos y UI Next.js en portal para gestionar tickets externos e internos con SLA, PQR, timeline, comentarios y solicitud de Work Order hacia WFM.

### Resultado esperado

Un usuario autorizado puede crear un ticket de cliente o interno, clasificarlo, asignarlo, comentar, cambiar estados, revisar SLA/PQR, solicitar trabajo de campo cuando aplique y consultar un dashboard operativo básico.

### Lo que si entra

- `AssuranceModule` en `apps/api`.
- Enums Assurance en `@iwana/shared`.
- Entidades y migración tenant en `packages/database`.
- Endpoints REST `/api/v1/assurance`.
- Validaciones Zod.
- RBAC y ownership para técnico/contratista.
- SLA simple de primera respuesta y resolución.
- PQR record con deadlines y timestamps.
- Timeline append-only.
- Puerto/evento hacia WFM para `assurance.field-service-needed`.
- UI portal `/dashboard/assurance`.
- Tests backend, frontend y E2E focalizado.
- Informe y checklist de calidad.

### Lo que no entra

- Diagnóstico automático de red.
- Correlación NMS -> tickets automáticos.
- Integración WhatsApp Business.
- IA para clasificación, resumen o respuesta sugerida.
- Portal cliente completo.
- Compensaciones automáticas por SLA.
- Catálogo ITSM avanzado para soporte interno.
- Cambios profundos en WFM, CRM, Billing o NMS.

---

## 2. Artefactos de entrada obligatorios

- PRD del módulo: docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md
- HLD del módulo: docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md
- Spec de diseño: docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md
- ADR propuesto: docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md
- Sprint plan aplicable: docs/plans/PLAN-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md
- Stack: docs/prds/Stack_Tecnologico.md
- Gobernanza: AGENTS.md, .github/copilot-instructions.md
- WFM relacionado: docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md, docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md
- Instrucciones aplicables: .github/instructions/api.instructions.md, .github/instructions/database.instructions.md, .github/instructions/frontend.instructions.md, .github/instructions/portal.instructions.md, .github/instructions/testing.instructions.md, .github/instructions/e2e.instructions.md

### Artefactos faltantes detectados

- ADR-038 está en estado `Propuesto`. No iniciar implementación productiva hasta aprobación CTO o autorización explícita de ejecución controlada.

---

## 3. Instrucciones para Sr. Dev Fullstack

1. Leer PRD, HLD, ADR, spec y plan antes de tocar código.
2. Confirmar el estado de ADR-038; si sigue `Propuesto`, detenerse y pedir aprobación antes de implementar.
3. Implementar primero contratos compartidos y migración reversible.
4. Implementar backend con TDD para transiciones, SLA, PQR y ownership.
5. Implementar el puerto/evento hacia WFM sin leer tablas WFM.
6. Implementar frontend después de estabilizar contratos backend.
7. Mantener UI operativa, densa y en español; no crear landing ni hero.
8. No duplicar PII del suscriptor en MOD10.
9. No consultar tablas de CRM, Users, WFM, Billing ni NMS.
10. Usar `UserRole.*` en `@Roles()`.
11. Actualizar OpenAPI y documentación de fase.

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
- No almacenar documento, teléfono, email ni datos financieros del suscriptor en tablas Assurance.
- No crear Work Orders desde Assurance como owner; usar puerto/evento hacia WFM.
- No implementar NMS/WhatsApp/IA en Fase 01.

---

## 5. Entregables tecnicos obligatorios

### Backend

- `packages/shared/src/enums/assurance/*`
- `packages/database/src/entities/support-ticket.entity.ts`
- `packages/database/src/entities/ticket-comment.entity.ts`
- `packages/database/src/entities/ticket-timeline-event.entity.ts`
- `packages/database/src/entities/ticket-sla-policy.entity.ts`
- `packages/database/src/entities/ticket-pqr-record.entity.ts`
- `packages/database/src/entities/ticket-work-order-link.entity.ts`
- `packages/database/src/migrations/tenant/031_create_assurance_module.ts`
- `apps/api/src/modules/assurance/**`

### Frontend

- `apps/portal/src/app/dashboard/assurance/page.tsx`
- `apps/portal/src/components/assurance/**`
- Cliente API tipado para Assurance en el lugar consistente con el patrón actual.
- Navegación portal actualizada si corresponde.

### Tests

- Unit tests backend de transiciones, SLA, PQR y solicitud de campo.
- Controller/integration tests de endpoints principales.
- Tests de aislamiento tenant.
- Tests frontend de formulario, filtros, labels, drawer y timeline.
- E2E portal focalizado para crear, comentar, resolver y solicitar campo.

---

## 6. Entregables documentales obligatorios

- Informe de fase: crear `docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`.
- Checklist de calidad: `docs/quality/CHECKLIST-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`.
- Actualizar PRD/HLD/ADR solo si cambia alcance aprobado.
- Decisión stop/go documentada si aparece bloqueo técnico.
- Si ADR-038 se aprueba, actualizar su estado y registrar aprobación.

---

## 7. Criterios de aceptacion

- CA-ASS-01: SUPPORT/NOC/ADMIN crea ticket externo ligado a requester/subject tipado.
- CA-ASS-02: SUPPORT/NOC/ADMIN crea ticket interno sin cliente asociado.
- CA-ASS-03: Ticket PQR crea registro regulatorio con deadlines y timestamps.
- CA-ASS-04: Ticket no PQR calcula primera respuesta y resolución según política SLA.
- CA-ASS-05: Transiciones inválidas son rechazadas.
- CA-ASS-06: Comentario interno no es visible al solicitante por defecto.
- CA-ASS-07: Timeline registra creación, asignación, comentarios, transición y solicitud de campo.
- CA-ASS-08: Solicitar campo emite evento o invoca puerto hacia WFM sin leer tablas WFM.
- CA-ASS-09: `workOrderId` puede asociarse al ticket como referencia lógica.
- CA-ASS-10: Técnico/contratista no ve tickets ajenos.
- CA-ASS-11: Dashboard muestra abiertos, en riesgo, vencidos y carga por cola.
- CA-ASS-12: UI portal permite crear, filtrar, comentar, resolver y solicitar campo.
- CA-ASS-13: OpenAPI actualizado.
- CA-ASS-14: Tests focalizados en verde o bloqueo documentado.

---

## 8. Criterio de stop/go

### Detenerse inmediatamente si

- ADR-038 no está aprobado y no existe autorización explícita para ejecución controlada.
- Se requiere acceso directo a tablas de otro módulo para completar la fase.
- Se detecta necesidad de almacenar PII sensible no aprobada en Assurance.
- La migración requiere FKs cross-schema.
- El flujo de PQR exige interpretación regulatoria no confirmada.
- Tests de aislamiento tenant fallan por causa de diseño.
- Se necesita cambiar el boundary de WFM o CRM.

### Documentar causa en

- `docs/quality/TEMPLATE-DECISION-BLOQUEO-TECNICO.md` como base, si existe.
- Informe de fase en `docs/informes/`.

### Escalar a

- EM-ARCH primero.
- CTO si afecta boundary, seguridad, multi-tenancy, cumplimiento o numeración de módulo.

### Recomendacion esperada

Presentar máximo 3 opciones, impacto y recomendación concreta.

---

## 9. Criterio de salida de la fase

- Backend validado con tests focalizados.
- Frontend validado con tests focalizados.
- Base de datos validada con migración reversible.
- E2E ejecutado o bloqueo documentado.
- OpenAPI actualizado.
- Informe y checklist creados.
- Sin deuda crítica pendiente.
- ADR-038 actualizado a `Aprobado` antes de considerar la fase productiva.
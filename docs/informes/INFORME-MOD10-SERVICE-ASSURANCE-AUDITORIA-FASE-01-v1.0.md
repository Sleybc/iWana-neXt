# INFORME - MOD10 Service Assurance / Mesa de Ayuda Auditoria Fase 01

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09  
**Modo activo:** Mixto  
**Modulo:** MOD10 Service Assurance / Mesa de Ayuda  
**Auditor:** AI-EM-ARCH  
**Alcance:** Auditoria propuesto vs ejecutado tras ejecucion Fullstack  

---

## 1. Veredicto ejecutivo

**Decision:** GO para cierre tecnico de MOD10 Fase 01; seguimiento operativo posterior para consumidor WFM downstream.

La ejecucion materializo el bounded context `AssuranceModule`, persistencia tenant-aware, migracion reversible, contratos compartidos, UI de portal, navegacion, pruebas focalizadas y E2E de Mesa de ayuda. Frente al corte anterior, se corrigieron brechas relevantes: validacion Zod en boundary HTTP, `dashboard/summary` con `byQueue`, prueba Swagger automatizada, regla de `RESOLVED` con nota obligatoria y guardas PQR antes de resolver/cerrar.

Las evidencias parciales identificadas por auditoria fueron cerradas con pruebas focalizadas adicionales: ticket interno sin cliente, SLA no PQR, transicion invalida general, timeline completo y ownership `CONTRACTOR`. Tambien se amplio la verificacion OpenAPI para validar el schema critico de `dashboard/summary` con `byQueue`.

---

## 2. Artefactos propuestos auditados

- `docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- `docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md`
- `docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- `docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md`
- `docs/plans/PLAN-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- `docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- `docs/quality/CHECKLIST-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- `docs/informes/INFORME-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`

---

## 3. Propuesto vs ejecutado

| Area propuesta | Ejecucion encontrada | Estado |
| --- | --- | --- |
| Bounded context propio `AssuranceModule` | `apps/api/src/modules/assurance/` y registro en `apps/api/src/app.module.ts` | Cumple |
| Contratos compartidos | `packages/shared/src/enums/assurance/*` exportado desde `packages/shared/src/index.ts` | Cumple |
| Persistencia tenant-aware | Entidades `SupportTicket`, `TicketComment`, `TicketTimelineEvent`, `TicketSlaPolicy`, `TicketPqrRecord`, `TicketWorkOrderLink` | Cumple |
| Migracion reversible | `packages/database/src/migrations/tenant/031_create_assurance_module.ts` y registro en runner tenant | Cumple |
| API REST `/api/v1/assurance` | Controller con rutas tickets, comments, timeline, SLA policies y dashboard | Cumple |
| Validacion Zod en boundaries externos | `ZodValidationPipe` aplicado en `@Body()` y `@Query()` del controller | Cumple |
| RBAC y ownership | `@Roles(UserRole.*)` y filtro restrictivo para `TECHNICIAN`/`CONTRACTOR` en servicios | Cumple con evidencia parcial |
| PQR y SLA | Creacion de PQR, calculo de dias habiles, deadlines no PQR y estados de breach | Cumple con evidencia parcial |
| Integracion WFM | Puerto `AssuranceFieldServicePort` y adapter BullMQ sin lectura de tablas WFM | Cumple con riesgo operativo |
| Portal `/dashboard/assurance` | Pantalla, formulario, tabla, drawer, labels, acciones y sidebar | Cumple |
| OpenAPI | Decorators Swagger y `assurance.swagger.spec.ts` con validacion de schema critico `dashboard/summary` | Cumple |
| Informe/checklist | Informe de fase, checklist y esta auditoria viva | Cumple |

---

## 4. Evidencia validada por auditoria

| Comando | Resultado |
| --- | --- |
| `pnpm --filter @iwana/api test -- src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/comments.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts src/modules/assurance/tests/assurance.tenant-isolation.spec.ts src/modules/assurance/assurance.swagger.spec.ts --runInBand` | OK: 5 suites, 38 pruebas |
| `pnpm --filter @iwana/api typecheck` | OK |
| `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/AssuranceCreateTicketForm.spec.tsx src/components/assurance/assurance-labels.spec.ts src/components/layout/Sidebar.spec.tsx` | OK: 3 suites, 6 pruebas |
| `pnpm --filter @iwana/portal typecheck` | OK |
| `pnpm --filter @iwana/portal lint` | OK |
| `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-assurance.spec.ts` | OK: 1 prueba |

---

## 5. Hallazgos por severidad

### H1 - Brechas de evidencia CA cerradas

**Severidad:** Resuelto  
**Criterios afectados:** CA-ASS-02, CA-ASS-04, CA-ASS-05, CA-ASS-07, CA-ASS-10.  
**Evidencia:** `tickets.service.spec.ts` y `comments.service.spec.ts` incorporan pruebas focalizadas para ticket interno sin cliente, SLA no PQR con politica aplicada, transicion invalida general, timeline completo y ownership `CONTRACTOR`.  
**Accion:** Sin accion bloqueante para cierre tecnico.

### H2 - Integracion WFM desacoplada pero operacionalmente degradada si no hay consumidor

**Severidad:** Media  
**Evidencia:** `AssuranceFieldServiceAdapter` encola en `ASSURANCE_FIELD_SERVICE_QUEUE`; si no hay queue disponible registra `DEGRADED MODE` y no envia solicitud downstream.  
**Riesgo:** El ticket queda en `FIELD_SERVICE_REQUESTED` sin garantia de OT real si el consumidor WFM no esta activo.  
**Accion:** Crear historia tecnica o contrato de consumidor WFM efectivo; mantener el modo degradado como comportamiento documentado, no como cierre funcional completo.

### H3 - OpenAPI con schema critico ampliado

**Severidad:** Resuelto  
**Evidencia:** `assurance.swagger.spec.ts` valida paths, operaciones esenciales y schema `200` de `dashboard/summary`, incluyendo `byQueue`, contadores y agregaciones.  
**Accion:** Sin accion bloqueante para cierre tecnico.

### H4 - Drift de alcance alrededor de CRM/WFM scheduling

**Severidad:** Baja  
**Evidencia:** El diff actual incluye cambios en CRM expedientes, WFM scheduling, componentes de agendamiento y E2E WFM, ademas de MOD10.  
**Riesgo:** Mezclar remates MOD09/CRM con auditoria MOD10 puede diluir ownership documental y criterios de cierre.  
**Accion:** Mantener estos cambios trazados en informes MOD09/CRM existentes; no usarlos como evidencia de cierre MOD10 salvo el puerto de solicitud de campo.

---

## 6. Matriz CA-ASS actualizada

| Criterio | Estado auditoria | Nota |
| --- | --- | --- |
| CA-ASS-01 | Cumple | Creacion de ticket externo tipado implementada y probada por servicio/HTTP. |
| CA-ASS-02 | Cumple | Prueba focalizada verifica ticket interno sin cliente asociado. |
| CA-ASS-03 | Cumple | Pruebas focalizadas verifican PQR, deadline habil y guardas regulatorias. |
| CA-ASS-04 | Cumple | Prueba focalizada verifica politica SLA no PQR y deadlines aplicados. |
| CA-ASS-05 | Cumple | Prueba focalizada verifica transicion invalida general y `RESOLVED` exige notas. |
| CA-ASS-06 | Cumple | Comentarios internos se filtran para roles restringidos. |
| CA-ASS-07 | Cumple | Pruebas focalizadas verifican eventos de creacion, asignacion, comentario, transicion, campo y work order. |
| CA-ASS-08 | Cumple | Puerto WFM invocado sin lectura directa de tablas WFM. |
| CA-ASS-09 | Cumple | `workOrderId` se asocia como referencia logica sin FK cross-module. |
| CA-ASS-10 | Cumple | Prueba focalizada verifica `CONTRACTOR` contra ticket ajeno. |
| CA-ASS-11 | Cumple | Dashboard expone abiertos, riesgo, vencidos y `byQueue`. |
| CA-ASS-12 | Cumple | Portal opera crear, filtrar, comentar, solicitar campo, vincular OT y resolver en E2E focalizado. |
| CA-ASS-13 | Cumple | Swagger decorators y prueba automatizada de endpoints y schema critico presentes. |
| CA-ASS-14 | Cumple | Validaciones focalizadas API, portal y E2E en verde. |

**Resumen:** 14 cumplidos, 0 parciales, 0 pendientes.

---

## 7. Riesgos de arquitectura y seguridad

| Riesgo | Nivel | Lectura EM-ARCH |
| --- | --- | --- |
| Boundary MOD10/WFM | Medio | Correcto a nivel arquitectura por puerto/evento; incompleto como flujo operacional sin consumidor auditado. |
| Multi-tenancy | Bajo | Uso de `TenantContext.getOrThrow()` y `runInTenantSchema()` consistente; migracion tenant sin schema hardcodeado. |
| PII | Bajo | Assurance persiste referencias logicas (`requesterRefId`, `subjectRefId`) y no duplica telefono/documento/email del suscriptor en tablas MOD10. |
| Validacion externa | Bajo | `ZodValidationPipe` en controller cubre entrada HTTP; mantiene errores 400 semanticos. |
| Contrato OpenAPI | Bajo | Hay documentacion automatizada y validacion de schema critico de dashboard. |

No se identifica excepcion que requiera `[ESCALACION AL CTO]` en este corte. ADR-038 figura como **Aprobado** y habilita ejecucion controlada.

---

## 8. Recomendacion EM-ARCH

1. Declarar **GO para cierre tecnico de MOD10 Fase 01**.
2. Registrar como historia tecnica la integracion efectiva del consumidor WFM para `ASSURANCE_FIELD_SERVICE_QUEUE`.
3. Mantener seguimiento de WFM downstream como riesgo operativo, no como bloqueo de evidencia MOD10.
4. Mantener separados los remates CRM/WFM scheduling del criterio de cierre MOD10, salvo la integracion por puerto documentada en ADR-038.

---

## 9. Estado de salida

La auditoria confirma ejecucion sustancial, coherente con el stack aprobado y sin ruptura arquitectonica visible. MOD10 queda en condiciones de cierre tecnico de Fase 01 con backend, portal, OpenAPI ampliado y E2E focalizado en verde; la integracion WFM efectiva queda como historia operativa posterior.

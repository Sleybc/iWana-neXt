# INFORME - MOD10 Service Assurance / Mesa de Ayuda Fase 01

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-11  
**Modo activo:** Mixto  
**Modulo:** MOD10 Service Assurance / Mesa de Ayuda  
**ADR rector:** docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md  
**Checklist relacionado:** docs/quality/CHECKLIST-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md

---

## 1. Objetivo de la fase

Registrar el estado real de la Fase 01 de MOD10 con evidencia backend, portal y E2E focalizado del bounded context `AssuranceModule`, dejando explícitos los criterios todavía parciales antes del cierre formal de fase.

---

## 2. Documentos fuente verificados

- Gobernanza base: `AGENTS.md`
- Stack aprobado: `docs/prds/Stack_Tecnologico.md`
- PRD del módulo: `docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- HLD del módulo: `docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md`
- Spec de diseño: `docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md`
- ADR aprobado: `docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md`
- Plan de fase: `docs/plans/PLAN-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`
- Prompt de ejecución: `docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md`

---

## 3. Implementación verificada en el repo

### 3.1 Artefactos backend y frontend presentes

| Componente | Evidencia verificada | Observación |
| --- | --- | --- |
| Enums y contratos compartidos | `packages/shared/src/enums/assurance/*` | Incluye `ticket-source`, `ticket-requester-type`, `ticket-subject-type`, `ticket-queue`, `ticket-field-decision` y enums SLA/PQR. |
| Persistencia tenant-aware | `packages/database/src/entities/support-ticket.entity.ts`, `ticket-comment.entity.ts`, `ticket-timeline-event.entity.ts`, `ticket-sla-policy.entity.ts`, `ticket-pqr-record.entity.ts`, `ticket-work-order-link.entity.ts` | El modelo evita FKs cross-module y mantiene referencias lógicas. |
| Migración reversible | `packages/database/src/migrations/tenant/031_create_assurance_module.ts` | Crea tablas, enums e índices de MOD10 y declara `down()` reversible. |
| Módulo API | `apps/api/src/modules/assurance/assurance.module.ts`, `assurance.controller.ts`, `services/*`, `ports/*` | El módulo expone contratos REST y puerto tipado hacia solicitud de campo. |
| Pruebas focalizadas backend | `apps/api/src/modules/assurance/tests/*.spec.ts` | Existen pruebas unitarias, HTTP y de aislamiento tenant para el backend implementado. |
| Portal Mesa de ayuda | `apps/portal/src/app/dashboard/assurance/page.tsx`, `apps/portal/src/components/assurance/*`, `apps/portal/src/lib/api-client.ts`, `apps/portal/src/components/layout/Sidebar.tsx` | La ruta `/dashboard/assurance` quedó operativa con formulario, tabla, drawer, labels de negocio y navegación integrada. |
| Pruebas portal y E2E | `apps/portal/src/components/assurance/*.spec.ts*`, `apps/portal/src/components/layout/Sidebar.spec.tsx`, `e2e/tests/portal-assurance.spec.ts` | Hay evidencia verificada para labels, formulario, navegación y journey focalizado create/comment/field-service/resolve. |

### 3.2 Capacidades visibles en código

- Persistencia de `requesterType`, `requesterRefId`, `subjectType`, `subjectRefId`, `source`, `queueName` y `fieldDecision` en `TicketsService` y `SupportTicket`.
- Alias REST operativos para Fase 01 en `AssuranceController`: `POST /tickets/:id/request-field-service` y `POST /tickets/:id/link-work-order`.
- Solicitud de trabajo de campo desacoplada de WFM mediante `AssuranceFieldServicePort`; el adapter actual usa cola BullMQ y hace fallback por log si la cola no está disponible.
- Validación con Zod + `class-validator` para create/update/list/status/comment/assign/link-work-order.
- Ownership restrictivo para `TECHNICIAN` y `CONTRACTOR` al listar y consultar tickets asignados.
- Swagger decorators presentes en controller y DTOs del módulo `assurance`.
- El portal expone `/dashboard/assurance` con tabla densa `align-middle`, drawer de detalle, timeline, comentarios y acciones de transición/solicitud de campo/vínculo de work order.
- `assuranceApi` consume los contratos de tickets, comentarios, timeline, SLA y dashboard summary sin renderizar enums crudos; los labels visibles quedan centralizados en `apps/portal/src/components/assurance/assurance-labels.ts`.

---

## 4. Pruebas ejecutadas y resultado

| Comando | Resultado verificado | Lectura operativa |
| --- | --- | --- |
| `pnpm --filter @iwana/api test -- src/modules/assurance/tests/tickets.service.spec.ts src/modules/assurance/tests/comments.service.spec.ts src/modules/assurance/tests/assurance.controller.http.spec.ts src/modules/assurance/tests/assurance.tenant-isolation.spec.ts src/modules/assurance/assurance.swagger.spec.ts --runInBand` | **OK** — 5 suites, 38 pruebas, exit code 0 | Confirma backend focalizado en verde para create/list/comment/request-field-service/link-work-order/HTTP/tenant isolation/PQR/SLA/transiciones/ownership/OpenAPI. |
| `pnpm --filter @iwana/api typecheck` | **OK** — exit code 0 | Confirma que el backend MOD10 compila a nivel TypeScript en el workspace `@iwana/api`. |
| `pnpm --filter @iwana/portal typecheck` | **OK** — exit code 0 | Confirma que la UI portal de Mesa de ayuda compila en TypeScript. |
| `pnpm --filter @iwana/portal lint` | **OK** — exit code 0 | Confirma alineación del portal con reglas frontend del repo. |
| `cd apps/portal && npx jest src/components/assurance/AssuranceCreateTicketForm.spec.tsx src/components/assurance/assurance-labels.spec.ts src/components/layout/Sidebar.spec.tsx --runInBand` | **OK** — 3 suites, 6 pruebas, exit code 0 | Verifica labels, formulario base y navegación expuesta al portal. |
| `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-assurance.spec.ts` | **OK** — 1 prueba, exit code 0 | Evidencia focalizada del journey portal: crear ticket, comentar, pasar a progreso, solicitar trabajo de campo, vincular work order y resolver. |

### Evidencias focalizadas cerradas

- Ticket interno sin cliente asociado verificado en `tickets.service.spec.ts`.
- PQR regulatorio verificado con creación de registro, deadline hábil y guardas de completitud para resolver/cerrar.
- Cálculo SLA no PQR verificado con política aplicada y deadlines de primera respuesta/resolución.
- Rechazo de transición inválida general verificado.
- Timeline verificado para creación/asignación/comentario/transición/solicitud de campo/vínculo de work order.
- Ownership `CONTRACTOR` verificado contra ticket ajeno.
- OpenAPI ampliado con schema crítico de `dashboard/summary`, incluyendo `byQueue`.

---

## 5. Evidencias cerradas y riesgos remanentes

### 5.1 Evidencia funcional backend aún incompleta

El backend base queda cubierto con evidencia focalizada para los criterios funcionales que estaban parciales:

- escenario de ticket interno sin cliente asociado;
- flujo PQR con verificación específica del registro regulatorio;
- cálculo SLA no PQR con aserción focalizada;
- rechazo de transiciones inválidas del flujo general;
- timeline completo de hitos funcionales;
- ownership explícito para `CONTRACTOR`.

**Actualización Task 3:** El dashboard ahora expone carga por cola (`byQueue`) según PRD, y existe verificación OpenAPI automatizada local sin artefactos generados en el repo. El adapter de WFM registra explícitamente modo degradado cuando la cola no está disponible.

**Actualización Task 3 — review gaps resueltos:** La agregación `byQueue`, `byPriority` y `byType` ahora excluye correctamente tickets con estado `RESOLVED` de la carga activa de cola (alineado con spec: "solución registrada, pendiente cierre" no es carga operativa). El test Swagger ahora valida endpoint y schema crítico de `dashboard/summary`, incluyendo `byQueue`.

### 5.2 Riesgos funcionales aún abiertos en portal

- La acción **Vincular work order** sigue siendo manual por UUID; no existe selector enriquecido desde WFM en Fase 01.
- La búsqueda del listado sigue siendo local en frontend; el backend expuesto en este corte no publica filtro textual dedicado.
- Las políticas SLA se consumen para creación, pero no existe edición portal en esta fase.

### 5.3 Documentación viva

- Este corte crea los dos documentos vivos requeridos para la fase: informe y checklist.
- No quedan documentos de cierre pendientes dentro del alcance solicitado en esta tarea.

---

## 6. Riesgos y deuda técnica

| Riesgo / deuda | Impacto actual | Evidencia |
| --- | --- | --- |
| ~~Cobertura funcional backend incompleta~~ ✅ | ~~Media~~ **Resuelto** | Los 14 criterios CA-ASS quedan cubiertos por pruebas focalizadas y checklist actualizado. |
| ~~Dashboard sin agregación por cola~~ ✅ | ~~Media~~ **Resuelto** | `AssuranceDashboardService` ahora expone `byQueue` y está verificado en prueba HTTP con byQueue validado. |
| Integración WFM en modo degradado | Media | El adapter a cola existe; el fallback registra explícitamente DEGRADED MODE cuando la cola no está disponible, permitiendo operación sin downstream consumer activo. |
| Vinculación de work order manual | Baja | El portal acepta UUID manual; un selector visual desde WFM queda fuera del alcance actual. |
| ~~Verificación OpenAPI automatizada~~ ✅ | ~~Media~~ **Resuelto** | Existe prueba automatizada `assurance.swagger.spec.ts` que verifica endpoints esenciales, sin artefactos JSON/YAML en el repo. |

---

## 7. Decisión operativa actual

**Decisión:** **GO para cierre técnico de MOD10 Fase 01**.

### Fundamento

- `ADR-038` ya está aprobado y habilita la ejecución controlada del bounded context.
- El backend de MOD10 quedó tipado, compila y pasa pruebas focalizadas verificadas en este corte.
- El portal de MOD10 ya está operativo y cuenta con validación de typecheck, lint, unitarias focalizadas y E2E portal de Mesa de ayuda.
- Los 14 criterios CA-ASS quedan documentados como cumplidos con evidencia focalizada backend, portal y E2E.

### Acciones siguientes recomendadas

1. ~~Añadir pruebas focalizadas faltantes para ticket interno, PQR, SLA y transiciones inválidas.~~ ✅ **Completado en cierre de evidencias.**
2. ~~Extender el dashboard backend para exponer carga por cola según PRD o documentar ajuste de criterio.~~ ✅ **Completado en Task 3.**
3. ~~Verificar salida OpenAPI del módulo antes del cierre final de fase.~~ ✅ **Completado en Task 3 con `assurance.swagger.spec.ts`.**

---

## 8. Estado de salida del corte documental

La documentación viva de MOD10 Fase 01 queda actualizada con evidencia real del repo: backend operativo, portal implementado, pruebas portal en verde, E2E focalizado de Mesa de ayuda, dashboard `byQueue`, OpenAPI con schema crítico y remate de evidencias backend para ticket interno, PQR, SLA, transiciones inválidas, timeline y ownership `CONTRACTOR`. La integración WFM downstream efectiva queda como historia operativa posterior.

## 9. Correcciones y extensiones posteriores

- 2026-05-09: **Nuevo valor de enum y endpoint idempotente para instalaciones CRM** — Se extendió Assurance para soportar el flujo de ticket de instalación originado en expedientes CRM. Cambios aplicados: (1) `packages/shared/src/enums/assurance/ticket-subject-type.enum.ts` agrega `EXPEDIENTE = 'EXPEDIENTE'` y `apps/portal/src/components/assurance/assurance-labels.ts` agrega el label `'Expediente'`; (2) nuevo esquema Zod `FindOrCreateInstallationTicketSchema` en `apps/api/src/modules/assurance/dto/index.ts`; (3) método `findOrCreateInstallationTicket(dto, actorUserId)` en `apps/api/src/modules/assurance/services/tickets.service.ts` con constante `INSTALLATION_OPEN_STATUSES` para reutilización idempotente (busca ticket abierto mismo expediente antes de crear); (4) endpoint `POST /api/v1/assurance/tickets/find-or-create-installation` con roles `ADMIN`, `NOC`, `SUPPORT`, `SYSTEM_ADMIN`; (5) el parámetro `actorUserId` es explícito en el servicio porque `TenantContextPayload` no expone `userId` y `created_by_user_id` es NOT NULL en `SupportTicket`. Validación: `pnpm --filter @iwana/api test -- tickets.service.spec.ts` en verde (20/20), `pnpm --filter @iwana/api typecheck` en verde.
- 2026-05-11: **Corrección de navegación portal para Mesa de ayuda** — Se restauró la visibilidad de MOD10 en la navegación del portal empresarial. Cambios aplicados: (1) se agregó `'/dashboard/assurance'` con label `Mesa de ayuda` en `apps/portal/src/components/layout/Sidebar.tsx`; (2) se agregó el mismo acceso en `quickLinks` de `apps/portal/src/components/search/GlobalSearchOverlay.tsx` para acceso rápido consistente; (3) se reforzó la cobertura con regresión en `apps/portal/src/components/layout/Sidebar.spec.tsx` validando presencia del enlace y `href` correcto. Validación: `pnpm --filter @iwana/portal test -- --runInBand src/components/layout/Sidebar.spec.tsx` en verde (1 suite, 2 pruebas).
- 2026-05-11: **Corrección de carga de vista en Mesa de ayuda (404 runtime)** — Se corrigió el error `No fue posible cargar la vista` con detalle `El ticket consultado ya no está disponible` que aparecía al abrir `/dashboard/assurance`. Causa raíz: `AssuranceModule` existía en `apps/api/src/modules/assurance/`, pero no estaba registrado en `apps/api/src/app.module.ts`, por lo que `/api/v1/assurance/tickets` respondía `404` en runtime del API principal. Cambios aplicados: (1) import y registro explícito de `AssuranceModule` en `AppModule`; (2) ajuste de UX en `apps/portal/src/components/assurance/AssuranceClient.tsx` para mapear `404` de carga global a mensaje de disponibilidad del servicio, evitando texto engañoso de ticket puntual. Validación: `pnpm --filter @iwana/api typecheck` en verde y `pnpm --filter @iwana/portal test -- --runInBand src/components/layout/Sidebar.spec.tsx src/components/assurance/AssuranceCreateTicketForm.spec.tsx src/components/assurance/assurance-labels.spec.ts` en verde (3 suites, 6 pruebas).

# INFORME MOD09 — Fix rail "Pendientes por programar" muestra trabajos ya agendados

**Versión:** 1.0
**Fecha:** 2026-09-01
**Módulo:** MOD09 Scheduling/WFM (apps/api `wfm` + apps/portal scheduling)
**Modo de sesión:** Orquestador AI-EM-ARCH (perfil v2.4) — delegación contract-first a AI-SR-FULL y AI-FE-PLATFORM
**Estado:** Cerrado — gates en verde

---

## 1. Síntoma

En `/dashboard/scheduling/agenda`, el panel **Pendientes por programar** (`PendingVisitsRail`) seguía listando trabajos que ya tenían evento en la grilla del día (caso reportado: instalación ya agendada 07:00–09:30 que persistía en la rail).

## 2. Diagnóstico (causa raíz)

- El fetch del rail (`SchedulingClient.tsx:606-612`) llama `GET /wfm/visit-requests` **sin filtro de estado**; el backend (`visit-requests.service.ts`, `listVisitRequests`) solo filtra `tenant_id` + `deleted_at` — el filtro de status es opt-in.
- La exclusión de agendados vivía 100% en el cliente (`filterActionablePendingVisitRequests`), que solo descarta estados terminales de la VisitRequest (`SCHEDULED/CANCELLED/REJECTED/EXPIRED`).
- Escenarios que reproducen el bug: (a) drift de datos — VR con `schedule_event_id` de evento activo pero status `READY_TO_SCHEDULE`; (b) evento creado por vía que no transiciona la VR (quick-create `POST /wfm/events`, orquestación de tareas) con igual expediente CRM; (c) VR en `IN_EXECUTION`/`CLOSED` que el cliente no excluía.
- Agravante de cuota: el backend devolvía las primeras 8/12 VRs de **todos** los estados; las `SCHEDULED` consumían página del rail.

## 3. Decisión (contrato congelado por AI-EM-ARCH)

`GET /api/v1/wfm/visit-requests` gana query param opcional **`scope: 'all' | 'actionable'`** (default `all`, backward-compatible). Con `actionable`:

1. Solo estados programables: `PENDING, NEEDS_CONTEXT, READY_TO_SCHEDULE, REQUIRES_RESCHEDULE` (REQUIRES_RESCHEDULE vuelve a la rail por diseño, ADR-077).
2. Excluye VRs con trabajo de campo activo ya agendado, reutilizando la semántica de `findActiveScheduleWorkByOrigin` (ADR-076 D2): (a) evento vinculado por `schedule_event_id` no terminal/activo, o (b) evento activo por `expediente_id` + mismo `work_type` (solo vínculo estructural; sin heurísticas de título).

Los demás consumidores del endpoint (bandeja `PendingVisitRequestsView`, `UnrealizedVisitsView`, orquestación de origen) no cambian.

## 4. Cambios

| Archivo | Cambio |
| --- | --- |
| `apps/api/src/modules/wfm/dto/list-visit-requests-query.dto.ts` | `scope` en Zod + DTO class-validator con `@ApiPropertyOptional` (OpenAPI actualizado) |
| `apps/api/src/modules/wfm/services/visit-requests.service.ts` | Constante `ACTIONABLE_VISIT_REQUEST_STATUSES` + exclusiones (1), (2a), (2b) vía subconsultas `NOT EXISTS` dentro de `runInTenantSchema`, solo si `scope === 'actionable'` |
| `apps/api/src/modules/wfm/services/visit-requests.scope-actionable.spec.ts` | **Nuevo** — 5 tests: exclusión por status, caso drift, evento CRM por expediente, no-exclusión de `REQUIRES_RESCHEDULE` con evento terminal y VR sin eventos, y no-regresión con scope ausente/`all` |
| `apps/portal/src/lib/api-client.ts` | `ListWfmVisitRequestsParams.scope?` + propagación a query string |
| `apps/portal/src/components/scheduling/SchedulingClient.tsx` | Fetch del rail (dashboard y agenda vista día) envía `scope: 'actionable'` |
| `apps/portal/src/components/scheduling/pending-visits-ui.ts` | Defensa en profundidad: `ACTIONABLE_VISIT_REQUEST_STATUSES` exportado; `filterActionablePendingVisitRequests` ahora filtra por pertenencia (incluir solo programables) |
| `apps/portal/src/components/scheduling/pending-visits-ui.spec.ts` / `SchedulingClient.spec.tsx` | Casos actualizados + aserciones de `scope: 'actionable'` en ambos paths del rail |

Sin migraciones: corrección a nivel query, sin cambio de schema. El caso drift desaparece del rail sin mutar datos.

## 5. Verificación (gates)

| Gate | Resultado |
| --- | --- |
| Tests backend (`visit-requests*`) | 5 suites, **65/65** en verde (incluye 5 nuevos) |
| Tests portal (`pending-visits-ui.spec`) | **9/9** en verde |
| Aserciones scope (`SchedulingClient.spec` -t rail/resumen operativo) | **2/2** en verde |
| Typecheck (`@iwana/api`, `@iwana/portal`) | Sin errores (exit 0) |
| Lint (archivos tocados) | **0 errores** (2 warnings preexistentes de hook-deps fuera de las líneas del cambio) |
| OpenAPI | Actualizado (nuevo param documentado en Swagger) |
| PII | Cero; tests con datos sintéticos |
| Boundary | Cambios confinados al módulo wfm + componentes scheduling del portal; sin acceso cruzado a tablas |

**Nota:** `SchedulingClient.spec.tsx` tiene 3 fallas preexistentes (toolbar "Vistas operativas", "OT vinculada", "manual visit language") correspondientes a trabajo paralelo en el árbol de otros agentes — verificadas preexistentes vía `git stash` por AI-FE-PLATFORM y reproducidas por el orquestador. No son regresión de este cambio.

## 6. Impacto

- **Multi-tenant:** exclusiones dentro de `runInTenantSchema`; subconsultas resuelven por `SET LOCAL search_path`; `tenantId` del contexto, nada hardcodeado.
- **Seguridad:** sin cambios de autorización (restricción SALES se evalúa antes del scope).
- **Escala:** el rail ya no desperdicia cuota de página en estados no programables; subconsultas apoyadas en columnas ya indexadas (`schedule_event_id`, `expediente_id`).
- **Regulación:** sin impacto.

## 7. Deuda / observaciones

1. **Limitación conocida:** eventos creados manualmente **sin** vínculo estructural (sin `expediente_id` ni relación con la VR) no son detectables como "ya agendado" — excluirlos exigiría heurísticas frágiles (fuera de alcance por decisión de diseño).
2. `ScheduleEventsService.create` (`POST /wfm/events`) sigue sin reconciliar VRs existentes por origen; si el producto quiere reconciliación automática, requerirá definición propia (posible ADR).
3. Revisar semántica de la bandeja completa (`PendingVisitRequestsView`) respecto de estados no programables en una iteración posterior (fuera de este scope).

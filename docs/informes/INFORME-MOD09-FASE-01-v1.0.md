# INFORME - MOD09 Programacion / WFM Fase 01

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-06  
**Modo activo:** Mixto  
**Modulo:** MOD09 Programacion / WFM  
**Responsable principal:** GitHub Copilot

---

## 1. Vinculos de trazabilidad

- Prompt: `docs/prompts/PROMPT-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md`
- PRD: `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md`
- HLD: `docs/hlds/HLD-MOD09-PROGRAMACION-WFM-v1.0.md`
- Spec: `docs/specs/SPEC-MOD09-PROGRAMACION-WFM-DISENO-v1.0.md`
- ADR principal: `docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md`
- Plan: `docs/plans/PLAN-MOD09-PROGRAMACION-WFM-FASE-01-v1.0.md`
- Stack: `docs/prds/Stack_Tecnologico.md`
- Informe de definicion: `docs/informes/INFORME-MOD09-DEFINICION-v1.0.md`

---

## 2. Resumen ejecutivo

Se implemento la Fase 01 de MOD09 como bounded context `WfmModule`, cubriendo agenda operativa tenant-aware, work order ligera, dashboard basico y UI portal en `/dashboard/scheduling`.

El alcance entregado incluye persistencia TypeORM por schema tenant, endpoints REST `/api/v1/wfm`, controles de ownership para roles restringidos, formularios y vistas operativas en portal, pruebas backend/frontend focalizadas y un E2E de portal para crear, reagendar y completar.

---

## 3. Entregables implementados

### Backend

- Enums WFM en `packages/shared/src/enums/wfm/**`.
- Entidades tenant-aware:
  - `schedule-event.entity.ts`
  - `work-order.entity.ts`
  - `work-order-task.entity.ts`
  - `schedule-reschedule-log.entity.ts`
  - `technician-availability.entity.ts`
- Migracion reversible: `packages/database/src/migrations/tenant/030_create_wfm_module.ts`
- Modulo API: `apps/api/src/modules/wfm/**`
  - controller
  - services
  - DTOs
  - port/adapter tipado
  - suites de prueba

### Frontend portal

- Ruta: `apps/portal/src/app/dashboard/scheduling/page.tsx`
- Componentes: `apps/portal/src/components/scheduling/**`
- Cliente API tipado WFM en `apps/portal/src/lib/api-client.ts`
- Navegacion real en `apps/portal/src/components/layout/Sidebar.tsx`

### E2E

- `e2e/tests/portal-wfm-scheduling.spec.ts`
  - flujo ADMIN: crear -> reagendar -> completar evento -> cerrar OT
  - flujo TECHNICIAN: solo visibilidad de trabajos asignados

---

## 4. Decisiones tecnicas materializadas

1. `WfmModule` se mantiene desacoplado de CRM por puerto tipado; no accede a tablas de otro modulo.
2. Multi-tenancy por schema desde el inicio, usando `TenantContext` y `runInTenantSchema()`.
3. `ScheduleEvent.workOrderId` es el vinculo canonico; `WorkOrder.scheduledEventId` actua como mirror/backlink transaccional.
4. La generacion de codigo de OT fue endurecida con retry ante colision de constraint unica por tenant.
5. La UI evita dependencia pesada de calendario y opera con vistas calendario/lista mas filtros.

---

## 5. Evidencia funcional

- Crear evento con OT ligera desde portal: validado en unit tests frontend y E2E.
- Rechazo de solapamientos activos por tecnico: validado en backend.
- Reagendamiento con motivo obligatorio: validado en backend y E2E.
- Transicion de evento y OT: validada en backend y E2E.
- Dashboard operativo basico y carga por tecnico: validado por servicios backend y render portal.
- Ownership `TECHNICIAN`: validado en servicio backend, controller HTTP y E2E.

---

## 6. Evidencia de calidad ejecutada

Para no saturar el equipo, la verificacion final se ejecuto **sin Turbo global**, por workspace afectado y en serie con prioridad reducida (`nice -n 10`).

### 6.1 Typecheck

- `pnpm --filter @iwana/shared typecheck` ✅
- `pnpm --filter @iwana/db typecheck` ✅
- `pnpm --filter @iwana/api typecheck` ✅
- `pnpm --filter @iwana/portal typecheck` ✅

### 6.2 Lint

- `pnpm --filter @iwana/shared lint` ✅
- `pnpm --filter @iwana/db lint` ✅
- `pnpm --filter @iwana/api lint` ✅
- `pnpm --filter @iwana/portal lint` ✅

### 6.3 Build

- `pnpm --filter @iwana/shared build` ✅
- `pnpm --filter @iwana/db build` ✅
- `pnpm --filter @iwana/api build` ✅
- `pnpm --filter @iwana/portal build` ✅

### 6.4 Tests focalizados

- `pnpm --filter @iwana/api test -- wfm` ✅  
  Resultado: **5 suites, 39 tests aprobados**.

- `pnpm --filter @iwana/portal test -- --runInBand src/components/scheduling/SchedulingClient.spec.tsx src/components/scheduling/ScheduleEventForm.spec.tsx` ✅  
  Resultado: **2 suites, 8 tests aprobados**.

- `pnpm test:e2e:portal -- portal-wfm-scheduling.spec.ts` ✅  
  Resultado: **4 tests aprobados**.

---

## 7. OpenAPI

La superficie WFM quedo incorporada al esquema OpenAPI runtime del API mediante decoradores Swagger en `apps/api/src/modules/wfm/wfm.controller.ts` y DTOs documentados en `apps/api/src/modules/wfm/dto/**`.

La documentacion queda expuesta, fuera de produccion, en `/api/v1/docs` segun `apps/api/src/main.ts`.

---

## 8. Riesgos y deuda tecnica residual

No se identifican deudas criticas abiertas dentro del alcance de la Fase 01.

Quedan como mejoras futuras no bloqueantes, fuera del criterio de salida de esta fase, posibles ampliaciones de cobertura para escenarios adicionales de contratistas en portal y exploraciones visuales mas amplias sobre breakpoints secundarios.

---

## 9. Decision de salida

**Veredicto:** Go.

La fase queda funcionalmente implementada y validada sobre los workspaces afectados, con build, lint, typecheck, tests focalizados y E2E principal en verde.

No se identifican bloqueos criticos de arquitectura, seguridad, tenancy o compilacion dentro del alcance aprobado.

---

## 10. Consolidacion final aplicada

1. Se agrego cobertura explicita de `CONTRACTOR` en pruebas backend HTTP y unitarias.
2. Se agrego `wfm.tenant-isolation.spec.ts` para validar resolucion request-level por schema tenant.
3. Se amplio `portal-wfm-scheduling.spec.ts` con evidencia responsive mobile y consulta por rango diario, semanal y mensual.
4. Se corrigio un defecto post-cierre en portal scheduling donde `wfmApi` consumia respuestas WFM como envelope `{ data }` aunque el backend devolvia payload crudo. El ajuste se aplico en `apps/portal/src/lib/api-client.ts` con `returnFullResponse: true` para la superficie WFM y se reforzo `SchedulingClient` con fallback a colecciones vacias para evitar una caida total de la UI ante respuestas invalidas.
5. Se agrego regresion en `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx` para cubrir el caso `events.list() -> undefined` y confirmar que la vista cae a estado vacio en lugar de lanzar `TypeError`.

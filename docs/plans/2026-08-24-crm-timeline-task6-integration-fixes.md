# CRM Timeline Task 6 Integration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer coherente la invalidación tenant-safe y la cota de paginación del timeline CRM entre Portal, API, OpenAPI y pruebas.

**Architecture:** La invalidación opera únicamente sobre claves `timeline-page` del expediente y versiona respuestas pendientes para impedir recacheos obsoletos. El API expone metadata acotada a 500 eventos (`total`, `totalPages`, `truncated`, `hasMore`) y el Portal usa esa metadata para limitar navegación.

**Tech Stack:** Next.js/React/TypeScript, NestJS, Zod, Swagger, Jest, Playwright.

---

### Task 1: Endurecer cache e invalidación de escrituras

**Files:**
- Modify: `apps/portal/src/components/crm/expedientes/expediente-detail-cache.ts`
- Test: `apps/portal/src/components/crm/expedientes/expediente-detail-cache.spec.ts`

- [x] Versionar la unión de claves de cache y requests pendientes al invalidar timeline.
- [x] Probar que una respuesta pendiente antigua no recachea después de invalidación específica.

### Task 2: Invalidar timeline desde Gestión

**Files:**
- Modify: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- Test: `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.spec.tsx`

- [x] Crear helper local para invalidar solo el timeline del tenant y expediente actuales.
- [x] Ejecutarlo tras guardar sección, transición y reactivación exitosas.
- [x] Verificar que cada mutación invalida sin limpiar catálogos.

### Task 3: Alinear cota de paginación API/Portal/OpenAPI

**Files:**
- Modify: `apps/api/src/modules/crm/expedientes/dto/expediente-timeline.dto.ts`
- Modify: `apps/api/src/modules/crm/expedientes/expediente.service.ts`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- Test: `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`
- Test: `apps/api/src/modules/crm/expedientes/tests/expedientes.swagger.spec.ts`
- Test: `apps/portal/src/lib/api-client.spec.ts`

- [x] Añadir metadata `truncated` y `hasMore` al contrato paginado.
- [x] Acotar total y páginas válidas al máximo físico de 500 eventos.
- [x] Impedir que el Portal solicite una página cuyo `page × limit` supere 500.
- [x] Actualizar DTOs Swagger y pruebas de contrato.

### Task 4: Cubrir las cinco variantes renderizables

**Files:**
- Test: `apps/portal/src/components/crm/expedientes/ExpedienteTimelinePanel.spec.tsx`

- [x] Renderizar y verificar eventos `contact`, `responsibility`, `attribution`, `pipeline` y `system`.

### Task 5: Verificación

- [x] Ejecutar tests Portal/API del timeline.
- [x] Ejecutar typechecks, lint y E2E CRM relevante.
- [x] Ejecutar `git diff --check` sobre archivos modificados.
- [x] No crear commit.

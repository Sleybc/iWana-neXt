# Retiro Estructural WfmOperatingSite — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Eliminar completamente `WfmOperatingSite` y su capa de mapping, reemplazando toda referencia a `operatingSiteId`/`siteId` legacy por `organizationSiteId` nativo en persistencia, servicios, DTOs y portal.

**Architecture:** Migración aditiva en tenant schema que backfilla `organization_site_id` desde la tabla puente, renombra columnas y luego elimina tablas legacy. Los servicios WFM quedan libres del `WfmOperatingSiteMappingService` y trabajan con `organizationSiteId` directamente.

**Tech Stack:** TypeORM migrations (tenant), NestJS, Zod DTOs, Next.js portal, Jest

---

## Contexto y restricciones

- **Columnas a renombrar en DB:**
  - `schedule_events.operating_site_id` → `organization_site_id`
  - `visit_requests.operating_site_id` → `organization_site_id`
  - `wfm_site_business_hours.site_id` → `organization_site_id`
  - `wfm_holiday_blackouts.site_id` → `organization_site_id`
  - `wfm_technician_business_overrides.site_id` → fuera de alcance de este plan por ADR-041; la tabla se retira en `docs/plans/2026-05-22-retiro-excepciones-tecnico-wfm.md`.
- **Tablas a eliminar:** `wfm_operating_site_organization_site_mappings`, `wfm_operating_sites`
- **Servicio a eliminar:** `WfmOperatingSiteMappingService`
- **Entidades a eliminar:** `WfmOperatingSite`, `WfmOperatingSiteOrganizationSiteMapping`
- `down()` debe ser implementado (reversibilidad estructural, aunque no recupera datos).
- Sin `synchronize: true`. Sin hardcodear schema tenant.

---

## Task 1: Migración tenant 039 + entidades DB

**Files:**

- Create: `packages/database/src/migrations/tenant/039_replace_wfm_operating_sites_with_organization_sites.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`
- Modify: `packages/database/src/entities/schedule-event.entity.ts`
- Modify: `packages/database/src/entities/visit-request.entity.ts`
- Modify: `packages/database/src/entities/wfm-site-business-hours.entity.ts`
- Excluded by ADR-041: `packages/database/src/entities/wfm-technician-business-override.entity.ts`
- Modify: `packages/database/src/entities/wfm-holiday-blackout.entity.ts`
- Delete: `packages/database/src/entities/wfm-operating-site.entity.ts`
- Delete: `packages/database/src/entities/wfm-operating-site-organization-site-mapping.entity.ts`
- Modify: `packages/database/src/entities/index.ts` (quitar exports de las entidades eliminadas)

### Migración 039 — lógica SQL

**up():**

1. Agregar columna `organization_site_id UUID NULL` a las 5 tablas.
2. Backfill desde la tabla puente:

   ```sql
   UPDATE schedule_events se
   SET organization_site_id = m.organization_site_id
   FROM wfm_operating_site_organization_site_mappings m
   WHERE m.wfm_operating_site_id = se.operating_site_id
     AND m.deleted_at IS NULL;

   UPDATE visit_requests vr
   SET organization_site_id = m.organization_site_id
   FROM wfm_operating_site_organization_site_mappings m
   WHERE m.wfm_operating_site_id = vr.operating_site_id
     AND m.deleted_at IS NULL;

   UPDATE wfm_site_business_hours sbh
   SET organization_site_id = m.organization_site_id
   FROM wfm_operating_site_organization_site_mappings m
   WHERE m.wfm_operating_site_id = sbh.site_id
     AND m.deleted_at IS NULL;

   UPDATE wfm_holiday_blackouts hb
   SET organization_site_id = m.organization_site_id
   FROM wfm_operating_site_organization_site_mappings m
   WHERE m.wfm_operating_site_id = hb.site_id
     AND m.deleted_at IS NULL;

   ```

3. En `wfm_site_business_hours`: ALTER TABLE DROP CONSTRAINT uq y idx sobre `site_id`, luego DROP COLUMN `site_id`.
4. En `wfm_holiday_blackouts`: DROP INDEX idx_wfm_holiday_blackouts_tenant_site_date (tiene site_id), luego DROP COLUMN `site_id`.
5. En `schedule_events`: DROP COLUMN `operating_site_id`.
6. En `visit_requests`: DROP COLUMN `operating_site_id`.
7. Recrear índices con el nuevo nombre de columna:

   - `idx_wfm_site_business_hours_tenant_site` → `idx_wfm_site_business_hours_tenant_org_site`
   - `uq_wfm_site_business_hours_site_weekday` → `uq_wfm_site_business_hours_org_site_weekday`
   - `idx_wfm_holiday_blackouts_tenant_site_date` → recrear como `idx_wfm_holiday_blackouts_tenant_org_site_date`
8. DROP TABLE `wfm_operating_site_organization_site_mappings` (y sus índices).
9. DROP TABLE `wfm_operating_sites` (y sus índices).

**down():**

1. Recrear tablas `wfm_operating_sites` y `wfm_operating_site_organization_site_mappings` con estructura vacía.
2. Agregar columna `operating_site_id UUID NULL` a `schedule_events` y `visit_requests`.
3. Agregar columna `site_id UUID NULL` a `wfm_site_business_hours` y `wfm_holiday_blackouts`.
4. Eliminar columna `organization_site_id` de las 5 tablas.
5. Recrear índices originales.
6. Nota: el backfill inverso no es posible sin datos en la tabla de mapping; los datos quedan en NULL.

### Entidades

**`schedule-event.entity.ts`:** Renombrar `operatingSiteId` → `organizationSiteId`, campo `operating_site_id` → `organization_site_id`.

**`visit-request.entity.ts`:** Idem.

**`wfm-site-business-hours.entity.ts`:** Renombrar `siteId` → `organizationSiteId`, campo `site_id` → `organization_site_id`. Actualizar índices en decoradores.

**`wfm-technician-business-override.entity.ts`:** Fuera de alcance desde ADR-041. No migrar; retirar en el plan de Excepciones por tecnico.

**`wfm-holiday-blackout.entity.ts`:** Idem.

**`entities/index.ts`:** Quitar exportaciones de `WfmOperatingSite` y `WfmOperatingSiteOrganizationSiteMapping`.

- [ ] Crear archivo de migración 039 con up() y down() completos
- [ ] Agregar migración al runner.ts (en la posición correcta, después de 038)
- [ ] Renombrar `operatingSiteId` en `schedule-event.entity.ts` y `visit-request.entity.ts`
- [ ] Renombrar `siteId` en entidades de business hours y blackouts
- [ ] Eliminar archivos `wfm-operating-site.entity.ts` y `wfm-operating-site-organization-site-mapping.entity.ts`
- [ ] Actualizar `entities/index.ts`
- [ ] Ejecutar `pnpm --filter @iwana/db typecheck` para verificar compilación

---

## Task 2: OperatingWindowResolverService

**Files:**

- Modify: `apps/api/src/modules/wfm/services/operating-window-resolver.service.ts`

La interfaz `ResolveOperatingWindowInput.siteId` debe renombrarse a `organizationSiteId`. Todas las queries internas que filtran por `siteId` deben usar `organizationSiteId` (el campo en la entidad ya cambió en Task 1).

**Cambios:**

- `ResolveOperatingWindowInput.siteId?: string | null` → `organizationSiteId?: string | null`
- `findHolidayBlackout`: idem
- `findSiteHours`: query `where: { tenantId, organizationSiteId: siteId, weekday }` → pasar el param renombrado
- `matchesSite(item.siteId, ...)` → `matchesSite(item.organizationSiteId, ...)`
- `sortBySiteSpecificity(left.siteId, right.siteId, ...)` → usar `organizationSiteId` solo si sigue siendo necesario para blackouts u horarios por sede

- [ ] Actualizar interfaz y todos los usos internos del campo
- [ ] Confirmar que el código compila sin `any`

---

## Task 3: Servicios WFM — remover mapping, usar organizationSiteId nativo

**Files:**

- Modify: `apps/api/src/modules/wfm/services/site-business-hours.service.ts`
- Modify: `apps/api/src/modules/wfm/services/holiday-blackouts.service.ts`
- Excluded by ADR-041: `apps/api/src/modules/wfm/services/technician-business-overrides.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-events.service.ts`
- Modify: `apps/api/src/modules/wfm/services/schedule-recommendations.service.ts`
- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.ts`
- Delete: `apps/api/src/modules/wfm/services/wfm-operating-site-mapping.service.ts`

### site-business-hours.service.ts

- Eliminar inyección de `WfmOperatingSiteMappingService`.
- Eliminar método `getWeekByOrganizationSiteId()`.
- Eliminar método `replaceWeekByOrganizationSiteId()`.
- `getWeek(siteId, actor)` → renombrar param a `organizationSiteId` (el campo en entidad cambió).
- `replaceWeek(siteId, dto, actor)` → idem.
- `assertSiteExists` debe usar `WfmSiteBusinessHours` o verificar vía `OrganizationSite` (el campo del where es `organizationSiteId`).
- Quitar import de `WfmOperatingSite`.

### holiday-blackouts.service.ts

- Eliminar inyección de `WfmOperatingSiteMappingService`.
- En `create()`: `siteId` ahora viene directo de `dto.organizationSiteId` (campo renombrado en DTO — ver Task 4).
- En `update()`: idem.
- `enrichBlackout/enrichBlackouts`: el campo ya se llama `organizationSiteId` en la entidad; no necesita derivación, leer directamente.

### technician-business-overrides.service.ts

Fuera de alcance desde ADR-041. La capacidad Excepciones por tecnico se retira de WFM y no debe recibir trabajo adicional de migracion a `organizationSiteId`.

### schedule-events.service.ts

- Eliminar import y uso de `WfmOperatingSiteMappingService`, `WfmSiteCompatibilityInput`.
- En `create()`: `const organizationSiteId = validated.organizationSiteId ?? null;` (sin resolver).
  - `ScheduleEvent` se crea con `organizationSiteId` en lugar de `operatingSiteId`.
  - `assertInstallationScheduleWindow` pasa `organizationSiteId`.
- En `update()`: eliminar `resolveEffectiveOperatingSiteId()`, usar `validated.organizationSiteId` o fallback del evento existente (`event.organizationSiteId`).
  - Update de campo: `if (validated.organizationSiteId !== undefined) updates.organizationSiteId = validated.organizationSiteId;`
- En `reschedule()`: `event.organizationSiteId` en lugar de `event.operatingSiteId`.
- Eliminar método privado `resolveEffectiveOperatingSiteId()` de este servicio.
- `assertInstallationScheduleWindow` interna: el param se llama `organizationSiteId` en lugar de `operatingSiteId`.

### schedule-recommendations.service.ts

- Eliminar `WfmOperatingSiteMappingService`.
- `const effectiveSiteId = validated.organizationSiteId ?? null;` en lugar de llamar al mapping.

### visit-requests.service.ts

- Eliminar `WfmOperatingSiteMappingService` y el import de `WfmSiteCompatibilityInput`.
- En todos los lugares donde se llama `this.operatingSiteMappingService.resolveEffectiveOperatingSiteId(validated, ...)`:
  - Reemplazar por `validated.organizationSiteId ?? null`.
- Renombrar campo persistido: `operatingSiteId: ...` → `organizationSiteId: ...` en `qr.manager.create(VisitRequest, {...})`.
- `enrichVisitRequest/enrichVisitRequests`: el campo ya se llama `organizationSiteId` en entidad — leer directo, no necesita resolver.
- Eliminar dependencia de `WfmOperatingSiteMappingService`.
- `assertInstallationScheduleWindow`: el param se llama `organizationSiteId`.

- [ ] Actualizar los 6 servicios
- [ ] Eliminar `wfm-operating-site-mapping.service.ts`
- [ ] Compilar para verificar sin errores

---

## Task 4: DTOs backend

**Files:**

- Modify: `apps/api/src/modules/wfm/dto/create-visit-request.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/update-visit-request-context.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/create-schedule-event.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/update-schedule-event.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/recommend-visit-request.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/schedule-visit-request.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/create-holiday-blackout.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/update-holiday-blackout.dto.ts`
- Excluded by ADR-041: `apps/api/src/modules/wfm/dto/create-technician-business-override.dto.ts`
- Excluded by ADR-041: `apps/api/src/modules/wfm/dto/update-technician-business-override.dto.ts`
- Modify: `apps/api/src/modules/wfm/dto/resolve-operating-window.dto.ts`
- Delete: `apps/api/src/modules/wfm/dto/create-operating-site.dto.ts` (si existe solo para WfmOperatingSite)
- Delete: `apps/api/src/modules/wfm/dto/update-operating-site.dto.ts` (idem)

### Regla general

- Donde había dos campos `operatingSiteId?: ...` y `organizationSiteId?: ...`, conservar SOLO `organizationSiteId`.
- Donde había solo `operatingSiteId?: ...`, renombrar a `organizationSiteId`.
- Para business hours: donde había `siteId?: ...`, renombrar a `organizationSiteId`. Los DTOs de overrides quedan fuera de alcance por ADR-041.
- Schema Zod: renombrar campos y eliminar el campo legacy.

### resolve-operating-window.dto.ts

- `siteId?: ...` → `organizationSiteId?: ...`

- [ ] Actualizar todos los DTOs
- [ ] Verificar que index.ts de dto reexporte correctamente

---

## Task 5: Controller + Module

**Files:**

- Modify: `apps/api/src/modules/wfm/wfm.controller.ts`
- Modify: `apps/api/src/modules/wfm/wfm.module.ts`

### wfm.controller.ts

- Eliminar inyección de `WfmOperatingSiteMappingService`.
- `listDispatchSites()`: ya no enriquecer con `operatingSiteId`. Retornar las sedes organizacionales directamente.
- Eliminar endpoints `getDispatchSiteBusinessHours()` y `replaceDispatchSiteBusinessHours()` (los endpoints legacy que iban a `/dispatch-sites/:id/business-hours`).
- Actualizar llamadas a `siteBusinessHoursService.getWeek()` / `replaceWeek()` para pasar `organizationSiteId` en lugar de un `siteId` legacy.
- Eliminar llamadas a `operatingSiteWindowService` (si lo hay) que resolvía ventana por operatingSiteId.
- Endpoint `GET /dispatch-sites/:organizationSiteId/operating-window` (si existe): cambiar a usar `organizationSiteId` directamente en el resolver.

### wfm.module.ts

- Eliminar `WfmOperatingSiteMappingService` de providers.
- Eliminar `WfmOperatingSiteMappingService` de imports.
- Eliminar `WfmOperatingSite` y `WfmOperatingSiteOrganizationSiteMapping` de `TypeOrmModule.forFeature([...])`.

- [ ] Limpiar controller y module
- [ ] Compilar TypeScript

---

## Task 6: Portal — client types + componentes

**Files:**

- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.tsx`

### api-client.ts

- `WfmVisitRequest`: eliminar `operatingSiteId`, renombrar `organizationSiteId?` a `organizationSiteId: string | null`.
- `WfmScheduleEventResponse`: eliminar `operatingSiteId`, dejar `organizationSiteId: string | null`.
- `CreateWfmVisitRequestDto`, `UpdateWfmVisitRequestContextDto`, `RecommendWfmVisitRequestDto`, `ScheduleWfmVisitRequestDto`: eliminar `operatingSiteId`, conservar solo `organizationSiteId`.
- `CreateWfmScheduleEventDto`, `UpdateWfmScheduleEventDto`: idem.
- Para blackouts y overrides: eliminar `siteId`, conservar `organizationSiteId`.
- Eliminar funciones `getBusinessHours(organizationSiteId)` / `updateBusinessHours(organizationSiteId)` que apuntaban a `/dispatch-sites/:id/business-hours` (ese endpoint desaparece).

### PendingVisitRequestsView.tsx

- Reemplazar el bloque condicional `organizationSiteId ? {...} : operatingSiteId ? {...} : {}` por simplemente `{ organizationSiteId: selectedVisitRequest.organizationSiteId }`.

- [ ] Actualizar api-client.ts
- [ ] Actualizar PendingVisitRequestsView.tsx

---

## Task 7: Tests

**Files:**

- Modify: `apps/api/src/modules/wfm/services/visit-requests.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-events.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/schedule-recommendations.service.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm.tenant-isolation.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm-operating-settings.controller.http.spec.ts`
- Modify: `apps/api/src/modules/wfm/tests/wfm-organization-sites.controller.http.spec.ts`
- Modify: `apps/portal/src/components/scheduling/PendingVisitRequestsView.spec.tsx`

### Regla general para tests

- Eliminar todos los mocks de `WfmOperatingSiteMappingService`.
- En `provide:` lists, eliminar `{ provide: WfmOperatingSiteMappingService, useValue: ... }`.
- En fixtures, renombrar `operatingSiteId` → `organizationSiteId` en todos los objetos de datos.
- En expectations de `wfmApi.visitRequests.recommend` / `schedule`: ya no hay campo condicional, siempre es `organizationSiteId`.
- `visit-requests.service.spec.ts`: eliminar mock de `listMappedOrganizationSiteIdsByOperatingSiteIds` y `listMappedOperatingSiteIdsByOrganizationSiteIds`; simplificar `enrichVisitRequest` helper.
- Eliminar test "retorna el duplicado activo cuando el indice unico detecta carrera" si aún usa el patrón de enrich (adaptarlo).

- [ ] Actualizar todos los specs backend
- [ ] Actualizar PendingVisitRequestsView.spec.tsx
- [ ] Ejecutar `pnpm --filter @iwana/api test -- wfm` en verde
- [ ] Ejecutar `pnpm --filter @iwana/portal test -- PendingVisitRequestsView` en verde

---

## Validación final

- [ ] `pnpm --filter @iwana/db typecheck`
- [ ] `pnpm --filter @iwana/api typecheck`
- [ ] `pnpm --filter @iwana/portal typecheck`
- [ ] `pnpm --filter @iwana/api test -- wfm` (todos en verde)
- [ ] `pnpm --filter @iwana/portal test -- scheduling` (todos en verde)

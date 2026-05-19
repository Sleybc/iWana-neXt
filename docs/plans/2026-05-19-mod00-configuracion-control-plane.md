# MOD00 Configuracion Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MOD00 Configuracion Control Plane Fase 01 with Organization/Sites and Access Profiles as tenant-aware foundations administered from portal settings.

**Architecture:** Configuracion acts as a federated control plane. Organization/Sites owns reusable tenant locations; Access Control adds configurable profiles on top of fixed `UserRole`; WFM consumes sites later through a typed port without losing its Work Order ownership.

**Tech Stack:** NestJS, TypeORM, PostgreSQL schema-per-tenant, Zod, Jest/Supertest, Next.js App Router, React, Tailwind v4, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Quality checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md`
- Existing WFM spec: `docs/superpowers/specs/2026-05-15-mod09-wfm-operating-hours-design.md`
- Existing Users PRD: `docs/prds/PRD-MOD04-USUARIOS-INTERNOS-v1.1.md`

## Scope

## Phase Boundaries

| Phase | Build now? | Boundary |
| --- | --- | --- |
| Fase 01 | Yes | Organization/Sites, Access Profiles, tenant tables, API, portal UI and targeted tests |
| Fase 02 | No | WFM adapter and gradual migration from `WfmOperatingSite` to `OrganizationSite` |
| Fase 03 | No | Federated settings surfaces for Commercial, Inventory, Billing and other modules |
| Fase 04 | No | Advanced permissions guard rollout, operational audit hardening and permission cache if needed |

Agents executing this plan must finish Fase 01 without implementing later phases unless a new approved prompt extends the scope.

### Build in Fase 01

- Tenant migration for Organization/Sites tables.
- Tenant migration for Access Profiles tables.
- Backend modules/controllers/services for organization and access-control.
- Seedable permission catalog.
- Portal settings sections for Organization and Access.
- API client contracts.
- Focused backend, frontend and E2E tests.

### Do not build in Fase 01

- Full WFM migration away from `WfmOperatingSite`.
- Inventory, Billing, HR or NMS modules.
- Dynamic backend roles replacing `UserRole`.
- LDAP/SAML/OIDC.

## File Structure

### Backend

- Create: `apps/api/src/modules/organization/organization.module.ts`
- Create: `apps/api/src/modules/organization/organization.controller.ts`
- Create: `apps/api/src/modules/organization/services/organization-sites.service.ts`
- Create: `apps/api/src/modules/organization/services/organization-site-hours.service.ts`
- Create: `apps/api/src/modules/organization/dto/*.dto.ts`
- Create: `apps/api/src/modules/organization/schemas/*.schema.ts`
- Create: `apps/api/src/modules/organization/ports/organization-site-read.port.ts`
- Create: `apps/api/src/modules/access-control/access-control.module.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.ts`
- Create: `apps/api/src/modules/access-control/services/permission-catalog.service.ts`
- Create: `apps/api/src/modules/access-control/services/access-profiles.service.ts`
- Create: `apps/api/src/modules/access-control/services/user-access-profiles.service.ts`
- Modify: `apps/api/src/app.module.ts`

### Database

- Create entities in `packages/database/src/entities/organization-site.entity.ts`
- Create entities in `packages/database/src/entities/organization-site-capability.entity.ts`
- Create entities in `packages/database/src/entities/organization-site-business-hour.entity.ts`
- Create entities in `packages/database/src/entities/organization-site-assignment.entity.ts`
- Create entities in `packages/database/src/entities/organization-site-responsibility.entity.ts`
- Create entities in `packages/database/src/entities/access-permission-catalog.entity.ts`
- Create entities in `packages/database/src/entities/access-profile.entity.ts`
- Create entities in `packages/database/src/entities/access-profile-permission.entity.ts`
- Create entities in `packages/database/src/entities/user-access-profile.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create migration: `packages/database/src/migrations/tenant/037_create_configuration_control_plane.ts`

### Shared

- Create: `packages/shared/src/enums/organization/*.ts`
- Create: `packages/shared/src/enums/access-control/*.ts`
- Modify exports in `packages/shared/src/enums/index.ts`

### Frontend

- Modify: `apps/portal/src/components/settings/settings-navigation.ts`
- Create: `apps/portal/src/app/dashboard/settings/organization/page.tsx`
- Create: `apps/portal/src/app/dashboard/settings/access/page.tsx`
- Create: `apps/portal/src/components/organization/*.tsx`
- Create: `apps/portal/src/components/access-control/*.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`

---

### Task 1: Shared enums and labels

**Files:**

- Create: `packages/shared/src/enums/organization/organization-site-type.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-capability.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-weekday.enum.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-key.enum.ts`
- Modify: `packages/shared/src/enums/index.ts`

- [ ] **Step 1: Add Organization enums**

Create these enums with stable string values:

```ts
export enum OrganizationSiteType {
  OFFICE = 'OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  TECH_BASE = 'TECH_BASE',
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
  COLLECTION_POINT = 'COLLECTION_POINT',
  NOC = 'NOC',
  MIXED = 'MIXED',
}

export enum OrganizationSiteCapability {
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
  TECH_DISPATCH = 'TECH_DISPATCH',
  WAREHOUSE = 'WAREHOUSE',
  COLLECTION_POINT = 'COLLECTION_POINT',
  ADMIN_OFFICE = 'ADMIN_OFFICE',
  NOC = 'NOC',
  SALES_OFFICE = 'SALES_OFFICE',
}

export enum OrganizationWeekday {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}
```

- [ ] **Step 2: Add permission key constants**

Use string constants or enum members for the seed permissions from the HLD. Do not include future permissions that have no UI surface in Fase 01 except as disabled/read-only catalog items.

- [ ] **Step 3: Export from shared**

Update barrel exports so both API and portal can import from `@iwana/shared`.

- [ ] **Step 4: Validate typecheck**

Run: `pnpm --filter @iwana/shared typecheck`

Expected: PASS.

---

### Task 2: Database entities and migration

**Files:**

- Create entity files listed in File Structure.
- Create: `packages/database/src/migrations/tenant/037_create_configuration_control_plane.ts`
- Modify: `packages/database/src/entities/index.ts`

- [ ] **Step 1: Write entities**

Follow existing tenant entities: no hardcoded schema in `@Entity()`, `tenantId` column, timestamps, `DeleteDateColumn` where soft-delete applies.

- [ ] **Step 2: Write reversible migration**

The migration must create:

- `organization_sites`
- `organization_site_capabilities`
- `organization_site_business_hours`
- `organization_site_assignments`
- `organization_site_responsibilities`
- `access_permission_catalog`
- `access_profiles`
- `access_profile_permissions`
- `user_access_profiles`

Add unique indexes for active records:

- `organization_sites(tenant_id, code) WHERE deleted_at IS NULL`
- `organization_site_capabilities(tenant_id, site_id, capability)`
- `organization_site_business_hours(tenant_id, site_id, weekday)`
- `access_profiles(tenant_id, name) WHERE deleted_at IS NULL`
- `access_profile_permissions(tenant_id, profile_id, permission_key)`
- `user_access_profiles(tenant_id, user_id, profile_id) WHERE is_active = true`

- [ ] **Step 3: Down migration**

Drop tables in reverse dependency order and drop custom enum types if created.

- [ ] **Step 4: Validate package typecheck**

Run: `pnpm --filter @iwana/db typecheck`

Expected: PASS.

---

### Task 3: Organization backend module

**Files:**

- Create: `apps/api/src/modules/organization/organization.module.ts`
- Create: `apps/api/src/modules/organization/organization.controller.ts`
- Create: `apps/api/src/modules/organization/services/organization-sites.service.ts`
- Create: `apps/api/src/modules/organization/services/organization-site-hours.service.ts`
- Create DTOs and Zod schemas.
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing HTTP tests**

Create tests that assert:

- `ADMIN` can create a site.
- `NOC` can list sites but cannot create.
- duplicate active code returns `409`.
- payload with invalid latitude returns `400`.
- tenant isolation filters by `tenantId`.

- [ ] **Step 2: Implement schemas**

Zod create schema must validate:

- `name`: trimmed 2..160 chars.
- `code`: uppercase-ish 2..40 chars.
- `siteType`: enum.
- `country`: 2 chars, default `CO`.
- `latitude`: optional number -90..90.
- `longitude`: optional number -180..180.

- [ ] **Step 3: Implement service**

Use `TenantContext.getOrThrow()` and `runInTenantSchema()` for all DB access. Never accept tenantId from request body.

- [ ] **Step 4: Implement controller**

Use `JwtAuthGuard`, `RolesGuard` and `@Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.HR)` for read. Use `@Roles(UserRole.ADMIN)` for mutations.

- [ ] **Step 5: Register module**

Add `OrganizationModule` to `AppModule` imports.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @iwana/api test -- organization`

Expected: PASS.

---

### Task 4: Access Control backend module

**Files:**

- Create: `apps/api/src/modules/access-control/access-control.module.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.ts`
- Create services listed in File Structure.
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing tests**

Assert:

- `ADMIN` can list permissions.
- `ADMIN` can create profile.
- non-ADMIN cannot create profile.
- profile with unknown permission returns `400`.
- assigning a profile with base role constraint incompatible with user role returns `400`.

- [ ] **Step 2: Implement permission seed service**

Seed catalog idempotently inside tenant schema. Include at least:

```ts
const DEFAULT_PERMISSIONS = [
  'settings.read',
  'settings.manage',
  'organization.sites.read',
  'organization.sites.manage',
  'organization.hours.manage',
  'organization.assignments.manage',
  'users.read',
  'users.manage',
  'access.profiles.read',
  'access.profiles.manage',
  'wfm.schedule.read',
  'wfm.schedule.manage',
  'wfm.work_orders.execute',
];
```

- [ ] **Step 3: Implement profile CRUD**

Profiles are tenant-local, soft-deletable, audited, and cannot duplicate active name.

- [ ] **Step 4: Implement user profile assignment**

Lookup user by `UsersModule` public service method or repository pattern already approved in the repo. Do not import private internals from Users.

- [ ] **Step 5: Register module**

Add `AccessControlModule` to `AppModule` imports.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @iwana/api test -- access-control`

Expected: PASS.

---

### Task 5: Organization portal UI

**Files:**

- Create: `apps/portal/src/app/dashboard/settings/organization/page.tsx`
- Create components under `apps/portal/src/components/organization/`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/settings/settings-navigation.ts`

- [ ] **Step 1: Add API client methods**

Add `organizationApi.sites.list/create/update/remove/updateCapabilities/updateBusinessHours` with typed responses.

- [ ] **Step 2: Create Organization page**

Use server page plus client component. UI must show:

- summary count of active sites;
- table of sites;
- create/edit dialog;
- capabilities selector;
- weekly business hours editor.

- [ ] **Step 3: Add navigation entry**

Add `Organizacion` to settings navigation. Keep existing settings tabs working.

- [ ] **Step 4: Add tests**

Add Jest tests for labels and form validation helpers.

- [ ] **Step 5: Run portal checks**

Run: `pnpm --filter @iwana/portal test -- organization`

Expected: PASS.

---

### Task 6: Access Control portal UI

**Files:**

- Create: `apps/portal/src/app/dashboard/settings/access/page.tsx`
- Create components under `apps/portal/src/components/access-control/`
- Modify: `apps/portal/src/lib/api-client.ts`

- [ ] **Step 1: Add API client methods**

Add `accessControlApi.permissions.list`, `profiles.list/create/update/remove/updatePermissions`, `users.updateProfiles`.

- [ ] **Step 2: Create Access page**

UI must show:

- roles base as read-only explanation through labels, not raw enum wall;
- profiles table;
- profile dialog;
- permission matrix grouped by module;
- user assignment panel.

- [ ] **Step 3: Enforce UI permission constraints**

Disable incompatible permissions based on selected base role constraint, but rely on backend for final enforcement.

- [ ] **Step 4: Add tests**

Add helper tests for grouping permission keys by module and rendering selected permissions.

- [ ] **Step 5: Run portal checks**

Run: `pnpm --filter @iwana/portal test -- access-control`

Expected: PASS.

---

### Task 7: E2E and documentation closure

**Files:**

- Create/modify: `e2e/tests/portal-settings-configuration-v2.spec.ts`
- Update: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Update: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md` if execution changes gates or evidence.

- [ ] **Step 1: Add Playwright tests**

Cover ADMIN flow:

1. Login as admin tenant.
2. Open `/dashboard/settings/organization`.
3. Create site `Sede centro` with capabilities `TECH_DISPATCH` and `WAREHOUSE`.
4. Configure Monday-Friday hours.
5. Open `/dashboard/settings/access`.
6. Create profile `Tecnico instalador fibra`.
7. Select WFM execute/read permissions.
8. Assign profile to a technician user.

- [ ] **Step 2: Add negative E2E or HTTP coverage**

Cover a non-admin role trying to mutate and receiving forbidden or read-only UI.

- [ ] **Step 3: Run validation commands**

Run:

```bash
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/api test -- organization access-control
pnpm --filter @iwana/portal test -- organization access-control
pnpm test:e2e:portal --grep "Configuracion"
```

Expected: all targeted checks pass, or unrelated failures are documented with evidence.

- [ ] **Step 4: Update report**

Append final implementation results to `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`. Do not create a duplicate report for corrective notes.

---

## Self-review checklist

- PRD requirements covered by tasks: yes, Organization and Access are represented.
- Boundary protection covered: yes, ports and no direct cross-module access.
- Placeholder scan: no TBD/TODO instructions remain.
- Deferred scope explicit: WFM migration, Inventory, Billing, HR and dynamic roles are out of Fase 01.

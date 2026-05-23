# MOD00 configuracion fase 01 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar MOD00 Configuracion Fase 01 con Organizacion/Sedes y perfiles de acceso tenant-aware dentro del portal y del API del tenant.

**Architecture:** La solucion crea dos boundaries internos claros: `OrganizationModule` para el dato maestro transversal de sedes y `AccessControlModule` para catalogo, perfiles y asignaciones de acceso. Las tablas viven en el schema tenant, `UserRole` sigue siendo la autoridad RBAC base y el catalogo `MOD00_ACCESS_V1` agrega permisos configurables sin leer tablas de otros modulos ni migrar todavia `WfmOperatingSite`.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL multi-tenant por schema, Zod, Jest, Supertest, Next.js App Router, React 19, Tailwind v4, Playwright, pnpm.

---

## Source artifacts

- `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-01-v1.0.md`
- `docs/specs/2026-05-21-mod00-configuracion-fase-01-design.md`
- `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-01-v1.0.md`

## File structure

### Shared contracts

- Create: `packages/shared/src/enums/organization/organization-site-type.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-capability.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-responsibility.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-assignment-type.enum.ts`
- Create: `packages/shared/src/enums/organization/index.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-availability.enum.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-key.enum.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-catalog-version.enum.ts`
- Create: `packages/shared/src/enums/access-control/index.ts`
- Modify: `packages/shared/src/index.ts`

### Database

- Create: `packages/database/src/entities/organization-site.entity.ts`
- Create: `packages/database/src/entities/organization-site-capability.entity.ts`
- Create: `packages/database/src/entities/organization-site-business-hour.entity.ts`
- Create: `packages/database/src/entities/organization-site-assignment.entity.ts`
- Create: `packages/database/src/entities/organization-site-responsibility.entity.ts`
- Create: `packages/database/src/entities/access-permission-catalog.entity.ts`
- Create: `packages/database/src/entities/access-profile.entity.ts`
- Create: `packages/database/src/entities/access-profile-permission.entity.ts`
- Create: `packages/database/src/entities/user-access-profile.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/037_create_configuration_control_plane.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

### API

- Create: `apps/api/src/modules/organization/organization.module.ts`
- Create: `apps/api/src/modules/organization/organization.controller.ts`
- Create: `apps/api/src/modules/organization/dto/create-organization-site.dto.ts`
- Create: `apps/api/src/modules/organization/dto/update-organization-site.dto.ts`
- Create: `apps/api/src/modules/organization/dto/organization-site-response.dto.ts`
- Create: `apps/api/src/modules/organization/schemas/organization-site.schema.ts`
- Create: `apps/api/src/modules/organization/services/organization-sites.service.ts`
- Create: `apps/api/src/modules/organization/services/organization-site-hours.service.ts`
- Create: `apps/api/src/modules/organization/ports/organization-site-read.port.ts`
- Create: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Create: `apps/api/src/modules/organization/organization.service.spec.ts`
- Create: `apps/api/src/modules/access-control/access-control.module.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.ts`
- Create: `apps/api/src/modules/access-control/dto/create-access-profile.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/update-access-profile.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/assign-user-access-profiles.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/access-profile-response.dto.ts`
- Create: `apps/api/src/modules/access-control/schemas/access-profile.schema.ts`
- Create: `apps/api/src/modules/access-control/services/permission-catalog.service.ts`
- Create: `apps/api/src/modules/access-control/services/access-profiles.service.ts`
- Create: `apps/api/src/modules/access-control/services/user-access-profiles.service.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.http.spec.ts`
- Create: `apps/api/src/modules/access-control/access-control.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

### Portal

- Modify: `apps/portal/src/app/dashboard/settings/page.tsx`
- Create: `apps/portal/src/app/dashboard/settings/organization/page.tsx`
- Create: `apps/portal/src/app/dashboard/settings/access/page.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/settings-navigation.ts`
- Create: `apps/portal/src/components/settings/SettingsSectionCards.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSettingsPage.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSitesTable.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSiteDialog.tsx`
- Create: `apps/portal/src/components/organization/OrganizationBusinessHoursEditor.tsx`
- Create: `apps/portal/src/components/access-control/AccessControlSettingsPage.tsx`
- Create: `apps/portal/src/components/access-control/AccessProfilesTable.tsx`
- Create: `apps/portal/src/components/access-control/AccessProfileDialog.tsx`
- Create: `apps/portal/src/components/access-control/UserAccessAssignmentDialog.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSettingsPage.spec.tsx`
- Create: `apps/portal/src/components/access-control/AccessControlSettingsPage.spec.tsx`

### E2E and docs

- Create: `e2e/tests/portal-settings-organization-access.spec.ts`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

---

### Task 1: Shared contracts and permission catalog

**Files:**
- Create: `packages/shared/src/enums/organization/organization-site-type.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-capability.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-responsibility.enum.ts`
- Create: `packages/shared/src/enums/organization/organization-site-assignment-type.enum.ts`
- Create: `packages/shared/src/enums/organization/index.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-availability.enum.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-key.enum.ts`
- Create: `packages/shared/src/enums/access-control/access-permission-catalog-version.enum.ts`
- Create: `packages/shared/src/enums/access-control/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing typecheck target**

Create the first imports in a scratch test usage by updating `packages/shared/src/index.ts` to export paths that do not exist yet:

```ts
export * from './enums/organization';
export * from './enums/access-control';
```

Run:

```bash
pnpm --filter @iwana/shared typecheck
```

Expected: FAIL because the new enum folders do not exist yet.

- [ ] **Step 2: Add organization enums**

Create the enum files with the exact stable values approved by ADR/HLD:

```ts
// packages/shared/src/enums/organization/organization-site-type.enum.ts
export enum OrganizationSiteType {
  OFFICE = 'OFFICE',
  WAREHOUSE = 'WAREHOUSE',
  TECH_BASE = 'TECH_BASE',
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
  COLLECTION_POINT = 'COLLECTION_POINT',
  NOC = 'NOC',
  MIXED = 'MIXED',
}

// packages/shared/src/enums/organization/organization-site-capability.enum.ts
export enum OrganizationSiteCapability {
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
  TECH_DISPATCH = 'TECH_DISPATCH',
  WAREHOUSE = 'WAREHOUSE',
  COLLECTION_POINT = 'COLLECTION_POINT',
  ADMIN_OFFICE = 'ADMIN_OFFICE',
  NOC = 'NOC',
  SALES_OFFICE = 'SALES_OFFICE',
}
```

Also create:

```ts
// packages/shared/src/enums/organization/organization-site-responsibility.enum.ts
export enum OrganizationSiteResponsibility {
  ADMINISTRATIVE = 'ADMINISTRATIVE',
  INVENTORY = 'INVENTORY',
  COLLECTION = 'COLLECTION',
  FIELD_OPERATIONS = 'FIELD_OPERATIONS',
  CUSTOMER_SERVICE = 'CUSTOMER_SERVICE',
}

// packages/shared/src/enums/organization/organization-site-assignment-type.enum.ts
export enum OrganizationSiteAssignmentType {
  HOME_SITE = 'HOME_SITE',
  WORKS_AT = 'WORKS_AT',
  INVENTORY_CUSTODIAN = 'INVENTORY_CUSTODIAN',
  CASHIER = 'CASHIER',
  SUPERVISOR = 'SUPERVISOR',
}
```

- [ ] **Step 3: Add access-control enums**

Create the catalog enums and keep the version explicit:

```ts
// packages/shared/src/enums/access-control/access-permission-availability.enum.ts
export enum AccessPermissionAvailability {
  ASSIGNABLE = 'ASSIGNABLE',
  RESERVED = 'RESERVED',
}

// packages/shared/src/enums/access-control/access-permission-catalog-version.enum.ts
export enum AccessPermissionCatalogVersion {
  MOD00_ACCESS_V1 = 'MOD00_ACCESS_V1',
}
```

Create `access-permission-key.enum.ts` with the phase-1 catalog keys used by backend and portal:

```ts
export enum AccessPermissionKey {
  SETTINGS_READ = 'settings.read',
  ORGANIZATION_SITES_READ = 'organization.sites.read',
  ORGANIZATION_SITES_MANAGE = 'organization.sites.manage',
  ORGANIZATION_HOURS_MANAGE = 'organization.hours.manage',
  ACCESS_PROFILES_READ = 'access.profiles.read',
  ACCESS_PROFILES_MANAGE = 'access.profiles.manage',
  ACCESS_ASSIGNMENTS_MANAGE = 'access.assignments.manage',
  USERS_READ = 'users.read',
  WFM_DISPATCH_SITES_READ = 'wfm.dispatch-sites.read',
  WFM_SCHEDULE_READ = 'wfm.schedule.read',
  WFM_SCHEDULE_MANAGE = 'wfm.schedule.manage',
  BILLING_REFUND_MANAGE = 'billing.refund.manage',
}
```

- [ ] **Step 4: Add barrel exports**

Create the folder barrels and export them from `packages/shared/src/index.ts`:

```ts
// packages/shared/src/enums/organization/index.ts
export * from './organization-site-type.enum';
export * from './organization-site-capability.enum';
export * from './organization-site-responsibility.enum';
export * from './organization-site-assignment-type.enum';

// packages/shared/src/enums/access-control/index.ts
export * from './access-permission-availability.enum';
export * from './access-permission-catalog-version.enum';
export * from './access-permission-key.enum';
```

- [ ] **Step 5: Run typecheck and commit**

Run:

```bash
pnpm --filter @iwana/shared typecheck
```

Expected: PASS.

Commit:

```bash
git add packages/shared/src/index.ts packages/shared/src/enums/organization packages/shared/src/enums/access-control
git commit -m "feat: add MOD00 shared access contracts"
```

---

### Task 2: Tenant entities, migration and runner wiring

**Files:**
- Create: `packages/database/src/entities/organization-site.entity.ts`
- Create: `packages/database/src/entities/organization-site-capability.entity.ts`
- Create: `packages/database/src/entities/organization-site-business-hour.entity.ts`
- Create: `packages/database/src/entities/organization-site-assignment.entity.ts`
- Create: `packages/database/src/entities/organization-site-responsibility.entity.ts`
- Create: `packages/database/src/entities/access-permission-catalog.entity.ts`
- Create: `packages/database/src/entities/access-profile.entity.ts`
- Create: `packages/database/src/entities/access-profile-permission.entity.ts`
- Create: `packages/database/src/entities/user-access-profile.entity.ts`
- Modify: `packages/database/src/entities/index.ts`
- Create: `packages/database/src/migrations/tenant/037_create_configuration_control_plane.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] **Step 1: Write a failing db typecheck**

Add the future exports first:

```ts
// packages/database/src/entities/index.ts
export { OrganizationSite } from './organization-site.entity';
export { OrganizationSiteCapability } from './organization-site-capability.entity';
export { OrganizationSiteBusinessHour } from './organization-site-business-hour.entity';
export { OrganizationSiteAssignment } from './organization-site-assignment.entity';
export { OrganizationSiteResponsibility } from './organization-site-responsibility.entity';
export { AccessPermissionCatalog } from './access-permission-catalog.entity';
export { AccessProfile } from './access-profile.entity';
export { AccessProfilePermission } from './access-profile-permission.entity';
export { UserAccessProfile } from './user-access-profile.entity';
```

Run:

```bash
pnpm --filter @iwana/db typecheck
```

Expected: FAIL because the entity files do not exist yet.

- [ ] **Step 2: Add the organization entities**

Follow the same pattern as `WfmOperatingSite`:

```ts
// packages/database/src/entities/organization-site.entity.ts
@Index('uq_organization_sites_tenant_code', ['tenantId', 'code'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'organization_sites' })
export class OrganizationSite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 160 })
  name: string;

  @Column({ type: 'varchar', length: 40 })
  code: string;

  @Column({ name: 'site_type', type: 'varchar', length: 40 })
  siteType: OrganizationSiteType;

  @Column({ type: 'boolean', name: 'is_primary', default: false })
  isPrimary: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
```

Create the child entities with `tenantId`, foreign keys by id and unique indexes for capability and weekday.

- [ ] **Step 3: Add the access-control entities**

Model the catalog and profiles with explicit availability and version:

```ts
// packages/database/src/entities/access-permission-catalog.entity.ts
@Index('uq_access_permission_catalog_key', ['permissionKey'], { unique: true })
@Entity({ name: 'access_permission_catalog' })
export class AccessPermissionCatalog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'permission_key', type: 'varchar', length: 120 })
  permissionKey: AccessPermissionKey;

  @Column({ name: 'module_key', type: 'varchar', length: 60 })
  moduleKey: string;

  @Column({ name: 'catalog_version', type: 'varchar', length: 40 })
  catalogVersion: AccessPermissionCatalogVersion;

  @Column({ name: 'availability', type: 'varchar', length: 20 })
  availability: AccessPermissionAvailability;

  @Column({ name: 'compatible_role', type: 'varchar', length: 32, nullable: true })
  compatibleRole: UserRole | null;

  @Column({ name: 'is_system', type: 'boolean', default: true })
  isSystem: boolean;
}
```

For `AccessProfile`, include:

```ts
@Column({ name: 'base_role_constraint', type: 'varchar', length: 32 })
baseRoleConstraint: UserRole;

@Column({ name: 'scope_site_id', type: 'uuid', nullable: true })
scopeSiteId: string | null;
```

- [ ] **Step 4: Write the reversible migration and register it in the runner**

Create `037_create_configuration_control_plane.ts` with the same style as migration `036`:

```ts
export class CreateConfigurationControlPlane1700000000037 implements MigrationInterface {
  name = 'CreateConfigurationControlPlane1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organization_sites (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(160) NOT NULL,
        code VARCHAR(40) NOT NULL,
        site_type VARCHAR(40) NOT NULL,
        is_primary BOOLEAN NOT NULL DEFAULT false,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_organization_sites PRIMARY KEY (id)
      )
    `);
  }
}
```

In the same migration add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_sites_tenant_code
  ON organization_sites (tenant_id, code)
  WHERE deleted_at IS NULL;
```

Seed `access_permission_catalog` inside the migration with `MOD00_ACCESS_V1`, including `ASSIGNABLE` and `RESERVED` rows.
Each seeded row must also set `compatible_role` with the role base allowed for that permission, or `NULL` when the permission is globally readable in Fase 01.

Then register the migration in `packages/database/src/migrations/tenant/runner.ts`:

```ts
import { CreateConfigurationControlPlane1700000000037 } from './037_create_configuration_control_plane';

const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
  // ...existing migrations...
  CreateWfmOperatingHoursModule1700000000036,
  CreateConfigurationControlPlane1700000000037,
];
```

- [ ] **Step 5: Run db typecheck and commit**

Run:

```bash
pnpm --filter @iwana/db typecheck
```

Expected: PASS.

Commit:

```bash
git add packages/database/src/entities packages/database/src/migrations/tenant
git commit -m "feat: add MOD00 tenant schema"
```

---

### Task 3: Organization backend module

**Files:**
- Create: `apps/api/src/modules/organization/organization.module.ts`
- Create: `apps/api/src/modules/organization/organization.controller.ts`
- Create: `apps/api/src/modules/organization/dto/create-organization-site.dto.ts`
- Create: `apps/api/src/modules/organization/dto/update-organization-site.dto.ts`
- Create: `apps/api/src/modules/organization/dto/organization-site-response.dto.ts`
- Create: `apps/api/src/modules/organization/schemas/organization-site.schema.ts`
- Create: `apps/api/src/modules/organization/services/organization-sites.service.ts`
- Create: `apps/api/src/modules/organization/services/organization-site-hours.service.ts`
- Create: `apps/api/src/modules/organization/ports/organization-site-read.port.ts`
- Create: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Create: `apps/api/src/modules/organization/organization.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing HTTP tests for the contract**

Create `organization.controller.http.spec.ts` with the same pattern as `users.controller.http.spec.ts`:

```ts
it('POST /api/v1/organization/sites retorna 201 para ADMIN', async () => {
  organizationServiceMock.createSite.mockResolvedValue({ id: 'site-1', code: 'NOC-01' });

  await request(app.getHttpServer())
    .post('/api/v1/organization/sites')
    .set('Authorization', 'Bearer admin-token')
    .send({ name: 'Sede centro', code: 'NOC-01', siteType: 'NOC', country: 'CO' })
    .expect(201);
});

it('POST /api/v1/organization/sites retorna 403 para NOC', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/organization/sites')
    .set('Authorization', 'Bearer noc-token')
    .send({ name: 'Sede centro', code: 'NOC-01', siteType: 'NOC', country: 'CO' })
    .expect(403);
});
```

Also add cases for invalid latitude (`400`) and duplicate code (`409`).

- [ ] **Step 2: Run the new HTTP test to verify it fails**

Run:

```bash
pnpm --filter @iwana/api test -- organization.controller.http.spec.ts
```

Expected: FAIL because the controller and service do not exist yet.

- [ ] **Step 3: Implement the schema, DTOs and service**

Create the Zod schema with the same validation rules used in the design:

```ts
export const createOrganizationSiteSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(40),
  siteType: z.nativeEnum(OrganizationSiteType),
  country: z.string().trim().length(2).default('CO'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
```

In the service, always use tenant context and the approved search-path helper:

```ts
const tenant = this.tenantContext.getOrThrow();

return runInTenantSchema(this.dataSource, tenant.schemaName, async (manager) => {
  const repository = manager.getRepository(OrganizationSite);
  const existing = await repository.findOne({
    where: { tenantId: tenant.tenantId, code: dto.code, deletedAt: IsNull() },
  });

  if (existing) {
    throw new ConflictException('Ya existe una sede activa con ese código.');
  }
});
```

- [ ] **Step 4: Implement the controller and register the module**

Use the same controller conventions as `UsersController`:

```ts
@ApiTags('organization')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organization')
export class OrganizationController {
  @Get('sites')
  @Roles(UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT, UserRole.ACCOUNTANT, UserRole.HR)
  async listSites(): Promise<{ data: OrganizationSiteResponseDto[] }> {
    return { data: await this.organizationSitesService.listSites() };
  }

  @Post('sites')
  @Roles(UserRole.ADMIN)
  async createSite(
    @Body() dto: CreateOrganizationSiteDto,
  ): Promise<{ data: OrganizationSiteResponseDto }> {
    return { data: await this.organizationSitesService.createSite(dto) };
  }
}
```

Register `OrganizationModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 5: Run organization tests and commit**

Run:

```bash
pnpm --filter @iwana/api test -- organization
pnpm --filter @iwana/api typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/modules/organization apps/api/src/app.module.ts
git commit -m "feat: add MOD00 organization API"
```

---

### Task 4: Access-control backend and WFM port preparation

**Files:**
- Create: `apps/api/src/modules/access-control/access-control.module.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.ts`
- Create: `apps/api/src/modules/access-control/dto/create-access-profile.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/update-access-profile.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/assign-user-access-profiles.dto.ts`
- Create: `apps/api/src/modules/access-control/dto/access-profile-response.dto.ts`
- Create: `apps/api/src/modules/access-control/schemas/access-profile.schema.ts`
- Create: `apps/api/src/modules/access-control/services/permission-catalog.service.ts`
- Create: `apps/api/src/modules/access-control/services/access-profiles.service.ts`
- Create: `apps/api/src/modules/access-control/services/user-access-profiles.service.ts`
- Create: `apps/api/src/modules/access-control/access-control.controller.http.spec.ts`
- Create: `apps/api/src/modules/access-control/access-control.service.spec.ts`
- Create: `apps/api/src/modules/organization/ports/organization-site-read.port.ts`
- Modify: `apps/api/src/modules/organization/organization.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing HTTP and service tests**

Add the contract tests first:

```ts
it('POST /api/v1/access-control/profiles retorna 201 para ADMIN con permisos asignables', async () => {
  accessProfilesServiceMock.createProfile.mockResolvedValue({ id: 'profile-1', name: 'Tecnico fibra' });

  await request(app.getHttpServer())
    .post('/api/v1/access-control/profiles')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: 'Tecnico fibra',
      baseRoleConstraint: 'TECHNICIAN',
      permissionKeys: ['wfm.schedule.read'],
    })
    .expect(201);
});

it('POST /api/v1/access-control/profiles retorna 400 con permiso reservado', async () => {
  accessProfilesServiceMock.createProfile.mockRejectedValue(
    new BadRequestException('El permiso no es asignable en Fase 01.'),
  );

  await request(app.getHttpServer())
    .post('/api/v1/access-control/profiles')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: 'Tecnico fibra',
      baseRoleConstraint: 'TECHNICIAN',
      permissionKeys: ['billing.refund.manage'],
    })
    .expect(400);
});
```

Add a service-level case for assigning a `TECHNICIAN` profile to an `ADMIN` user and expect a validation error.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @iwana/api test -- access-control
```

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement catalog, profile and assignment services**

Create the schema for profile persistence:

```ts
export const createAccessProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  baseRoleConstraint: z.nativeEnum(UserRole),
  scopeSiteId: z.string().uuid().nullable().optional(),
  permissionKeys: z.array(z.nativeEnum(AccessPermissionKey)).min(1),
});
```

Implement the catalog guardrails:

```ts
if (catalogEntry.availability !== AccessPermissionAvailability.ASSIGNABLE) {
  throw new BadRequestException('El permiso no es asignable en Fase 01.');
}

if (catalogEntry.compatibleRole !== dto.baseRoleConstraint) {
  throw new BadRequestException('El permiso no es compatible con el rol base del perfil.');
}
```

When assigning to users, use `UsersService` instead of reading user tables directly:

```ts
const user = await this.usersService.findOne(userId);
if (user.role !== profile.baseRoleConstraint) {
  throw new BadRequestException('El rol base del usuario no coincide con el perfil.');
}
```

- [ ] **Step 4: Implement the controller, module wiring and read port**

Create the controller:

```ts
@ApiTags('access-control')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('access-control')
export class AccessControlController {
  @Get('permissions')
  @Roles(UserRole.ADMIN)
  async listPermissions() {
    return { data: await this.permissionCatalogService.listCatalog() };
  }

  @Put('users/:userId/profiles')
  @Roles(UserRole.ADMIN)
  async assignProfiles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignUserAccessProfilesDto,
  ) {
    return { data: await this.userAccessProfilesService.assignProfiles(userId, dto) };
  }
}
```

Create the port for later WFM use:

```ts
export abstract class OrganizationSiteReadPort {
  abstract listDispatchSites(tenantId: string): Promise<
    Array<{ id: string; code: string; name: string }>
  >;
}
```

Export the port from `OrganizationModule`, but do not implement WFM consumption yet.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm --filter @iwana/api test -- access-control
pnpm --filter @iwana/api typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/api/src/modules/access-control apps/api/src/modules/organization/ports apps/api/src/app.module.ts
git commit -m "feat: add MOD00 access control API"
```

---

### Task 5: Settings center and portal API client

**Files:**
- Modify: `apps/portal/src/app/dashboard/settings/page.tsx`
- Create: `apps/portal/src/app/dashboard/settings/organization/page.tsx`
- Create: `apps/portal/src/app/dashboard/settings/access/page.tsx`
- Modify: `apps/portal/src/components/settings/SettingsClient.tsx`
- Modify: `apps/portal/src/components/settings/settings-navigation.ts`
- Create: `apps/portal/src/components/settings/SettingsSectionCards.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/settings/SettingsClient.spec.tsx`

- [ ] **Step 1: Write the failing portal tests**

Extend `SettingsClient.spec.tsx` first:

```tsx
it('should render organization and access entry points in settings center', async () => {
  render(<SettingsClient />);

  expect(await screen.findByRole('link', { name: /Organización/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Usuarios y acceso/i })).toBeInTheDocument();
});
```

Add a second test asserting that route-future sections remain visible but disabled:

```tsx
expect(screen.getByText('Inventario')).toBeInTheDocument();
expect(screen.getByText('Ruta futura')).toBeInTheDocument();
```

- [ ] **Step 2: Run the portal test to verify it fails**

Run:

```bash
pnpm --filter @iwana/portal test -- SettingsClient.spec.tsx
```

Expected: FAIL because the settings center still renders the legacy tab view only.

- [ ] **Step 3: Add API client contracts for organization and access control**

Extend `apps/portal/src/lib/api-client.ts` with DTO types and client objects:

```ts
export interface OrganizationSiteDto {
  id: string;
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  isActive: boolean;
}

export const organizationApi = {
  async listSites(): Promise<OrganizationSiteDto[]> {
    const response = await request<ApiEnvelope<OrganizationSiteDto[]>>('/organization/sites');
    return response.data;
  },
};

export const accessControlApi = {
  async listProfiles(): Promise<AccessProfileDto[]> {
    const response = await request<ApiEnvelope<AccessProfileDto[]>>('/access-control/profiles');
    return response.data;
  },
};
```

- [ ] **Step 4: Convert settings into a center page and add subroutes**

Keep `SettingsPage` as the hub and create route pages for the two new sections:

```tsx
// apps/portal/src/app/dashboard/settings/page.tsx
import { SettingsClient } from '@/components/settings/SettingsClient';

export default function SettingsPage() {
  return <SettingsClient />;
}

// apps/portal/src/app/dashboard/settings/organization/page.tsx
import { OrganizationSettingsPage } from '@/components/organization/OrganizationSettingsPage';

export default function SettingsOrganizationPage() {
  return <OrganizationSettingsPage />;
}
```

Update `SettingsClient` so the first screen shows section cards instead of the old tab panels by default.

- [ ] **Step 5: Run portal tests and commit**

Run:

```bash
pnpm --filter @iwana/portal test -- SettingsClient.spec.tsx
pnpm --filter @iwana/portal typecheck
```

Expected: PASS.

Commit:

```bash
git add apps/portal/src/app/dashboard/settings apps/portal/src/components/settings apps/portal/src/lib/api-client.ts
git commit -m "feat: reorganize portal settings center"
```

---

### Task 6: Organization and access-control portal screens

**Files:**
- Create: `apps/portal/src/components/organization/OrganizationSettingsPage.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSitesTable.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSiteDialog.tsx`
- Create: `apps/portal/src/components/organization/OrganizationBusinessHoursEditor.tsx`
- Create: `apps/portal/src/components/access-control/AccessControlSettingsPage.tsx`
- Create: `apps/portal/src/components/access-control/AccessProfilesTable.tsx`
- Create: `apps/portal/src/components/access-control/AccessProfileDialog.tsx`
- Create: `apps/portal/src/components/access-control/UserAccessAssignmentDialog.tsx`
- Create: `apps/portal/src/components/organization/OrganizationSettingsPage.spec.tsx`
- Create: `apps/portal/src/components/access-control/AccessControlSettingsPage.spec.tsx`

- [ ] **Step 1: Write failing component tests**

Create `OrganizationSettingsPage.spec.tsx`:

```tsx
it('should render sites table and create button for admin', async () => {
  render(<OrganizationSettingsPage />);

  expect(await screen.findByRole('heading', { name: /Organización/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Crear sede/i })).toBeInTheDocument();
});
```

Create `AccessControlSettingsPage.spec.tsx`:

```tsx
it('should render profile matrix and disabled reserved permissions', async () => {
  render(<AccessControlSettingsPage />);

  expect(await screen.findByText('Perfiles configurables')).toBeInTheDocument();
  expect(screen.getByLabelText('billing.refund.manage')).toBeDisabled();
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:

```bash
pnpm --filter @iwana/portal test -- OrganizationSettingsPage.spec.tsx AccessControlSettingsPage.spec.tsx
```

Expected: FAIL because the components do not exist yet.

- [ ] **Step 3: Implement the organization screen**

Base the page on the same portal patterns used by `UsersClient` and `WfmOperatingHoursManager`:

```tsx
export function OrganizationSettingsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === UserRole.ADMIN;
  const [sites, setSites] = useState<OrganizationSiteDto[]>([]);

  useEffect(() => {
    void organizationApi.listSites().then(setSites);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organización"
        subtitle="Administra sedes, capacidades y horarios institucionales."
      />
      <OrganizationSitesTable sites={sites} canEdit={canEdit} />
    </div>
  );
}
```

In the table markup, keep cells with `align-middle`.

- [ ] **Step 4: Implement the access-control screen**

Use a Zod-backed dialog form for profile creation:

```tsx
const profileSchema = z.object({
  name: z.string().trim().min(2, 'El nombre es obligatorio.'),
  baseRoleConstraint: z.nativeEnum(UserRole),
  permissionKeys: z.array(z.nativeEnum(AccessPermissionKey)).min(1, 'Selecciona al menos un permiso.'),
});
```

Render reserved permissions as visible but disabled:

```tsx
<input
  type="checkbox"
  aria-label={permission.permissionKey}
  checked={selectedKeys.includes(permission.permissionKey)}
  disabled={permission.availability === AccessPermissionAvailability.RESERVED || !canEdit}
/>
```

- [ ] **Step 5: Run portal tests and commit**

Run:

```bash
pnpm --filter @iwana/portal test -- OrganizationSettingsPage.spec.tsx AccessControlSettingsPage.spec.tsx
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
```

Expected: PASS.

Commit:

```bash
git add apps/portal/src/components/organization apps/portal/src/components/access-control
git commit -m "feat: add MOD00 organization and access screens"
```

---

### Task 7: E2E, report update and final repo validation

**Files:**
- Create: `e2e/tests/portal-settings-organization-access.spec.ts`
- Modify: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`

- [ ] **Step 1: Write the failing Playwright flow**

Create the ADMIN happy-path flow:

```ts
test('ADMIN creates a site and assigns a compatible access profile', async ({ page }) => {
  await page.goto('/dashboard/settings');
  await page.getByRole('link', { name: 'Organización' }).click();
  await page.getByRole('button', { name: 'Crear sede' }).click();
  await page.getByLabel('Nombre').fill('Sede centro');
  await page.getByLabel('Código').fill('CENTRO');
  await page.getByRole('button', { name: 'Guardar sede' }).click();
  await expect(page.getByText('Sede creada correctamente.')).toBeVisible();
});
```

Add a second negative flow for a non-admin user that verifies mutation controls are absent or rejected.

- [ ] **Step 2: Run the E2E to verify it fails**

Run:

```bash
pnpm test:e2e:portal -- --grep "organization access"
```

Expected: FAIL until the new settings routes and forms are implemented.

- [ ] **Step 3: Update the report with evidence**

Append a new execution block to `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` with:

```md
## 6.1 Ejecucion Fase 01 — Organizacion y acceso

- Backend: `OrganizationModule` y `AccessControlModule` implementados.
- Database: migracion tenant `037_create_configuration_control_plane` aplicada.
- Frontend: rutas `/dashboard/settings/organization` y `/dashboard/settings/access`.
- Evidencia: tests unitarios, HTTP, portal y Playwright ejecutados.
```

Then list the commands that passed and any documented non-related failures.

- [ ] **Step 4: Run focused validation commands**

Run:

```bash
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/api test -- organization access-control
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal test -- SettingsClient.spec.tsx OrganizationSettingsPage.spec.tsx AccessControlSettingsPage.spec.tsx
pnpm --filter @iwana/portal typecheck
pnpm --filter @iwana/portal lint
pnpm test:e2e:portal -- --grep "organization access"
```

Expected: PASS, or a documented non-related failure recorded in the report.

- [ ] **Step 5: Commit the remaining changes**

Commit:

```bash
git add e2e/tests/portal-settings-organization-access.spec.ts docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
git commit -m "feat: finish MOD00 phase 01 organization and access"
```

---

## Self-review

### Spec coverage

- `Organizacion/Sedes` -> Tasks 2, 3 y 6.
- `Catalogo MOD00_ACCESS_V1` -> Tasks 1, 2 y 4.
- `Perfiles con baseRoleConstraint` -> Tasks 2, 4 y 6.
- `Portal settings reorganizado` -> Tasks 5 y 6.
- `Puerto preparado para WFM` -> Task 4.
- `Auditoria e informe vivo` -> Tasks 3, 4 y 7.

No quedan requerimientos del spec sin una tarea asignada.

### Placeholder scan

- No hay `TODO`, `TBD` ni referencias del tipo “similar a otra tarea”.
- Cada tarea tiene archivos, comandos y snippets concretos.

### Type consistency

- El plan usa consistentemente `OrganizationSite`, `AccessProfile`, `AccessPermissionCatalog`, `baseRoleConstraint`, `AccessPermissionAvailability` y `MOD00_ACCESS_V1`.
- El puerto futuro de WFM queda nombrado como `OrganizationSiteReadPort` en todo el plan.

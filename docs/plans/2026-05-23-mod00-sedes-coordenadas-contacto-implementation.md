# MOD00 sedes, coordenadas y contacto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** endurecer `OrganizationSite` para capturar coordenadas y contacto operativo local como dato maestro de MOD00, sin introducir `NODE` como `siteType` ni mezclar el boundary futuro con NMS.

**Architecture:** el cambio se mantiene dentro de MOD00 y solo amplía el maestro de sedes. La persistencia agrega columnas de contacto en `organization_sites`, la API exige y devuelve esos campos, y el portal los hace obligatorios en crear/editar sede. El boundary aprobado en ADR-044 se conserva: no se implementa `NmsNode` en este corte y no se toca `CommercialNode` legacy.

**Tech Stack:** NestJS, TypeORM, PostgreSQL multi-tenant por schema, Next.js App Router, React Hook Form, Zod, Jest

---

## File Structure

- Modify: `packages/database/src/entities/organization-site.entity.ts`
  Purpose: agregar `contactName` y `contactPhone` al maestro de sedes.
- Create: `packages/database/src/migrations/tenant/043_add_organization_site_contact_fields.ts`
  Purpose: migracion tenant reversible para columnas nuevas en `organization_sites`.
- Modify: `packages/database/src/migrations/tenant/runner.ts`
  Purpose: registrar la migracion `043` en el runner tenant.
- Modify: `apps/api/src/modules/organization/dto/organization-site.dto.ts`
  Purpose: endurecer el contrato create/update con coordenadas y contacto.
- Modify: `apps/api/src/modules/organization/organization.service.ts`
  Purpose: persistir, devolver y auditar contacto + coordenadas.
- Modify: `apps/api/src/modules/organization/organization.service.spec.ts`
  Purpose: validar persistencia y auditoria del nuevo slice.
- Modify: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
  Purpose: validar el contrato HTTP con payloads completos e invalidos.
- Modify: `apps/portal/src/lib/api-client.ts`
  Purpose: extender tipos del cliente para `OrganizationSite`.
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`
  Purpose: hacer obligatorios latitud, longitud, nombre de contacto y telefono de contacto en el modal de sedes.
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
  Purpose: cubrir el submit del modal con los campos nuevos.

### Task 1: Endurecer contrato backend de OrganizationSite

**Files:**

- Modify: `apps/api/src/modules/organization/organization.service.spec.ts`
- Modify: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Modify: `apps/api/src/modules/organization/dto/organization-site.dto.ts`
- Modify: `apps/api/src/modules/organization/organization.service.ts`

- [ ] **Step 1: Write the failing backend tests**

En `apps/api/src/modules/organization/organization.service.spec.ts`, agregar un caso que verifique persistencia de contacto y coordenadas en create/update:

```ts
it('should persist coordinates and site contact during create', async () => {
  const manager = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((_entity, value) => value),
    save: jest.fn().mockImplementation(async (_entity, value) => ({
      id: 'site-1',
      ...(Array.isArray(value) ? value[0] : value),
    })),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  mockTenantRun(manager);

  jest.spyOn(service as never, 'loadSiteDetail').mockResolvedValue(
    createSiteDetail({
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'Mesa tecnica centro',
      contactPhone: '+573001112233',
    }) as never,
  );

  const result = await service.create({
    name: 'Sede norte',
    code: 'NORTE',
    siteType: OrganizationSiteType.OFFICE,
    latitude: 4.6486259,
    longitude: -74.0651466,
    contactName: 'Mesa tecnica centro',
    contactPhone: '+573001112233',
  });

  expect(manager.save).toHaveBeenCalledWith(
    OrganizationSite,
    expect.objectContaining({
      latitude: '4.6486259',
      longitude: '-74.0651466',
      contactName: 'Mesa tecnica centro',
      contactPhone: '+573001112233',
    }),
  );
  expect(result.contactName).toBe('Mesa tecnica centro');
  expect(result.contactPhone).toBe('+573001112233');
});
```

En `apps/api/src/modules/organization/organization.controller.http.spec.ts`, endurecer el POST valido y agregar un caso invalido por falta de contacto:

```ts
it('POST /api/v1/organization/sites crea sede con coordenadas y contacto', async () => {
  organizationServiceMock.create.mockResolvedValue({ id: 'site-1' });

  await request(app.getHttpServer())
    .post('/api/v1/organization/sites')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'Mesa tecnica centro',
      contactPhone: '+573001112233',
    })
    .expect(201);
});

it('POST /api/v1/organization/sites retorna 400 cuando falta contactPhone', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/organization/sites')
    .set('Authorization', 'Bearer admin-token')
    .send({
      name: 'Sede norte',
      code: 'NORTE',
      siteType: OrganizationSiteType.OFFICE,
      latitude: 4.6486259,
      longitude: -74.0651466,
      contactName: 'Mesa tecnica centro',
    })
    .expect(400);
});
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run:

```bash
cd apps/api && npx jest src/modules/organization/organization.service.spec.ts src/modules/organization/organization.controller.http.spec.ts --runInBand
```

Expected: FAIL porque `contactName` y `contactPhone` todavia no existen en DTOs, snapshots ni mapeos del servicio.

- [ ] **Step 3: Write the minimal backend implementation**

En `apps/api/src/modules/organization/dto/organization-site.dto.ts`, endurecer el create y ampliar el update:

```ts
  @ApiProperty({ example: 4.6486259 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: -74.0651466 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: 'Mesa tecnica centro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  contactName: string;

  @ApiProperty({ example: '+573001112233' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^\+?[0-9()\-\s]{7,32}$/u, {
    message: 'El telefono de contacto debe tener un formato valido.',
  })
  contactPhone: string;
```

En `apps/api/src/modules/organization/organization.service.ts`, ampliar snapshots, mapeo y persistencia:

```ts
export interface OrganizationSiteDetail extends OrganizationSiteSummary {
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  isPrimary: boolean;
  // ...
}
```

```ts
      const site = qr.manager.create(OrganizationSite, {
        tenantId: ctx.tenantId,
        name: dto.name.trim(),
        code: dto.code.trim().toUpperCase(),
        siteType: dto.siteType,
        address: dto.address?.trim() ?? null,
        municipality: dto.municipality?.trim() ?? null,
        department: dto.department?.trim() ?? null,
        country: dto.country?.trim().toUpperCase() ?? 'CO',
        latitude: this.toNumericColumn(dto.latitude),
        longitude: this.toNumericColumn(dto.longitude),
        contactName: dto.contactName.trim(),
        contactPhone: dto.contactPhone.trim(),
        isPrimary: dto.isPrimary ?? false,
        isActive: dto.isActive ?? true,
      });
```

```ts
      if (dto.contactName !== undefined) existing.contactName = dto.contactName?.trim() ?? null;
      if (dto.contactPhone !== undefined) existing.contactPhone = dto.contactPhone?.trim() ?? null;
```

Y reflejar ambos campos en `loadSiteDetail()` y `sanitizeSiteForAudit()` para no perder trazabilidad en auditoria.

- [ ] **Step 4: Run backend tests and typecheck**

Run:

```bash
cd apps/api && npx jest src/modules/organization/organization.service.spec.ts src/modules/organization/organization.controller.http.spec.ts --runInBand
pnpm --filter @iwana/api typecheck
```

Expected: PASS en Jest y typecheck verde en `@iwana/api`.

- [ ] **Step 5: Commit backend contract changes**

```bash
git add apps/api/src/modules/organization/dto/organization-site.dto.ts apps/api/src/modules/organization/organization.service.ts apps/api/src/modules/organization/organization.service.spec.ts apps/api/src/modules/organization/organization.controller.http.spec.ts
git commit -m "feat: add organization site contact contract"
```

### Task 2: Persistir contacto del sitio en schema tenant

**Files:**

- Modify: `packages/database/src/entities/organization-site.entity.ts`
- Create: `packages/database/src/migrations/tenant/043_add_organization_site_contact_fields.ts`
- Modify: `packages/database/src/migrations/tenant/runner.ts`

- [ ] **Step 1: Add the migration file and entity changes**

En `packages/database/src/entities/organization-site.entity.ts`, agregar columnas nuevas:

```ts
  @Column({ name: 'contact_name', type: 'varchar', length: 160, nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 32, nullable: true })
  contactPhone: string | null;
```

Crear `packages/database/src/migrations/tenant/043_add_organization_site_contact_fields.ts` con una migracion reversible:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationSiteContactFields1748698800043 implements MigrationInterface {
  name = 'AddOrganizationSiteContactFields1748698800043';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_sites
      ADD COLUMN IF NOT EXISTS contact_name varchar(160),
      ADD COLUMN IF NOT EXISTS contact_phone varchar(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE organization_sites
      DROP COLUMN IF EXISTS contact_phone,
      DROP COLUMN IF EXISTS contact_name
    `);
  }
}
```

En `packages/database/src/migrations/tenant/runner.ts`, registrar la migracion:

```ts
import { AddOrganizationSiteContactFields1748698800043 } from './043_add_organization_site_contact_fields';

const TENANT_MIGRATIONS: (new () => MigrationInterface)[] = [
  // ...
  CreateWfmOperationalEventualities1748653200042,
  AddOrganizationSiteContactFields1748698800043,
];
```

- [ ] **Step 2: Run database typecheck**

Run:

```bash
pnpm --filter @iwana/db typecheck
```

Expected: PASS. No debe haber errores de entidad ni del runner tenant.

- [ ] **Step 3: Verify API + DB compile together**

Run:

```bash
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/api typecheck
```

Expected: PASS en ambos paquetes, confirmando que la entidad y el servicio quedaron sincronizados.

- [ ] **Step 4: Review migration boundaries**

Confirmar manualmente estos puntos antes de seguir:

```text
- La migracion vive en packages/database/src/migrations/tenant/
- Usa ALTER TABLE sobre organization_sites del schema tenant
- Es reversible en down()
- El runner.ts importa y registra 043
```

- [ ] **Step 5: Commit database changes**

```bash
git add packages/database/src/entities/organization-site.entity.ts packages/database/src/migrations/tenant/043_add_organization_site_contact_fields.ts packages/database/src/migrations/tenant/runner.ts
git commit -m "feat: persist organization site contact fields"
```

### Task 3: Actualizar cliente tipado y formulario del portal

**Files:**

- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`
- Modify: `apps/portal/src/lib/api-client.ts`
- Modify: `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`

- [ ] **Step 1: Write the failing portal test**

En `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`, endurecer el payload de create y el detalle mockeado:

```ts
const organizationDetail = {
  ...organizationSummary[0],
  siteType: OrganizationSiteType.OFFICE,
  address: 'Cra 10 # 10-10',
  municipality: 'Bogotá',
  department: 'Cundinamarca',
  country: 'CO',
  latitude: 4.6486259,
  longitude: -74.0651466,
  contactName: 'Mesa tecnica centro',
  contactPhone: '+573001112233',
  isPrimary: true,
  // ...
};
```

Y en el caso de create, exigir los cuatro campos:

```ts
fireEvent.change(dialog.getByLabelText('Latitud'), { target: { value: '4.6486259' } });
fireEvent.change(dialog.getByLabelText('Longitud'), { target: { value: '-74.0651466' } });
fireEvent.change(dialog.getByLabelText('Nombre de contacto'), {
  target: { value: 'Mesa tecnica centro' },
});
fireEvent.change(dialog.getByLabelText('Teléfono de contacto'), {
  target: { value: '+573001112233' },
});
```

```ts
expect(organizationApi.create).toHaveBeenCalledWith(
  expect.objectContaining({
    latitude: 4.6486259,
    longitude: -74.0651466,
    contactName: 'Mesa tecnica centro',
    contactPhone: '+573001112233',
  }),
);
```

- [ ] **Step 2: Run portal test to verify it fails**

Run:

```bash
cd apps/portal && npx jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
```

Expected: FAIL porque el esquema del formulario y los tipos del cliente todavia no contemplan contacto del sitio.

- [ ] **Step 3: Write the minimal portal implementation**

En `apps/portal/src/lib/api-client.ts`, ampliar interfaces:

```ts
export interface OrganizationSiteDetail extends OrganizationSiteSummary {
  siteType: OrganizationSiteType;
  address: string | null;
  municipality: string | null;
  department: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  contactName: string | null;
  contactPhone: string | null;
  isPrimary: boolean;
  // ...
}

export interface CreateOrganizationSiteDto {
  name: string;
  code: string;
  siteType: OrganizationSiteType;
  capabilities?: OrganizationSiteCapability[];
  address?: string | null;
  municipality?: string | null;
  department?: string | null;
  country?: string;
  latitude: number;
  longitude: number;
  contactName: string;
  contactPhone: string;
  isPrimary?: boolean;
  isActive?: boolean;
}
```

En `apps/portal/src/components/settings/OrganizationSettingsClient.tsx`, ampliar `siteFormSchema`, defaults y mapeos:

```ts
const siteFormSchema = z.object({
  name: z.string().trim().min(2, 'Minimo 2 caracteres.').max(160, 'Maximo 160 caracteres.'),
  code: z.string().trim().min(2, 'Minimo 2 caracteres.').max(40, 'Maximo 40 caracteres.').regex(/^[A-Z0-9_-]+$/u, 'Usa mayúsculas, números, guion o guion bajo.'),
  siteType: z.nativeEnum(OrganizationSiteType),
  address: z.string().trim().max(240, 'Maximo 240 caracteres.').optional(),
  municipality: z.string().trim().max(120, 'Maximo 120 caracteres.').optional(),
  department: z.string().trim().max(120, 'Maximo 120 caracteres.').optional(),
  latitude: z.coerce.number().min(-90, 'Minimo -90.').max(90, 'Maximo 90.'),
  longitude: z.coerce.number().min(-180, 'Minimo -180.').max(180, 'Maximo 180.'),
  contactName: z.string().trim().min(2, 'Minimo 2 caracteres.').max(160, 'Maximo 160 caracteres.'),
  contactPhone: z.string().trim().min(7, 'Minimo 7 caracteres.').max(32, 'Maximo 32 caracteres.'),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});
```

Agregar los inputs en el tab `Información de la sede` y mapearlos en `createDefaultSiteFormValues()`, `toSiteFormValues()` y `onSubmit()`.

- [ ] **Step 4: Run portal tests and typecheck**

Run:

```bash
cd apps/portal && npx jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
pnpm --filter @iwana/portal typecheck
```

Expected: PASS en el spec del modal y typecheck verde en `@iwana/portal`.

- [ ] **Step 5: Commit portal changes**

```bash
git add apps/portal/src/lib/api-client.ts apps/portal/src/components/settings/OrganizationSettingsClient.tsx apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx
git commit -m "feat: require location and site contact in organization form"
```

### Task 4: Ejecutar verificacion del slice completo

**Files:**

- Modify: ninguno si todo pasa
- Test: `apps/api/src/modules/organization/organization.service.spec.ts`
- Test: `apps/api/src/modules/organization/organization.controller.http.spec.ts`
- Test: `apps/portal/src/components/settings/OrganizationSettingsClient.spec.tsx`

- [ ] **Step 1: Run focused backend tests**

```bash
cd apps/api && npx jest src/modules/organization/organization.service.spec.ts src/modules/organization/organization.controller.http.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run focused portal test**

```bash
cd apps/portal && npx jest src/components/settings/OrganizationSettingsClient.spec.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run package typechecks**

```bash
pnpm --filter @iwana/db typecheck
pnpm --filter @iwana/api typecheck
pnpm --filter @iwana/portal typecheck
```

Expected: PASS en los tres paquetes.

- [ ] **Step 4: Review approved boundary before merge**

Verificar contra los documentos aprobados:

```text
- ADR-044 permanece sin cambios de boundary
- No se agrega NODE a OrganizationSiteType
- No se toca CommercialNode legacy
- El formulario de sedes solo agrega coordenadas + contacto
```

- [ ] **Step 5: Commit verification checkpoint**

```bash
git status --short
git add -A
git commit -m "test: validate organization site contact refinement"
```

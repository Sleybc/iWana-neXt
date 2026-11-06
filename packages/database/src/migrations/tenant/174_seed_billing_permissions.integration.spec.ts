import { randomUUID } from 'node:crypto';

import {
  createBillingIntegrationDataSource,
  createBillingTenantFixture,
  billingPostgresIntegrationEnabled,
  dropBillingTenantFixture,
  type BillingTenantFixture,
} from './billing-migration.integration-helpers';
import { SeedBillingPermissions1740000000174 } from './174_seed_billing_permissions';

const describeWithBillingPostgres = billingPostgresIntegrationEnabled ? describe : describe.skip;

const RESERVED_PERMISSIONS = [
  ['billing.payments.read', 'read', 'Ver recaudos futuros'],
  ['billing.payments.register', 'register', 'Registrar recaudo futuro'],
  ['billing.invoices.read', 'read', 'Ver facturas futuras'],
  ['billing.invoices.manage', 'manage', 'Gestionar facturación futura'],
] as const;

const SYSTEM_PROFILES = [
  'Administrador general',
  'Acceso estándar Contable',
  'Acceso estándar Soporte',
  'Acceso estándar Comercial',
  'Acceso estándar Auditoría',
] as const;

describeWithBillingPostgres('174 — permisos de facturación en PostgreSQL real', () => {
  let dataSource = createBillingIntegrationDataSource();
  let fixture: BillingTenantFixture | undefined;
  const migration = new SeedBillingPermissions1740000000174();

  beforeAll(async () => {
    await dataSource.initialize();
    fixture = await createBillingTenantFixture(dataSource, 'tenant_billing174');
    await fixture.queryRunner.query(`
      CREATE TABLE access_permission_catalog (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        permission_key varchar(120) NOT NULL, module_key varchar(60) NOT NULL,
        action varchar(60) NOT NULL, description varchar(240) NOT NULL,
        catalog_version varchar(40) NOT NULL,
        availability varchar(20) NOT NULL CHECK (availability IN ('ASSIGNABLE', 'RESERVED')),
        is_system boolean NOT NULL DEFAULT true, is_active boolean NOT NULL DEFAULT true,
        UNIQUE (tenant_id, permission_key)
      );
      CREATE TABLE access_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL, description text, base_role_constraint varchar(30),
        scope_site_id uuid, is_system boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
      );
      CREATE UNIQUE INDEX uq_access_profiles_tenant_name
        ON access_profiles (tenant_id, name) WHERE deleted_at IS NULL;
      CREATE TABLE access_profile_permissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        profile_id uuid NOT NULL, permission_key varchar(120) NOT NULL
      );
      CREATE UNIQUE INDEX uq_access_profile_permissions_profile_permission
        ON access_profile_permissions (tenant_id, profile_id, permission_key);
    `);

    for (const [permissionKey, action, description] of RESERVED_PERMISSIONS) {
      await fixture.queryRunner.query(
        `INSERT INTO access_permission_catalog
          (tenant_id, permission_key, module_key, action, description, catalog_version,
           availability, is_system, is_active)
         VALUES ($1, $2, 'billing', $3, $4, 'MOD00_ACCESS_V2', 'RESERVED', true, true)`,
        [fixture.tenantId, permissionKey, action, description],
      );
    }

    for (const name of SYSTEM_PROFILES) {
      await fixture.queryRunner.query(
        `INSERT INTO access_profiles (tenant_id, name, is_system, is_active)
         VALUES ($1, $2, true, true)`,
        [fixture.tenantId, name],
      );
    }
    const customProfileId = randomUUID();
    const supportProfileId = (await fixture.queryRunner.query(
      `SELECT id FROM access_profiles WHERE tenant_id = $1 AND name = 'Acceso estándar Soporte'`,
      [fixture.tenantId],
    )) as Array<{ id: string }>;
    await fixture.queryRunner.query(
      `INSERT INTO access_profiles (id, tenant_id, name, is_system, is_active)
       VALUES ($1, $2, 'Perfil personalizado', false, true)`,
      [customProfileId, fixture.tenantId],
    );
    await fixture.queryRunner.query(
      `INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
       VALUES ($1, $2, 'billing.invoices.read'), ($1, $3, 'billing.invoices.read')`,
      [fixture.tenantId, supportProfileId[0]?.id, customProfileId],
    );
  });

  afterAll(async () => {
    await dropBillingTenantFixture(dataSource, fixture);
  });

  it('up promueve y asigna permisos, down restaura el catálogo RESERVED previo', async () => {
    const activeFixture = fixture;
    const queryRunner = activeFixture?.queryRunner;
    if (!activeFixture || !queryRunner) throw new Error('Fixture MOD14 174 no inicializado.');

    await migration.up(queryRunner);
    const catalog = (await queryRunner.query(
      `SELECT permission_key, catalog_version, availability FROM access_permission_catalog
       WHERE tenant_id = $1 ORDER BY permission_key`,
      [activeFixture.tenantId],
    )) as Array<{ permission_key: string; catalog_version: string; availability: string }>;
    expect(catalog).toHaveLength(5);
    expect(catalog.every((row) => row.availability === 'ASSIGNABLE')).toBe(true);
    expect(catalog.every((row) => row.catalog_version === 'MOD14_BILLING_V1')).toBe(true);

    const assignments = (await queryRunner.query(
      `SELECT p.name, array_agg(ap.permission_key ORDER BY ap.permission_key) AS permissions
       FROM access_profiles p
       LEFT JOIN access_profile_permissions ap ON ap.profile_id = p.id AND ap.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.name = ANY($2::varchar[])
       GROUP BY p.name ORDER BY p.name`,
      [activeFixture.tenantId, [...SYSTEM_PROFILES]],
    )) as Array<{ name: string; permissions: string[] | null }>;
    const byProfile = new Map(
      assignments.map(({ name, permissions }) => [name, permissions ?? []]),
    );
    expect(byProfile.get('Administrador general')).toHaveLength(5);
    expect(byProfile.get('Acceso estándar Contable')).toHaveLength(4);
    expect(byProfile.get('Acceso estándar Soporte')).toEqual([
      'billing.invoices.read',
      'billing.payments.read',
    ]);
    expect(byProfile.get('Acceso estándar Comercial')).toEqual([
      'billing.invoices.read',
      'billing.payments.read',
    ]);
    expect(byProfile.get('Acceso estándar Auditoría')).toEqual([
      'billing.invoices.read',
      'billing.payments.read',
    ]);

    // Una segunda ejecución no duplica filas ni pierde el estado reservado original.
    await migration.up(queryRunner);
    expect(
      await queryRunner.query(
        `SELECT permission_key FROM access_permission_catalog WHERE tenant_id = $1`,
        [activeFixture.tenantId],
      ),
    ).toHaveLength(5);

    await migration.down(queryRunner);
    const restoredCatalog = (await queryRunner.query(
      `SELECT permission_key, catalog_version, availability, description
       FROM access_permission_catalog WHERE tenant_id = $1 ORDER BY permission_key`,
      [activeFixture.tenantId],
    )) as Array<{
      permission_key: string;
      catalog_version: string;
      availability: string;
      description: string;
    }>;
    expect(restoredCatalog).toEqual(
      [...RESERVED_PERMISSIONS]
        .map(([permission_key, , description]) => ({
          permission_key,
          catalog_version: 'MOD00_ACCESS_V2',
          availability: 'RESERVED',
          description,
        }))
        .sort((left, right) => left.permission_key.localeCompare(right.permission_key)),
    );

    const restoredAssignments = (await queryRunner.query(
      `SELECT p.name, ap.permission_key FROM access_profile_permissions ap
       JOIN access_profiles p ON p.id = ap.profile_id
       WHERE ap.tenant_id = $1 ORDER BY p.name, ap.permission_key`,
      [activeFixture.tenantId],
    )) as Array<{ name: string; permission_key: string }>;
    expect(restoredAssignments).toEqual([
      { name: 'Acceso estándar Soporte', permission_key: 'billing.invoices.read' },
      { name: 'Perfil personalizado', permission_key: 'billing.invoices.read' },
    ]);
    expect(
      await queryRunner.query(
        `SELECT to_regclass('billing_permission_catalog_backup_174') AS catalog_backup,
                to_regclass('billing_profile_permissions_backup_174') AS permissions_backup`,
      ),
    ).toEqual([{ catalog_backup: null, permissions_backup: null }]);
  });
});

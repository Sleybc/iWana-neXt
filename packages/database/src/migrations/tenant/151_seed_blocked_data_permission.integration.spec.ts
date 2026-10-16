import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { SeedBlockedDataPermission1510000000000 } from './151_seed_blocked_data_permission';

const SCHEMA = `tenant_blocked_permission_151_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 151: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un tenant efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 151 — permiso de lectura de datos bloqueados en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new SeedBlockedDataPermission1510000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? '',
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
      extra: { max: 2, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query(`SET LOCAL search_path TO "${SCHEMA}"`);
    await runner.query(
      `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email)
       VALUES ($1, 'Privacy permission fixture', $2, $3, 'privacy-fixture@invalid.example')`,
      [TENANT_ID, `${SCHEMA}-slug`, SCHEMA],
    );
    await runner.query(`
      CREATE TABLE access_permission_catalog (
        id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        permission_key varchar(120) NOT NULL, module_key varchar(60) NOT NULL,
        action varchar(60) NOT NULL, description varchar(240) NOT NULL,
        catalog_version varchar(40) NOT NULL, availability varchar(20) NOT NULL,
        is_system boolean NOT NULL DEFAULT true, is_active boolean NOT NULL DEFAULT true,
        PRIMARY KEY (id), UNIQUE (tenant_id, permission_key)
      )
    `);
    await runner.query(`
      CREATE TABLE access_profiles (
        id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        name varchar(120) NOT NULL, description text, base_role_constraint varchar(30),
        scope_site_id uuid, is_system boolean NOT NULL DEFAULT false,
        is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
        PRIMARY KEY (id)
      )
    `);
    await runner.query(`
      CREATE UNIQUE INDEX uq_access_profiles_tenant_name
        ON access_profiles (tenant_id, name) WHERE deleted_at IS NULL
    `);
    await runner.query(`
      CREATE TABLE access_profile_permissions (
        id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        profile_id uuid NOT NULL, permission_key varchar(120) NOT NULL,
        PRIMARY KEY (id), UNIQUE (tenant_id, profile_id, permission_key)
      )
    `);
    await runner.query(
      `
      INSERT INTO access_profiles (tenant_id, name, base_role_constraint, is_system)
      VALUES ($1, 'Facturación y cobro', 'SALES', true)
    `,
      [TENANT_ID],
    );
    await runner.query(
      `
      INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
      SELECT $1, id, 'crm.subscribers.read' FROM access_profiles
      WHERE tenant_id = $1 AND name = 'Facturación y cobro'
    `,
      [TENANT_ID],
    );
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) {
        try {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
        } finally {
          await runner.release();
        }
      }
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('siembra solo el permiso del perfil ACCOUNTANT, y revierte y reaplica el seed', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const catalog = (await active.query(
      `SELECT module_key, action, catalog_version, availability, is_system, is_active
       FROM access_permission_catalog WHERE tenant_id = $1
         AND permission_key = 'crm.blocked_data.read'`,
      [TENANT_ID],
    )) as Array<{
      module_key: string;
      action: string;
      catalog_version: string;
      availability: string;
      is_system: boolean;
      is_active: boolean;
    }>;
    expect(catalog).toEqual([
      {
        module_key: 'crm',
        action: 'blocked_data.read',
        catalog_version: 'ADR-094_PRIVACY_V1B',
        availability: 'ASSIGNABLE',
        is_system: true,
        is_active: true,
      },
    ]);

    const profile = (await active.query(
      `SELECT id, base_role_constraint, is_system, is_active FROM access_profiles
       WHERE tenant_id = $1 AND name = 'Facturación y cobro' AND deleted_at IS NULL`,
      [TENANT_ID],
    )) as Array<{
      id: string;
      base_role_constraint: string;
      is_system: boolean;
      is_active: boolean;
    }>;
    expect(profile).toHaveLength(1);
    expect(profile[0]).toMatchObject({
      base_role_constraint: 'ACCOUNTANT',
      is_system: true,
      is_active: true,
    });
    const profileId = profile[0]?.id;
    if (!profileId) throw new Error('No se creó la plantilla de facturación y cobro.');

    await migration.up(active);
    const assignments = (await active.query(
      `SELECT permission_key FROM access_profile_permissions
       WHERE tenant_id = $1 AND profile_id = $2 ORDER BY permission_key`,
      [TENANT_ID, profileId],
    )) as Array<{ permission_key: string }>;
    expect(assignments).toEqual([{ permission_key: 'crm.blocked_data.read' }]);

    await migration.down(active);
    const disabledProfile = (await active.query(
      `SELECT is_active FROM access_profiles WHERE id = $1`,
      [profileId],
    )) as Array<{ is_active: boolean }>;
    expect(disabledProfile).toEqual([{ is_active: false }]);
    expect(
      await active.query(
        `SELECT 1 FROM access_permission_catalog WHERE tenant_id = $1
         AND permission_key = 'crm.blocked_data.read'`,
        [TENANT_ID],
      ),
    ).toHaveLength(0);
    expect(
      await active.query(`SELECT 1 FROM access_profile_permissions WHERE profile_id = $1`, [
        profileId,
      ]),
    ).toHaveLength(0);

    await migration.up(active);
    const reapplied = (await active.query(
      `SELECT base_role_constraint, is_active FROM access_profiles WHERE id = $1`,
      [profileId],
    )) as Array<{ base_role_constraint: string; is_active: boolean }>;
    expect(reapplied).toEqual([{ base_role_constraint: 'ACCOUNTANT', is_active: true }]);
    expect(
      await active.query(`SELECT 1 FROM access_profile_permissions WHERE profile_id = $1`, [
        profileId,
      ]),
    ).toHaveLength(1);
  });
});

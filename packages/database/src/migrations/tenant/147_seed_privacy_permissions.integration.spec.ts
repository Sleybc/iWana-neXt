import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { SeedPrivacyPermissions1470000000000 } from './147_seed_privacy_permissions';

const SCHEMA = `tenant_privacy_147_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 147: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un tenant efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 147 — permisos privacy en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new SeedPrivacyPermissions1470000000000();

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
       VALUES ($1, 'Privacy migration fixture', $2, $3, 'privacy-fixture@invalid.example')`,
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
        PRIMARY KEY (id)
      )
    `);
    await runner.query(`
      CREATE UNIQUE INDEX uq_access_profile_permissions_profile_permission
        ON access_profile_permissions (tenant_id, profile_id, permission_key)
    `);
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

  it('ejecuta up/down/up y conserva una plantilla inactiva tras rollback', async () => {
    const active = requireRunner(runner);

    await migration.up(active);
    const permissions = (await active.query(
      `SELECT permission_key FROM access_permission_catalog ORDER BY permission_key`,
    )) as Array<{ permission_key: string }>;
    expect(permissions.map((row) => row.permission_key)).toEqual([
      'privacy.manage',
      'privacy.read',
    ]);
    const initial = (await active.query(
      `SELECT id, base_role_constraint, is_active FROM access_profiles
       WHERE tenant_id = $1 AND name = 'Oficial de protección de datos'`,
      [TENANT_ID],
    )) as Array<{ id: string; base_role_constraint: string; is_active: boolean }>;
    expect(initial).toHaveLength(1);
    expect(initial[0]).toMatchObject({ base_role_constraint: 'AUDITOR', is_active: true });
    const profileId = initial[0]?.id;
    if (!profileId) throw new Error('No se creó la plantilla privacy.');

    await migration.up(active);
    const permissionAssignments = (await active.query(
      `SELECT permission_key FROM access_profile_permissions WHERE profile_id = $1 ORDER BY permission_key`,
      [profileId],
    )) as Array<{ permission_key: string }>;
    expect(permissionAssignments.map((row) => row.permission_key)).toEqual([
      'privacy.manage',
      'privacy.read',
    ]);

    await migration.down(active);
    const rolledBack = (await active.query(`SELECT is_active FROM access_profiles WHERE id = $1`, [
      profileId,
    ])) as Array<{ is_active: boolean }>;
    expect(rolledBack).toEqual([{ is_active: false }]);
    expect(
      await active.query(
        `SELECT 1 FROM access_permission_catalog WHERE permission_key LIKE 'privacy.%'`,
      ),
    ).toHaveLength(0);
    expect(
      await active.query(`SELECT 1 FROM access_profile_permissions WHERE profile_id = $1`, [
        profileId,
      ]),
    ).toHaveLength(0);

    await migration.up(active);
    const final = (await active.query(`SELECT is_active FROM access_profiles WHERE id = $1`, [
      profileId,
    ])) as Array<{ is_active: boolean }>;
    expect(final).toEqual([{ is_active: true }]);
    expect(
      await active.query(`SELECT 1 FROM access_profile_permissions WHERE profile_id = $1`, [
        profileId,
      ]),
    ).toHaveLength(2);
  });
});

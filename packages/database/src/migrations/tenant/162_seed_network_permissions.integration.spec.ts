import { randomBytes, randomUUID } from 'node:crypto';
import { AccessPermissionKey } from '@iwana/shared';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { EnableBtreeGist1784419216000 } from '../public/028_enable_btree_gist';
import { CreateNetworkCatalog1600000000000 } from './160_network_catalog';
import { CreateNetworkProvisioning1610000000000 } from './161_network_provisioning';
import { SeedNetworkPermissions1620000000000 } from './162_seed_network_permissions';

const SCHEMA = `tenant_network_permissions_162_${randomBytes(4).toString('hex')}`;
const TENANT_ID = randomUUID();
const DB_AVAILABLE = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = DB_AVAILABLE ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (DB_AVAILABLE && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 162: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un tenant efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

describeWithDb('Migración 162 — permisos de aprovisionamiento en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const btreeGistMigration = new EnableBtreeGist1784419216000();
  const catalogMigration = new CreateNetworkCatalog1600000000000();
  const provisioningMigration = new CreateNetworkProvisioning1610000000000();
  const migration = new SeedNetworkPermissions1620000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'dbiw',
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
      await btreeGistMigration.up(bootstrap);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email, status)
         VALUES ($1, 'Network permission fixture', $2, $3,
                 'network-permission-fixture@invalid.example', 'PROVISIONING')`,
        [TENANT_ID, `${SCHEMA}-slug`, SCHEMA],
      );
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
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
      `INSERT INTO access_profiles (tenant_id, name, base_role_constraint, is_system, is_active)
       VALUES ($1, 'Administrador general', 'ADMIN', true, true),
              ($1, 'Acceso estándar NOC', 'NOC', true, true)`,
      [TENANT_ID],
    );
    await catalogMigration.up(runner);
    await provisioningMigration.up(runner);
  });

  afterAll(async () => {
    try {
      if (runner && !runner.isReleased) await runner.release();
    } finally {
      if (dataSource?.isInitialized) {
        const cleanup = dataSource.createQueryRunner();
        try {
          await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
          await cleanup.query('DELETE FROM public.tenants WHERE id = $1', [TENANT_ID]);
        } finally {
          await cleanup.release();
          await dataSource.destroy();
        }
      }
    }
  });

  it('aplica y revierte 160–162, sembrando seis claves para ADMIN y ambos perfiles NOC', async () => {
    const active = requireRunner(runner);
    const keys = [
      AccessPermissionKey.NETWORK_CATALOG_READ,
      AccessPermissionKey.NETWORK_CATALOG_MANAGE,
      AccessPermissionKey.NETWORK_PROVISIONING_READ,
      AccessPermissionKey.NETWORK_PROVISIONING_EXECUTE,
      AccessPermissionKey.NETWORK_PROVISIONING_CERTIFY,
      AccessPermissionKey.NETWORK_PROVISIONING_REGULARIZE,
    ];

    await migration.up(active);
    await migration.up(active);

    const catalog = (await active.query(
      `SELECT permission_key, module_key, catalog_version, availability, is_system, is_active
       FROM access_permission_catalog WHERE tenant_id = $1 ORDER BY permission_key`,
      [TENANT_ID],
    )) as Array<{
      permission_key: string;
      module_key: string;
      catalog_version: string;
      availability: string;
      is_system: boolean;
      is_active: boolean;
    }>;
    expect(catalog).toHaveLength(6);
    expect(catalog.map(({ permission_key }) => permission_key)).toEqual(keys.slice().sort());
    expect(catalog).toEqual(
      expect.arrayContaining(
        keys.map((permission_key) => ({
          permission_key,
          module_key: 'network',
          catalog_version: 'MOD13_NETWORK_V1',
          availability: 'ASSIGNABLE',
          is_system: true,
          is_active: true,
        })),
      ),
    );

    const assignments = (await active.query(
      `SELECT profile.name, permission.permission_key
       FROM access_profile_permissions permission
       JOIN access_profiles profile ON profile.id = permission.profile_id
       WHERE permission.tenant_id = $1
       ORDER BY profile.name, permission.permission_key`,
      [TENANT_ID],
    )) as Array<{ name: string; permission_key: string }>;
    const byProfile = new Map<string, string[]>();
    for (const assignment of assignments) {
      const current = byProfile.get(assignment.name) ?? [];
      current.push(assignment.permission_key);
      byProfile.set(assignment.name, current);
    }
    expect(byProfile.get('Administrador general')).toEqual(keys.slice().sort());
    const nocKeys = keys.slice().sort();
    expect(byProfile.get('Acceso estándar NOC')).toEqual(nocKeys);
    expect(byProfile.get('Acceso estándar Aprovisionamiento')).toEqual(nocKeys);

    expect(
      await active.query(
        `SELECT enforce_provisioning_on_install_close FROM network_settings WHERE tenant_id = $1`,
        [TENANT_ID],
      ),
    ).toEqual([{ enforce_provisioning_on_install_close: false }]);

    await migration.down(active);
    await provisioningMigration.down(active);
    await catalogMigration.down(active);
    expect(
      await active.query('SELECT 1 FROM access_permission_catalog WHERE tenant_id = $1', [
        TENANT_ID,
      ]),
    ).toEqual([]);
    expect(
      await active.query('SELECT 1 FROM access_profile_permissions WHERE tenant_id = $1', [
        TENANT_ID,
      ]),
    ).toEqual([]);
    expect(
      await active.query(
        `SELECT is_active FROM access_profiles
         WHERE tenant_id = $1 AND name = 'Acceso estándar Aprovisionamiento'`,
        [TENANT_ID],
      ),
    ).toEqual([{ is_active: false }]);
    expect(
      await active.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'network_settings'`,
      ),
    ).toEqual([]);
  });
});

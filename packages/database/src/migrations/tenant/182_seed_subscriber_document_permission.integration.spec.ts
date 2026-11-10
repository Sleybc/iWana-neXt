import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { SeedSubscriberDocumentPermission1820000000182 } from './182_seed_subscriber_document_permission';

const SCHEMA = `tenant_document_permission_182_${randomBytes(5).toString('hex')}`;
const TENANT_ID = randomUUID();
const PERMISSION = 'crm.subscribers.document.read';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const INTEGRATION_DATABASE_NAME = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !INTEGRATION_DATABASE_NAME.test(process.env['DB_NAME'] ?? '')) {
  throw new Error(
    'Integración 182: DB_NAME debe ser dbiw, test o iwana_it_*; solo crea y limpia un tenant efímero.',
  );
}

function requireRunner(runner: QueryRunner | undefined): QueryRunner {
  if (!runner) throw new Error('QueryRunner de integración no inicializado.');
  return runner;
}

/** Plantillas del tenant de prueba: las cuatro con concesión, más las que no la reciben. */
const PROFILES: Array<{ name: string; role: string; isSystem: boolean }> = [
  { name: 'Administrador general', role: 'ADMIN', isSystem: true },
  { name: 'Acceso estándar Soporte', role: 'SUPPORT', isSystem: true },
  { name: 'Acceso estándar Comercial', role: 'SALES', isSystem: true },
  { name: 'Acceso estándar Contable', role: 'ACCOUNTANT', isSystem: true },
  { name: 'Acceso estándar NOC', role: 'NOC', isSystem: true },
  { name: 'Acceso estándar Técnico', role: 'TECHNICIAN', isSystem: true },
  { name: 'Acceso estándar Auditoría', role: 'AUDITOR', isSystem: true },
  // Perfil personalizado con nombre canónico pero rol distinto: no debe recibir la clave.
  { name: 'Comercial personalizado', role: 'SALES', isSystem: false },
];

describeWithDb('Migración 182 — permiso del número de documento en PostgreSQL real', () => {
  let dataSource: DataSource | undefined;
  let runner: QueryRunner | undefined;
  const migration = new SeedSubscriberDocumentPermission1820000000182();

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
       VALUES ($1, 'Document permission fixture', $2, $3, 'document-fixture@invalid.example')`,
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
      CREATE TABLE access_profile_permissions (
        id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
        profile_id uuid NOT NULL, permission_key varchar(120) NOT NULL,
        PRIMARY KEY (id), UNIQUE (tenant_id, profile_id, permission_key)
      )
    `);
    for (const profile of PROFILES) {
      await runner.query(
        `INSERT INTO access_profiles (tenant_id, name, base_role_constraint, is_system)
         VALUES ($1, $2, $3, $4)`,
        [TENANT_ID, profile.name, profile.role, profile.isSystem],
      );
    }
    // Una asignación previa ajena a la migración que down debe conservar.
    await runner.query(
      `INSERT INTO access_profile_permissions (tenant_id, profile_id, permission_key)
       SELECT $1, id, 'crm.subscribers.read' FROM access_profiles
       WHERE tenant_id = $1 AND name = 'Acceso estándar Comercial'`,
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

  async function grantedRoles(active: QueryRunner): Promise<string[]> {
    const rows = (await active.query(
      `SELECT p.base_role_constraint AS role FROM access_profile_permissions app
       JOIN access_profiles p ON p.id = app.profile_id
       WHERE app.tenant_id = $1 AND app.permission_key = $2
       ORDER BY p.base_role_constraint`,
      [TENANT_ID, PERMISSION],
    )) as Array<{ role: string }>;
    return rows.map(({ role }) => role);
  }

  it('siembra el catálogo y lo concede solo a Administración, Soporte, Comercial y Contable', async () => {
    const active = requireRunner(runner);
    await migration.up(active);

    const catalog = (await active.query(
      `SELECT module_key, action, catalog_version, availability, is_system, is_active
       FROM access_permission_catalog WHERE tenant_id = $1 AND permission_key = $2`,
      [TENANT_ID, PERMISSION],
    )) as unknown[];
    expect(catalog).toEqual([
      {
        module_key: 'crm',
        action: 'document.read',
        catalog_version: 'MOD00_ACCESS_V2',
        availability: 'ASSIGNABLE',
        is_system: true,
        is_active: true,
      },
    ]);
    expect(await grantedRoles(active)).toEqual(['ACCOUNTANT', 'ADMIN', 'SALES', 'SUPPORT']);
  });

  it('es idempotente, revierte sin tocar otras claves y se puede reaplicar', async () => {
    const active = requireRunner(runner);
    await migration.up(active);
    expect(await grantedRoles(active)).toEqual(['ACCOUNTANT', 'ADMIN', 'SALES', 'SUPPORT']);

    await migration.down(active);
    expect(await grantedRoles(active)).toEqual([]);
    expect(
      await active.query(
        `SELECT 1 FROM access_permission_catalog WHERE tenant_id = $1 AND permission_key = $2`,
        [TENANT_ID, PERMISSION],
      ),
    ).toHaveLength(0);
    expect(
      await active.query(
        `SELECT 1 FROM access_profile_permissions
         WHERE tenant_id = $1 AND permission_key = 'crm.subscribers.read'`,
        [TENANT_ID],
      ),
    ).toHaveLength(1);

    await migration.up(active);
    expect(await grantedRoles(active)).toEqual(['ACCOUNTANT', 'ADMIN', 'SALES', 'SUPPORT']);
  });

  it('rechaza ejecutarse fuera de un schema tenant', async () => {
    const active = requireRunner(runner);
    await active.query('SAVEPOINT outside_tenant');
    await active.query('SET LOCAL search_path TO public');
    await expect(migration.up(active)).rejects.toThrow('schema tenant válido');
    await active.query('ROLLBACK TO SAVEPOINT outside_tenant');
    await active.query(`SET LOCAL search_path TO "${SCHEMA}"`);
  });
});

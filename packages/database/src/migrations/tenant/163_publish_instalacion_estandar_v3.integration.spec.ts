import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { PublishInstalacionV3163000000000 } from './163_publish_instalacion_estandar_v3';

const SCHEMA = `tenant_it163_${randomBytes(4).toString('hex')}`;
const TENANT_ID = randomUUID();
const TEMPLATE_ID = randomUUID();
const V2_ID = randomUUID();
const OPEN_ORDER_ID = randomUUID();
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;

if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error(
    'La integración 163 solo crea y limpia datos efímeros en dbiw, test o iwana_it_*',
  );
}

if (!dbAvailable) {
  console.warn('[163-integration] describe.skip activo — sin PostgreSQL real.');
}

describeWithDb('163 publica INSTALACION_ESTANDAR v3 — PostgreSQL real', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration = new PublishInstalacionV3163000000000();

  beforeAll(async () => {
    const credentials = resolveMigrationDbCredentials();
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port: Number.parseInt(process.env['DB_PORT'] ?? '5432', 10),
      username: credentials.username,
      password: credentials.password,
      database: process.env['DB_NAME'] ?? 'iwana',
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
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TENANT_ID,
          'Integration tenant 163',
          `${SCHEMA}-slug`,
          SCHEMA,
          `${SCHEMA}@invalid.example`,
        ],
      );
    } finally {
      await bootstrap.release();
    }

    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.query(`SET search_path TO "${SCHEMA}"`);
    await runner.query(`
      CREATE TABLE execution_order_templates (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, key VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL
      );
      CREATE TABLE execution_order_template_versions (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, template_id UUID NOT NULL,
        template_key VARCHAR(64) NOT NULL, version INTEGER NOT NULL, label VARCHAR(200) NOT NULL,
        status VARCHAR(20) NOT NULL, reason_catalogs JSONB, published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE execution_order_template_requirements (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, version_id UUID NOT NULL,
        key VARCHAR(64) NOT NULL, label VARCHAR(200) NOT NULL, required BOOLEAN NOT NULL,
        kind VARCHAR(20) NOT NULL, config JSONB, sort_order INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE execution_orders (
        id UUID PRIMARY KEY, tenant_id UUID NOT NULL, template_version_id UUID,
        status VARCHAR(40) NOT NULL
      );
    `);
    await runner.query(
      `INSERT INTO execution_order_templates (id, tenant_id, key, status)
       VALUES ($1, $2, 'INSTALACION_ESTANDAR', 'PUBLISHED')`,
      [TEMPLATE_ID, TENANT_ID],
    );
    await runner.query(
      `INSERT INTO execution_order_template_versions
        (id, tenant_id, template_id, template_key, version, label, status, reason_catalogs)
       VALUES ($1, $2, $3, 'INSTALACION_ESTANDAR', 2, 'Instalación estándar v2', 'PUBLISHED', '[]')`,
      [V2_ID, TENANT_ID, TEMPLATE_ID],
    );
    await runner.query(
      `INSERT INTO execution_order_template_requirements
        (id, tenant_id, version_id, key, label, required, kind, config, sort_order)
       VALUES ($1, $2, $3, 'work-photo', 'Fotos del trabajo realizado', TRUE,
               'EVIDENCE', '{"evidenceType":"PHOTO"}', 0)`,
      [randomUUID(), TENANT_ID, V2_ID],
    );
  });

  afterAll(async () => {
    await runner?.release();
    if (!dataSource?.isInitialized) return;
    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await cleanup.query(`DELETE FROM public.tenants WHERE id = $1`, [TENANT_ID]);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('crea v3 con el requisito nuevo, es idempotente y revierte solo v3', async () => {
    await migration.up(runner);
    await migration.up(runner);
    const versions = await runner.query(
      'SELECT version FROM execution_order_template_versions WHERE tenant_id = $1 ORDER BY version',
      [TENANT_ID],
    );
    expect(versions.map((row: { version: number }) => Number(row.version))).toEqual([2, 3]);
    const requirementRows = await runner.query(
      `SELECT key, kind, required FROM execution_order_template_requirements WHERE tenant_id = $1 AND version_id <> $2`,
      [TENANT_ID, V2_ID],
    );
    expect(requirementRows).toContainEqual({
      key: 'service-provisioning',
      kind: 'PROVISIONING',
      required: true,
    });

    const version3 = await runner.query(
      `SELECT id FROM execution_order_template_versions WHERE tenant_id = $1 AND version = 3`,
      [TENANT_ID],
    );
    await runner.query(
      `INSERT INTO execution_orders (id, tenant_id, template_version_id, status)
       VALUES ($1, $2, $3, 'IN_PROGRESS')`,
      [OPEN_ORDER_ID, TENANT_ID, version3[0].id],
    );
    await expect(migration.down(runner)).rejects.toThrow(/OT referencian la v3/);
    await runner.query(`UPDATE execution_orders SET status = 'COMPLETED' WHERE id = $1`, [
      OPEN_ORDER_ID,
    ]);
    await expect(migration.down(runner)).rejects.toThrow(/OT referencian la v3/);
    await runner.query(`DELETE FROM execution_orders WHERE id = $1`, [OPEN_ORDER_ID]);
    await migration.down(runner);
    await expect(
      runner.query(
        'SELECT version FROM execution_order_template_versions WHERE tenant_id = $1 ORDER BY version',
        [TENANT_ID],
      ),
    ).resolves.toEqual([{ version: 2 }]);
  });
});

import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource, MigrationInterface, QueryRunner } from 'typeorm';
import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TENANT_MIGRATIONS } from './runner';
import { PublishInstalacionV3163000000000 } from './163_publish_instalacion_estandar_v3';
import { EnsureProvisioningRequirement1640000000000 } from './164_ensure_provisioning_requirement';

const SCHEMA = `tenant_it164_${randomBytes(4).toString('hex')}`;
const TENANT_ID = randomUUID();
const TEMPLATE_KEY = 'INSTALACION_ESTANDAR';
const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const allowedDatabase = /^(dbiw|test|iwana_it_[a-z0-9_]+)$/u;
const migration163Index = TENANT_MIGRATIONS.findIndex(
  (MigrationClass) => new MigrationClass().name === 'PublishInstalacionV3163000000000',
);
const MIGRATIONS_THROUGH_162 = TENANT_MIGRATIONS.slice(0, migration163Index);

if (dbAvailable && !allowedDatabase.test(process.env['DB_NAME'] ?? 'dbiw')) {
  throw new Error(
    'La integración 163/164 solo crea y limpia datos efímeros en dbiw, test o iwana_it_*',
  );
}
if (migration163Index < 0) {
  throw new Error('No se encontró la migración 163 en TENANT_MIGRATIONS');
}
if (!dbAvailable) {
  console.warn('[163/164-integration] describe.skip activo — sin PostgreSQL real.');
}

interface PublishedVersionRow {
  id: string;
  version: number;
  template_id: string;
  reason_catalogs: unknown;
}

interface TenantMigration extends MigrationInterface {
  name?: string;
  transactional?: boolean;
}

jest.setTimeout(900_000);

describeWithDb('163/164 aseguran PROVISIONING desde migraciones tenant reales — PostgreSQL', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;
  const migration163 = new PublishInstalacionV3163000000000();
  const migration164 = new EnsureProvisioningRequirement1640000000000();

  async function runThrough162(queryRunner: QueryRunner): Promise<void> {
    for (const MigrationClass of MIGRATIONS_THROUGH_162) {
      const migration = new MigrationClass() as TenantMigration;
      const migrationName = migration.name ?? MigrationClass.name;
      if (migration.transactional === false) {
        await migration.up(queryRunner);
        continue;
      }

      await queryRunner.startTransaction();
      try {
        await migration.up(queryRunner);
        await queryRunner.commitTransaction();
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw new Error(`Falló la migración de fixture ${migrationName}`, { cause: error });
      }
    }
  }

  async function versions(): Promise<number[]> {
    const rows = (await runner.query(
      `SELECT version FROM execution_order_template_versions
        WHERE tenant_id = $1 AND template_key = $2 ORDER BY version`,
      [TENANT_ID, TEMPLATE_KEY],
    )) as Array<{ version: number }>;
    return rows.map((row) => Number(row.version));
  }

  async function latestPublishedVersion(): Promise<PublishedVersionRow> {
    const rows = (await runner.query(
      `SELECT id, version, template_id, reason_catalogs
         FROM execution_order_template_versions
        WHERE tenant_id = $1 AND template_key = $2 AND status = 'PUBLISHED'
        ORDER BY version DESC LIMIT 1`,
      [TENANT_ID, TEMPLATE_KEY],
    )) as PublishedVersionRow[];
    const latest = rows[0];
    if (!latest) throw new Error('El fixture no tiene una versión publicada');
    return latest;
  }

  async function provisioningCount(versionId: string): Promise<number> {
    const rows = (await runner.query(
      `SELECT COUNT(*)::integer AS count
         FROM execution_order_template_requirements
        WHERE tenant_id = $1 AND version_id = $2 AND kind = 'PROVISIONING'`,
      [TENANT_ID, versionId],
    )) as Array<{ count: number }>;
    return Number(rows[0]?.count ?? 0);
  }

  async function requirementKindCheckDefinition(): Promise<string> {
    const rows = (await runner.query(
      `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
        WHERE conrelid = 'execution_order_template_requirements'::regclass
          AND conname = 'chk_execution_order_template_requirements_kind'`,
    )) as Array<{ definition: string }>;
    return rows[0]?.definition ?? '';
  }

  async function createLegacyV3WithoutProvisioning(): Promise<void> {
    const source = await latestPublishedVersion();
    if (source.version !== 2) {
      throw new Error(`El fixture debe partir de v2; encontró v${source.version}`);
    }
    const legacyVersionId = randomUUID();
    await runner.query(
      `INSERT INTO execution_order_template_versions
         (id, tenant_id, template_id, template_key, version, label, status,
          reason_catalogs, published_at, created_at)
       VALUES ($1, $2, $3, $4, 3, 'Instalación estándar v3 heredada', 'PUBLISHED', $5, NOW(), NOW())`,
      [legacyVersionId, TENANT_ID, source.template_id, TEMPLATE_KEY, source.reason_catalogs],
    );
    await runner.query(
      `INSERT INTO execution_order_template_requirements
         (id, tenant_id, version_id, key, label, required, kind, config, sort_order, created_at)
       SELECT gen_random_uuid(), tenant_id, $1, key, label, required, kind, config, sort_order, NOW()
         FROM execution_order_template_requirements
        WHERE tenant_id = $2 AND version_id = $3`,
      [legacyVersionId, TENANT_ID, source.id],
    );
  }

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
      await bootstrap.query(`CREATE SCHEMA "${SCHEMA}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, contact_email, status)
         VALUES ($1, $2, $3, $4, $5, 'INACTIVE')`,
        [
          TENANT_ID,
          'Integration tenant MOD13 migration',
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
    await runner.query(`SET search_path TO "${SCHEMA}", public`);
    await runThrough162(runner);

    const tenantRows = (await runner.query(`SELECT status FROM public.tenants WHERE id = $1`, [
      TENANT_ID,
    ])) as Array<{ status: string }>;
    expect(tenantRows[0]?.status).toBe('INACTIVE');
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

  beforeEach(async () => {
    await runner.startTransaction();
  });

  afterEach(async () => {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
  });

  it('corrige 163 para un tenant cuya última versión publicada es v2', async () => {
    expect((await latestPublishedVersion()).version).toBe(2);

    await migration163.up(runner);

    const latest = await latestPublishedVersion();
    expect(latest.version).toBe(3);
    expect(await provisioningCount(latest.id)).toBe(1);
    expect(await requirementKindCheckDefinition()).toContain('PROVISIONING');
    const v2Rows = (await runner.query(
      `SELECT id FROM execution_order_template_versions WHERE tenant_id = $1 AND template_key = $2 AND version = 2`,
      [TENANT_ID, TEMPLATE_KEY],
    )) as Array<{ id: string }>;
    expect(await provisioningCount(v2Rows[0]?.id ?? '')).toBe(0);

    await migration164.up(runner);
    expect(await versions()).toEqual([1, 2, 3]);

    await migration163.down(runner);
    expect(await versions()).toEqual([1, 2]);
    expect(await requirementKindCheckDefinition()).not.toContain('PROVISIONING');
  });

  it('164 repara una v3 heredada sin PROVISIONING y revierte su publicación', async () => {
    await createLegacyV3WithoutProvisioning();
    expect((await latestPublishedVersion()).version).toBe(3);

    await migration164.up(runner);

    const latest = await latestPublishedVersion();
    expect(latest.version).toBe(4);
    expect(await provisioningCount(latest.id)).toBe(1);
    expect(await requirementKindCheckDefinition()).toContain('PROVISIONING');
    await migration164.down(runner);
    expect(await versions()).toEqual([1, 2, 3]);
    expect(await requirementKindCheckDefinition()).not.toContain('PROVISIONING');
  });

  it('la reaplicación de 164 no crea versiones ni requisitos duplicados', async () => {
    await createLegacyV3WithoutProvisioning();

    await migration164.up(runner);
    await migration164.up(runner);

    const latest = await latestPublishedVersion();
    expect(latest.version).toBe(4);
    expect(await versions()).toEqual([1, 2, 3, 4]);
    expect(await provisioningCount(latest.id)).toBe(1);
  });
});

import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { resolveMigrationDbCredentials } from '../db-credentials';
import { AddMediaAssetStatusAndClaim1784419208000 } from './public/020_add_media_asset_status_and_claim';
import { CreateMediaAssetsTable1746000001000 } from './public/008_create_media_assets_table';
import { CreatePublicSchema1741766400000 } from './public/001_create_public_schema';
import { applyTenantMigrationsInOrder, createTenantDataSource } from './tenant/runner';
import { ExecutionOrderServerScope0980000000000 } from './tenant/098_execution_order_server_scope';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const schemaName = `tenant_it_r4_r24_${Date.now().toString(36)}`;
const tenantId = randomUUID();

if (!dbAvailable) {
  console.warn(
    '[BLOQUEO] R4/R2.4: PostgreSQL real no disponible; la cadena public 020 + tenant 089-097 no aporta evidencia.',
  );
}

describeWithDb('R4/R2.4 — cadena real de migraciones public y tenant', () => {
  let dataSource: DataSource;
  let tenantDataSource: DataSource | undefined;

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
      migrations: [
        CreatePublicSchema1741766400000,
        CreateMediaAssetsTable1746000001000,
        AddMediaAssetStatusAndClaim1784419208000,
      ],
      migrationsTableName: 'typeorm_migrations',
      synchronize: false,
      logging: false,
      extra: { max: 5, min: 1, connectionTimeoutMillis: 5_000 },
    });
    await dataSource.initialize();

    // TypeORM ordena por el timestamp del nombre de clase, no por el prefijo
    // numérico del archivo. En una base limpia esto ejecuta 001 → 008 → 020;
    // en una base ya migrada solo aplica lo pendiente.
    await dataSource.runMigrations();

    const bootstrap = dataSource.createQueryRunner();
    await bootstrap.connect();
    try {
      await bootstrap.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await bootstrap.query(`CREATE SCHEMA "${schemaName}"`);
      await bootstrap.query(
        `INSERT INTO public.tenants (id, name, slug, schema_name, status, contact_email)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5)`,
        [tenantId, 'R4/R2.4 integration', schemaName, schemaName, 'integration@example.invalid'],
      );
    } finally {
      await bootstrap.release();
    }

    tenantDataSource = createTenantDataSource(dataSource, schemaName, `r4-r24-${schemaName}`);
    await tenantDataSource.initialize();
    await applyTenantMigrationsInOrder(tenantDataSource);
  });

  afterAll(async () => {
    if (tenantDataSource?.isInitialized) {
      await tenantDataSource.destroy();
    }

    if (!dataSource?.isInitialized) return;

    const cleanup = dataSource.createQueryRunner();
    await cleanup.connect();
    try {
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await cleanup.query(`DELETE FROM public.tenants WHERE id = $1`, [tenantId]);
    } finally {
      await cleanup.release();
      await dataSource.destroy();
    }
  });

  it('aplica 020 después de la tabla canónica 008 en PostgreSQL real', async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      const columns = (await runner.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'media_assets'
           AND column_name IN ('asset_status', 'claim_ref', 'checksum_sha256')
         ORDER BY column_name`,
      )) as Array<{ column_name: string }>;

      expect(columns.map((row) => row.column_name)).toEqual([
        'asset_status',
        'checksum_sha256',
        'claim_ref',
      ]);
    } finally {
      await runner.release();
    }
  });

  it('aplica en orden el tramo tenant 089-098 sobre un schema limpio', async () => {
    if (!tenantDataSource) throw new Error('Tenant DataSource no inicializado');

    const runner = tenantDataSource.createQueryRunner();
    await runner.connect();
    try {
      const rows = (await runner.query(
        `SELECT name
         FROM typeorm_migrations
         WHERE name = ANY($1)
         ORDER BY id`,
        [
          [
            'PaginationOrderingIndexes0890000000000',
            'ExecutionOrderContractReliability0900000000000',
            'ExecutionOrderScheduleUnique0910000000000',
            'SeedExecutionOrderPermissions0920000000000',
            'ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000',
            'TemplateVersioningAndClosureGate0940000000000',
            'CreateExecutionOrderEvidenceUploadIntents0950000000000',
            'AddExecutionOrderEvidenceCapturedAt0960000000000',
            'ExecutionOrderItemUsageIntegerQuantity0970000000000',
            'ExecutionOrderServerScope0980000000000',
          ],
        ],
      )) as Array<{ name: string }>;

      expect(rows.map((row) => row.name)).toEqual([
        'PaginationOrderingIndexes0890000000000',
        'ExecutionOrderContractReliability0900000000000',
        'ExecutionOrderScheduleUnique0910000000000',
        'SeedExecutionOrderPermissions0920000000000',
        'ExtendVisitRequestStatusAndOutboxOccurredAt0930000000000',
        'TemplateVersioningAndClosureGate0940000000000',
        'CreateExecutionOrderEvidenceUploadIntents0950000000000',
        'AddExecutionOrderEvidenceCapturedAt0960000000000',
        'ExecutionOrderItemUsageIntegerQuantity0970000000000',
        'ExecutionOrderServerScope0980000000000',
      ]);

      const migration = new ExecutionOrderServerScope0980000000000();
      await migration.down(runner);
      const columns = (await runner.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'execution_orders'
           AND column_name = 'organization_site_id'`,
      )) as Array<{ column_name: string }>;
      expect(columns).toEqual([]);
    } finally {
      await runner.release();
    }
  });
});

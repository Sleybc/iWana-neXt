/**
 * Migración 037 contra PostgreSQL real: `down` y `up` son reversibles.
 *
 * Corre dentro de una transacción que siempre se revierte (el DDL de PostgreSQL es
 * transaccional), así que la base `test` queda como estaba y no toca `dbiw`.
 *
 * Ejecutar:
 *   IWANA_DB_INTEGRATION_AVAILABLE=true DB_NAME=test DB_PORT=5432 pnpm --filter @iwana/db exec \
 *     jest --config jest.integration.config.js 037
 */
import { DataSource, type QueryRunner } from 'typeorm';

import { resolveMigrationDbCredentials } from '../../db-credentials';
import { TenantUsageViewerRoles1784419225000 } from './037_tenant_usage_viewer_roles';

const dbAvailable = process.env['IWANA_DB_INTEGRATION_AVAILABLE'] === 'true';
const describeWithDb = dbAvailable ? describe : describe.skip;
const database = process.env['DB_NAME'] ?? '';
const port = Number(process.env['DB_PORT']);

if (dbAvailable && (database !== 'test' || !Number.isInteger(port) || port < 1)) {
  throw new Error('Integración 037 exige DB_NAME=test y DB_PORT explícito.');
}

describeWithDb('Migración 037 — reversibilidad (PostgreSQL real)', () => {
  let dataSource: DataSource;
  let runner: QueryRunner;

  const columnExists = async (): Promise<boolean> => {
    const rows = (await runner.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_branding_settings'
          AND column_name = 'tenant_usage_viewer_roles'`,
    )) as unknown[];
    return rows.length === 1;
  };
  const checkExists = async (): Promise<boolean> => {
    const rows = (await runner.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'chk_pbs_tenant_usage_viewer_roles'`,
    )) as unknown[];
    return rows.length === 1;
  };

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env['DB_HOST'] ?? 'localhost',
      port,
      database,
      ...resolveMigrationDbCredentials(),
    });
    await dataSource.initialize();
    runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });

  afterAll(async () => {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    await runner?.release();
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('down retira columna y CHECK; up los repone con vacío por defecto y CHECK activo', async () => {
    const migration = new TenantUsageViewerRoles1784419225000();
    expect(await columnExists()).toBe(true);

    await migration.down(runner);
    expect(await columnExists()).toBe(false);
    expect(await checkExists()).toBe(false);

    await migration.up(runner);
    expect(await columnExists()).toBe(true);
    expect(await checkExists()).toBe(true);

    await runner.query(`SAVEPOINT chk`);
    await expect(
      runner.query(
        `UPDATE public.platform_branding_settings SET tenant_usage_viewer_roles = ARRAY['SYSTEM_ADMIN']`,
      ),
    ).rejects.toThrow(/chk_pbs_tenant_usage_viewer_roles/u);
    await runner.query(`ROLLBACK TO SAVEPOINT chk`);
  });
});

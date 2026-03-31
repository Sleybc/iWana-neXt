import { DataSource } from 'typeorm';

const MIGRATION_LOCK_NAMESPACE = 42;
const MIGRATION_LOCK_RESOURCE = 1001;

export async function runTenantMigrations(dataSource: DataSource): Promise<void> {
  await acquireGlobalLock(dataSource);
  try {
    const tenants = await getActiveTenants(dataSource);
    console.log(`[MIGRATOR] Starting migrations for ${tenants.length} tenant(s)`);
    for (const tenant of tenants) {
      console.log(`[MIGRATOR] Migrating ${tenant.schema_name}`);
      const startTime = Date.now();
      try {
        await runMigrationsForTenant(dataSource, tenant.schema_name);
        console.log(`[MIGRATOR] Done ${tenant.schema_name} in ${Date.now() - startTime}ms`);
      } catch (err) {
        console.error(`[MIGRATOR] Failed ${tenant.schema_name}`, err);
        throw err;
      }
    }
  } finally {
    await releaseGlobalLock(dataSource);
  }
}

async function acquireGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_lock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock acquired');
}

async function releaseGlobalLock(dataSource: DataSource): Promise<void> {
  await dataSource.query(`SELECT pg_advisory_unlock($1, $2)`, [
    MIGRATION_LOCK_NAMESPACE,
    MIGRATION_LOCK_RESOURCE,
  ]);
  console.log('[MIGRATOR] Global lock released');
}

async function getActiveTenants(dataSource: DataSource): Promise<Array<{ schema_name: string }>> {
  return dataSource.query(`SELECT schema_name FROM public.tenants WHERE status = 'ACTIVE'`);
}

async function runMigrationsForTenant(
  baseDataSource: DataSource,
  schemaName: string,
): Promise<void> {
  let tenantDs: DataSource | null = null;
  try {
    tenantDs = new DataSource({
      type: 'postgres',
      host: baseDataSource.options.host,
      port: baseDataSource.options.port,
      username: baseDataSource.options.username,
      password: baseDataSource.options.password,
      database: baseDataSource.options.database,
      schema: schemaName,
      name: `tenant-${schemaName}`,
      migrationsTableName: 'typeorm_migrations',
      migrations: ['dist/migrations/tenant/*.js'],
      synchronize: false,
      logging: ['error'],
    });
    await tenantDs.initialize();
    await tenantDs.runMigrations();
  } finally {
    if (tenantDs?.isInitialized) {
      await tenantDs.destroy();
    }
  }
}

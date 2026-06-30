import { AppDataSource } from '../data-source';
import { runTenantMigrations } from '../migrations/tenant/runner';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  let exitCode = 0;
  try {
    await runTenantMigrations(AppDataSource);
    console.log('[MIGRATOR] All tenants migrated successfully');
  } catch (err) {
    console.error('[MIGRATOR] Fatal error:', err);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
  process.exit(exitCode);
}

main();

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const data_source_1 = require('../data-source');
const runner_1 = require('../migrations/tenant/runner');
async function main() {
  await data_source_1.AppDataSource.initialize();
  let exitCode = 0;
  try {
    await (0, runner_1.runTenantMigrations)(data_source_1.AppDataSource);
    console.log('[MIGRATOR] All tenants migrated successfully');
  } catch (err) {
    console.error('[MIGRATOR] Fatal error:', err);
    exitCode = 1;
  } finally {
    await data_source_1.AppDataSource.destroy();
  }
  process.exit(exitCode);
}
main();
//# sourceMappingURL=tenant-migrate.js.map

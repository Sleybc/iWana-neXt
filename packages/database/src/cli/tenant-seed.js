'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const data_source_1 = require('../data-source');
const additional_products_seed_1 = require('../seeds/additional-products.seed');
async function main() {
  await data_source_1.AppDataSource.initialize();
  let exitCode = 0;
  try {
    await (0, additional_products_seed_1.seedAdditionalProductsForAllTenants)(
      data_source_1.AppDataSource,
    );
    console.log('[SEED] All tenants seeded successfully');
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
    exitCode = 1;
  } finally {
    await data_source_1.AppDataSource.destroy();
  }
  process.exit(exitCode);
}
main();
//# sourceMappingURL=tenant-seed.js.map

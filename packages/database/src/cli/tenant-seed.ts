import { AppDataSource } from '../data-source';
import { seedAdditionalProductsForAllTenants } from '../seeds/additional-products.seed';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  let exitCode = 0;
  try {
    await seedAdditionalProductsForAllTenants(AppDataSource);
    console.log('[SEED] All tenants seeded successfully');
  } catch (err) {
    console.error('[SEED] Fatal error:', err);
    exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
  process.exit(exitCode);
}

main();

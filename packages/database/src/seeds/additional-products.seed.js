'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.seedAdditionalProducts = seedAdditionalProducts;
exports.seedAdditionalProductsForAllTenants = seedAdditionalProductsForAllTenants;
const typeorm_1 = require('typeorm');
const shared_1 = require('@iwana/shared');
const DEFAULT_PRODUCTS = [
  { name: 'TvBox', category: shared_1.AdditionalProductCategory.ENTERTAINMENT, sortOrder: 1 },
  {
    name: 'Decodificador adicional',
    category: shared_1.AdditionalProductCategory.ENTERTAINMENT,
    sortOrder: 2,
  },
  {
    name: 'Cámaras de seguridad',
    category: shared_1.AdditionalProductCategory.SECURITY,
    sortOrder: 1,
  },
  { name: 'DVR / NVR', category: shared_1.AdditionalProductCategory.SECURITY, sortOrder: 2 },
  {
    name: 'Alarma residencial',
    category: shared_1.AdditionalProductCategory.SECURITY,
    sortOrder: 3,
  },
  {
    name: 'Router WiFi mesh',
    category: shared_1.AdditionalProductCategory.CONNECTIVITY,
    sortOrder: 1,
  },
  {
    name: 'Extensor de cobertura',
    category: shared_1.AdditionalProductCategory.CONNECTIVITY,
    sortOrder: 2,
  },
  { name: 'IP estática', category: shared_1.AdditionalProductCategory.CONNECTIVITY, sortOrder: 3 },
  {
    name: 'Soporte prioritario',
    category: shared_1.AdditionalProductCategory.BUSINESS,
    sortOrder: 1,
  },
  {
    name: 'Línea telefónica adicional',
    category: shared_1.AdditionalProductCategory.BUSINESS,
    sortOrder: 2,
  },
];
async function seedAdditionalProducts(queryRunner, tenantId, schemaName) {
  await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);
  for (const product of DEFAULT_PRODUCTS) {
    await queryRunner.query(
      `INSERT INTO additional_products (tenant_id, name, category, sort_order, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, now(), now())
       ON CONFLICT DO NOTHING`,
      [tenantId, product.name, product.category, product.sortOrder],
    );
  }
  console.log(`[SEED] Additional products seeded for tenant ${tenantId} (schema: ${schemaName})`);
}
async function seedAdditionalProductsForAllTenants(dataSource) {
  const tenants = await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );
  for (const tenant of tenants) {
    const baseOpts = dataSource.options;
    const tenantDs = new typeorm_1.DataSource({
      type: 'postgres',
      host: baseOpts.host,
      port: baseOpts.port,
      username: baseOpts.username,
      password: baseOpts.password,
      database: baseOpts.database,
      schema: tenant.schema_name,
      logging: false,
    });
    await tenantDs.initialize();
    const queryRunner = tenantDs.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await seedAdditionalProducts(queryRunner, tenant.id, tenant.schema_name);
      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`[SEED] Failed to seed additional products for tenant ${tenant.id}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
      if (tenantDs.isInitialized) {
        await tenantDs.destroy();
      }
    }
  }
}
//# sourceMappingURL=additional-products.seed.js.map

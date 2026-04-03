import { DataSource } from 'typeorm';
import { AdditionalProductCategory } from '@iwana/shared';

const DEFAULT_PRODUCTS = [
  { name: 'TvBox', category: AdditionalProductCategory.ENTERTAINMENT, sortOrder: 1 },
  {
    name: 'Decodificador adicional',
    category: AdditionalProductCategory.ENTERTAINMENT,
    sortOrder: 2,
  },
  { name: 'Cámaras de seguridad', category: AdditionalProductCategory.SECURITY, sortOrder: 1 },
  { name: 'DVR / NVR', category: AdditionalProductCategory.SECURITY, sortOrder: 2 },
  { name: 'Alarma residencial', category: AdditionalProductCategory.SECURITY, sortOrder: 3 },
  { name: 'Router WiFi mesh', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 1 },
  { name: 'Extensor de cobertura', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 2 },
  { name: 'IP estática', category: AdditionalProductCategory.CONNECTIVITY, sortOrder: 3 },
  { name: 'Soporte prioritario', category: AdditionalProductCategory.BUSINESS, sortOrder: 1 },
  {
    name: 'Línea telefónica adicional',
    category: AdditionalProductCategory.BUSINESS,
    sortOrder: 2,
  },
];

export async function seedAdditionalProducts(
  dataSource: DataSource,
  tenantId: string,
): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    for (const product of DEFAULT_PRODUCTS) {
      await queryRunner.query(
        `INSERT INTO additional_products (tenant_id, name, category, sort_order, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, now(), now())
         ON CONFLICT DO NOTHING`,
        [tenantId, product.name, product.category, product.sortOrder],
      );
    }
    await queryRunner.commitTransaction();
    console.log(`[SEED] Additional products seeded for tenant ${tenantId}`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error(`[SEED] Failed to seed additional products for tenant ${tenantId}:`, error);
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function seedAdditionalProductsForAllTenants(dataSource: DataSource): Promise<void> {
  const tenants = await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  );

  for (const tenant of tenants) {
    const tenantDs = new DataSource({
      type: 'postgres',
      host: (dataSource.options as { host: string }).host,
      port: (dataSource.options as { port: number }).port,
      username: (dataSource.options as { username: string }).username,
      password: (dataSource.options as { password: string }).password,
      database: (dataSource.options as { database: string }).database,
      schema: tenant.schema_name,
    });

    try {
      await tenantDs.initialize();
      await seedAdditionalProducts(tenantDs, tenant.id);
    } finally {
      if (tenantDs.isInitialized) {
        await tenantDs.destroy();
      }
    }
  }
}

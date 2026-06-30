import { DataSource, QueryRunner } from 'typeorm';
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
  queryRunner: QueryRunner,
  tenantId: string,
  schemaName: string,
): Promise<void> {
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

interface PostgresOptions {
  type: string;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export async function seedAdditionalProductsForAllTenants(dataSource: DataSource): Promise<void> {
  const tenants = (await dataSource.query(
    `SELECT id, schema_name FROM public.tenants WHERE status = 'ACTIVE'`,
  )) as Array<{ id: string; schema_name: string }>;

  for (const tenant of tenants) {
    const baseOpts = dataSource.options as PostgresOptions;
    const tenantDs = new DataSource({
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

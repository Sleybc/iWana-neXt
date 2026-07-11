import { DataSource, QueryRunner } from 'typeorm';
import { ProductCategory } from '@iwana/shared';

const DEFAULT_PRODUCTS: Array<{ name: string; category: ProductCategory }> = [
  { name: 'TvBox', category: ProductCategory.ENTERTAINMENT },
  { name: 'Decodificador adicional', category: ProductCategory.ENTERTAINMENT },
  { name: 'Cámaras de seguridad', category: ProductCategory.SECURITY },
  { name: 'DVR / NVR', category: ProductCategory.SECURITY },
  { name: 'Alarma residencial', category: ProductCategory.SECURITY },
  { name: 'Router WiFi mesh', category: ProductCategory.CONNECTIVITY },
  { name: 'Extensor de cobertura', category: ProductCategory.CONNECTIVITY },
  { name: 'IP estática', category: ProductCategory.CONNECTIVITY },
  { name: 'Soporte prioritario', category: ProductCategory.BUSINESS },
  { name: 'Línea telefónica adicional', category: ProductCategory.BUSINESS },
];

export async function seedAdditionalProducts(
  queryRunner: QueryRunner,
  tenantId: string,
  schemaName: string,
): Promise<void> {
  await queryRunner.query(`SET LOCAL search_path TO "${schemaName}"`);

  for (const product of DEFAULT_PRODUCTS) {
    const existing = (await queryRunner.query(
      `
      SELECT ci.id
      FROM catalog_items ci
      INNER JOIN product_details pd ON pd.item_id = ci.id
      WHERE ci.tenant_id = $1
        AND ci.type = 'PRODUCT'
        AND ci.name = $2
        AND ci.deleted_at IS NULL
      LIMIT 1
      `,
      [tenantId, product.name],
    )) as Array<{ id: string }>;

    if (existing.length > 0) {
      continue;
    }

    const inserted = (await queryRunner.query(
      `
      INSERT INTO catalog_items (
        tenant_id, type, name, description, retention_applicable, is_active, created_at, updated_at
      )
      VALUES ($1, 'PRODUCT', $2, NULL, false, true, now(), now())
      RETURNING id
      `,
      [tenantId, product.name],
    )) as Array<{ id: string }>;

    const itemId = inserted[0]?.id;
    if (!itemId) {
      continue;
    }

    await queryRunner.query(
      `
      INSERT INTO product_details (item_id, is_loan, requires_inventory, category)
      VALUES ($1, false, false, $2)
      ON CONFLICT (item_id) DO NOTHING
      `,
      [itemId, product.category],
    );
  }

  console.log(
    `[SEED] Productos adicionales comerciales sembrados para tenant ${tenantId} (schema: ${schemaName})`,
  );
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

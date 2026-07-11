import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 063: elimina la tabla legacy additional_products tras la extracción a MOD06.
 *
 * Los datos fueron copiados a catalog_items + product_details en migración 018.
 * Ref: ADR-028 D5, decisión arquitectónica Comercial vs Inventario 2026-07-11.
 */
export class DropLegacyAdditionalProducts0630000000000 implements MigrationInterface {
  name = 'DropLegacyAdditionalProducts0630000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS additional_products CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS additional_product_category`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE additional_product_category AS ENUM (
          'ENTERTAINMENT',
          'SECURITY',
          'CONNECTIVITY',
          'BUSINESS'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS additional_products (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(100) NOT NULL,
        category additional_product_category NOT NULL DEFAULT 'CONNECTIVITY',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_additional_products PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_additional_products_tenant_active
      ON additional_products (tenant_id, is_active)
    `);
  }
}

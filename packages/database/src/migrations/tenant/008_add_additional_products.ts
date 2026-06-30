import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdditionalProducts1700000000008 implements MigrationInterface {
  name = 'AddAdditionalProducts1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear enum para categorías de productos adicionales
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

    // Crear tabla additional_products
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

    // Crear índice compuesto para queries por tenant y estado
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_additional_products_tenant_active
      ON additional_products (tenant_id, is_active)
    `);

    // Agregar columna a expediente_records para almacenar productos seleccionados
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN IF NOT EXISTS additional_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir columna en expediente_records
    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS additional_product_ids
    `);

    // Eliminar índice
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_additional_products_tenant_active
    `);

    // Eliminar tabla
    await queryRunner.query(`
      DROP TABLE IF EXISTS additional_products
    `);

    // Eliminar enum
    await queryRunner.query(`
      DROP TYPE IF EXISTS additional_product_category
    `);
  }
}

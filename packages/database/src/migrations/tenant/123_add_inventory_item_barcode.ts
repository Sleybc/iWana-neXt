import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 123 — Código de barras del artículo (MOD12 · F4 · PRD §11 delta v1.1).
 *
 * Aditiva y reversible sobre `inventory_items` (patrón 051):
 * - `barcode` VARCHAR(64) nullable.
 * - `barcode_type` enum nullable (`EAN13` | `UPCA` | `CODE128` | `OTHER`).
 * - Índice único PARCIAL `(tenant_id, barcode) WHERE barcode IS NOT NULL`:
 *   la unicidad es POR TENANT y permite que muchos artículos lo dejen vacío.
 *   Nunca global (dos tenants pueden tener el mismo código).
 *
 * No toca datos: ningún artículo existente se invalida (CA-F4-06) y el SKU no
 * cambia de rol, formato ni inmutabilidad (ADR-INV-SKU-COMPUESTO, CA-F4-07).
 * El enum vive en el schema tenant, como el resto de los enums de esta tabla.
 */
export class AddInventoryItemBarcode1230000000000 implements MigrationInterface {
  name = 'AddInventoryItemBarcode1230000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE inventory_barcode_type AS ENUM (
        'EAN13',
        'UPCA',
        'CODE128',
        'OTHER'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE inventory_items
        ADD COLUMN barcode VARCHAR(64),
        ADD COLUMN barcode_type inventory_barcode_type
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_inventory_items_tenant_barcode
        ON inventory_items (tenant_id, barcode)
        WHERE barcode IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_inventory_items_tenant_barcode`);

    await queryRunner.query(`
      ALTER TABLE inventory_items
        DROP COLUMN IF EXISTS barcode_type,
        DROP COLUMN IF EXISTS barcode
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS inventory_barcode_type`);
  }
}

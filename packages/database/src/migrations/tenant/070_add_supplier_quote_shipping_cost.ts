import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 070: gastos de envio en cotizacion de proveedor (cabecera).
 */
export class AddSupplierQuoteShippingCost0700000000000 implements MigrationInterface {
  name = 'AddSupplierQuoteShippingCost0700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        ADD COLUMN shipping_cost NUMERIC(14, 2) NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        DROP COLUMN IF EXISTS shipping_cost
    `);
  }
}

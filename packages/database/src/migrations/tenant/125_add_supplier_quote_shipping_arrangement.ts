import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 125 — Cómo se cubre el envío en la cotización de compra.
 *
 * Tres condiciones operativas:
 * - FREE: flete gratis (shipping_cost = 0).
 * - ON_INVOICE: el proveedor lo cobra en esta cotización (entra al neto).
 * - PAY_CARRIER: se paga al transportador (no entra al neto del proveedor).
 *
 * Backfill: shipping_cost = 0 → FREE; resto → ON_INVOICE.
 */
export class AddSupplierQuoteShippingArrangement1250000000000 implements MigrationInterface {
  name = 'AddSupplierQuoteShippingArrangement1250000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        ADD COLUMN shipping_arrangement VARCHAR(16)
    `);

    await queryRunner.query(`
      UPDATE supplier_quotes
        SET shipping_arrangement = CASE
          WHEN COALESCE(shipping_cost, 0) = 0 THEN 'FREE'
          ELSE 'ON_INVOICE'
        END
    `);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        ALTER COLUMN shipping_arrangement SET NOT NULL,
        ALTER COLUMN shipping_arrangement SET DEFAULT 'ON_INVOICE',
        ADD CONSTRAINT chk_supplier_quotes_shipping_arrangement
          CHECK (shipping_arrangement IN ('FREE', 'ON_INVOICE', 'PAY_CARRIER'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        DROP CONSTRAINT IF EXISTS chk_supplier_quotes_shipping_arrangement,
        DROP COLUMN IF EXISTS shipping_arrangement
    `);
  }
}

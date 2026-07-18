import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 069: lineas de cotizacion de proveedor (precio unitario por linea de solicitud).
 */
export class CreateSupplierQuoteLines0690000000000 implements MigrationInterface {
  name = 'CreateSupplierQuoteLines0690000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE supplier_quote_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        supplier_quote_id UUID NOT NULL,
        purchase_request_line_id UUID NOT NULL,
        quantity NUMERIC(12, 2) NOT NULL,
        unit_cost NUMERIC(14, 2) NOT NULL,
        line_amount NUMERIC(14, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_supplier_quote_lines_quote
          FOREIGN KEY (supplier_quote_id)
          REFERENCES supplier_quotes (id)
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_supplier_quote_lines_quote_pr_line
        ON supplier_quote_lines (supplier_quote_id, purchase_request_line_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quote_lines_tenant_quote
        ON supplier_quote_lines (tenant_id, supplier_quote_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quote_lines_tenant_pr_line
        ON supplier_quote_lines (tenant_id, purchase_request_line_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quote_lines_tenant_pr_line`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quote_lines_tenant_quote`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_supplier_quote_lines_quote_pr_line`);
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_quote_lines`);
  }
}

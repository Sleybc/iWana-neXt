import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 127 — Snapshot fiscal de compra de mostrador (MOD12 · Fase 26).
 *
 * Aditiva y reversible, sin backfill:
 * - Tabla `stock_movement_taxes`: snapshot informativo por movimiento
 *   (UNIQUE movimiento+código, FK CASCADE a `stock_movements`).
 *   `tax_definition_id` es lógico: sin FK física a `tax_definitions`
 *   (boundary Taxation, D5 del contrato Fase 26).
 * - Sin seed, sin triggers, sin columnas en `stock_movements`
 *   (`payableAmount` se deriva en respuesta, D6).
 * - Schema tenant (`search_path` del runner; sin prefijo explícito).
 */
export class AddStockMovementTaxes1270000000000 implements MigrationInterface {
  name = 'AddStockMovementTaxes1270000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE stock_movement_taxes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        stock_movement_id UUID NOT NULL,
        tax_code VARCHAR(32) NOT NULL,
        tax_category VARCHAR(20) NOT NULL,
        effect VARCHAR(10) NOT NULL,
        rate NUMERIC(7, 4) NOT NULL,
        base_amount NUMERIC(14, 2) NOT NULL,
        tax_amount NUMERIC(14, 2) NOT NULL,
        tax_definition_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_stock_movement_taxes_movement
          FOREIGN KEY (stock_movement_id)
          REFERENCES stock_movements (id)
          ON DELETE CASCADE,
        CONSTRAINT chk_stock_movement_taxes_category
          CHECK (tax_category IN ('VAT', 'WITHHOLDING', 'MUNICIPAL', 'STAMP', 'OTHER')),
        CONSTRAINT chk_stock_movement_taxes_effect
          CHECK (effect IN ('ADD', 'WITHHOLD')),
        CONSTRAINT chk_stock_movement_taxes_base_amount_nonneg
          CHECK (base_amount >= 0),
        CONSTRAINT chk_stock_movement_taxes_tax_amount_nonneg
          CHECK (tax_amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_stock_movement_taxes_movement_tax_code
        ON stock_movement_taxes (stock_movement_id, tax_code)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_stock_movement_taxes_tenant_movement
        ON stock_movement_taxes (tenant_id, stock_movement_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_stock_movement_taxes_tenant_movement`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_stock_movement_taxes_movement_tax_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS stock_movement_taxes`);
  }
}

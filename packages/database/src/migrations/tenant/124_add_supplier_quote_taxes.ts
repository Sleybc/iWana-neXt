import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 124 — Snapshot fiscal de cotización de compra (MOD12 · Fase 25).
 *
 * Aditiva y reversible:
 * - `supplier_quotes.payable_amount NUMERIC(14,2) NOT NULL` con backfill
 *   `amount + COALESCE(shipping_cost, 0)`, CHECK >= 0 e índice de consulta.
 * - Tabla `supplier_quote_taxes`: snapshot por cotización (UNIQUE quote+code,
 *   FK CASCADE a `supplier_quotes`). `tax_definition_id` es lógico: sin FK
 *   física a `tax_definitions` (boundary Taxation).
 * - Seed idempotente `RETE_IVA` en `tax_definitions` para tenants ya
 *   provisionados. Placeholder 15 %; requiere verificación con fuente oficial.
 *
 * Sin trigger y sin columnas fijas de IVA en cabecera. Schema tenant
 * (`search_path` del runner; sin prefijo explícito).
 */
export class AddSupplierQuoteTaxes1240000000000 implements MigrationInterface {
  name = 'AddSupplierQuoteTaxes1240000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        ADD COLUMN payable_amount NUMERIC(14, 2)
    `);

    await queryRunner.query(`
      UPDATE supplier_quotes
        SET payable_amount = amount + COALESCE(shipping_cost, 0)
    `);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        ALTER COLUMN payable_amount SET NOT NULL,
        ADD CONSTRAINT chk_supplier_quotes_payable_amount_nonneg
          CHECK (payable_amount >= 0)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quotes_tenant_request_payable
        ON supplier_quotes (tenant_id, purchase_request_id, payable_amount)
    `);

    await queryRunner.query(`
      CREATE TABLE supplier_quote_taxes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        supplier_quote_id UUID NOT NULL,
        tax_code VARCHAR(32) NOT NULL,
        tax_category VARCHAR(20) NOT NULL,
        effect VARCHAR(10) NOT NULL,
        rate NUMERIC(7, 4) NOT NULL,
        base_amount NUMERIC(14, 2) NOT NULL,
        tax_amount NUMERIC(14, 2) NOT NULL,
        tax_definition_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_supplier_quote_taxes_quote
          FOREIGN KEY (supplier_quote_id)
          REFERENCES supplier_quotes (id)
          ON DELETE CASCADE,
        CONSTRAINT chk_supplier_quote_taxes_category
          CHECK (tax_category IN ('VAT', 'WITHHOLDING', 'MUNICIPAL', 'STAMP', 'OTHER')),
        CONSTRAINT chk_supplier_quote_taxes_effect
          CHECK (effect IN ('ADD', 'WITHHOLD')),
        CONSTRAINT chk_supplier_quote_taxes_base_amount_nonneg
          CHECK (base_amount >= 0),
        CONSTRAINT chk_supplier_quote_taxes_tax_amount_nonneg
          CHECK (tax_amount >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_supplier_quote_taxes_quote_tax_code
        ON supplier_quote_taxes (supplier_quote_id, tax_code)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_quote_taxes_tenant_quote
        ON supplier_quote_taxes (tenant_id, supplier_quote_id)
    `);

    await queryRunner.query(`
      INSERT INTO tax_definitions (
        code,
        name,
        category,
        jurisdiction_level,
        municipality_code,
        base_rate,
        treatment,
        context,
        origin,
        is_active,
        notes
      )
      SELECT
        'RETE_IVA',
        'Rete IVA',
        'WITHHOLDING',
        'NATIONAL',
        NULL,
        15,
        'STANDARD',
        'PURCHASE',
        'SYSTEM',
        true,
        'Placeholder 15%. Requiere verificación con fuente oficial.'
      WHERE NOT EXISTS (
        SELECT 1 FROM tax_definitions WHERE code = 'RETE_IVA'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM tax_definitions
      WHERE code = 'RETE_IVA' AND origin = 'SYSTEM'
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quote_taxes_tenant_quote`);
    await queryRunner.query(`DROP INDEX IF EXISTS uq_supplier_quote_taxes_quote_tax_code`);
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_quote_taxes`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_supplier_quotes_tenant_request_payable`);

    await queryRunner.query(`
      ALTER TABLE supplier_quotes
        DROP CONSTRAINT IF EXISTS chk_supplier_quotes_payable_amount_nonneg,
        DROP COLUMN IF EXISTS payable_amount
    `);
  }
}

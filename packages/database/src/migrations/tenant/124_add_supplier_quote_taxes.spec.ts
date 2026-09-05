import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddSupplierQuoteTaxes1240000000000 } from './124_add_supplier_quote_taxes';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './124_add_supplier_quote_taxes.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSupplierQuoteTaxes1240000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSupplierQuoteTaxes1240000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('AddSupplierQuoteTaxes124', () => {
  it('añade payable_amount, lo backfillea y lo deja NOT NULL con CHECK >= 0', async () => {
    const sql = await upSql();

    expect(sql).toContain('ADD COLUMN payable_amount NUMERIC(14, 2)');
    expect(sql).toMatch(/SET payable_amount = amount \+ COALESCE\(shipping_cost, 0\)/);
    expect(sql).toContain('ALTER COLUMN payable_amount SET NOT NULL');
    expect(sql).toContain('CHECK (payable_amount >= 0)');
  });

  it('crea el índice de consulta por tenant, solicitud y neto a pagar', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE INDEX idx_supplier_quotes_tenant_request_payable');
    expect(sql).toMatch(/ON supplier_quotes \(tenant_id, purchase_request_id, payable_amount\)/);
  });

  it('crea supplier_quote_taxes con snapshot, CHECKs y FK CASCADE, sin FK a tax_definitions', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TABLE supplier_quote_taxes');
    expect(sql).toContain('tax_code VARCHAR(32) NOT NULL');
    expect(sql).toContain('tax_category VARCHAR(20) NOT NULL');
    expect(sql).toContain('effect VARCHAR(10) NOT NULL');
    expect(sql).toContain('rate NUMERIC(7, 4) NOT NULL');
    expect(sql).toContain('base_amount NUMERIC(14, 2) NOT NULL');
    expect(sql).toContain('tax_amount NUMERIC(14, 2) NOT NULL');
    expect(sql).toContain('tax_definition_id UUID');
    expect(sql).toContain(
      "CHECK (tax_category IN ('VAT', 'WITHHOLDING', 'MUNICIPAL', 'STAMP', 'OTHER'))",
    );
    expect(sql).toContain("CHECK (effect IN ('ADD', 'WITHHOLD'))");
    expect(sql).toContain('CHECK (base_amount >= 0)');
    expect(sql).toContain('CHECK (tax_amount >= 0)');
    expect(sql).toContain('REFERENCES supplier_quotes (id)');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/REFERENCES\s+tax_definitions/i);
    expect(sql).not.toContain('iva_amount');
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
  });

  it('unicidad por cotización+código e índice por tenant+cotización', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE UNIQUE INDEX uq_supplier_quote_taxes_quote_tax_code');
    expect(sql).toMatch(/ON supplier_quote_taxes \(supplier_quote_id, tax_code\)/);
    expect(sql).toContain('CREATE INDEX idx_supplier_quote_taxes_tenant_quote');
    expect(sql).toMatch(/ON supplier_quote_taxes \(tenant_id, supplier_quote_id\)/);
  });

  it('siembra RETE_IVA de forma idempotente para tenants ya provisionados', async () => {
    const sql = await upSql();

    expect(sql).toContain('INSERT INTO tax_definitions');
    expect(sql).toContain("'RETE_IVA'");
    expect(sql).toContain("'Rete IVA'");
    expect(sql).toContain("'WITHHOLDING'");
    expect(sql).toContain("'NATIONAL'");
    expect(sql).toContain("'STANDARD'");
    expect(sql).toContain("'PURCHASE'");
    expect(sql).toContain("'SYSTEM'");
    expect(sql).toContain("'Placeholder 15%. Requiere verificación con fuente oficial.'");
    expect(sql).toMatch(/WHERE NOT EXISTS \([\s\S]*code = 'RETE_IVA'/);
  });

  it('es reversible: seed, índices de taxes, tabla, índice payable y columna', async () => {
    const down = await downSql();

    expect(down).toContain('DELETE FROM tax_definitions');
    expect(down).toContain("code = 'RETE_IVA' AND origin = 'SYSTEM'");
    expect(down).toContain('DROP INDEX IF EXISTS idx_supplier_quote_taxes_tenant_quote');
    expect(down).toContain('DROP INDEX IF EXISTS uq_supplier_quote_taxes_quote_tax_code');
    expect(down).toContain('DROP TABLE IF EXISTS supplier_quote_taxes');
    expect(down).toContain('DROP INDEX IF EXISTS idx_supplier_quotes_tenant_request_payable');
    expect(down).toContain('DROP CONSTRAINT IF EXISTS chk_supplier_quotes_payable_amount_nonneg');
    expect(down).toContain('DROP COLUMN IF EXISTS payable_amount');

    const seedPos = down.indexOf('DELETE FROM tax_definitions');
    const taxesIndexPos = down.indexOf(
      'DROP INDEX IF EXISTS idx_supplier_quote_taxes_tenant_quote',
    );
    const tablePos = down.indexOf('DROP TABLE IF EXISTS supplier_quote_taxes');
    const payableIndexPos = down.indexOf(
      'DROP INDEX IF EXISTS idx_supplier_quotes_tenant_request_payable',
    );
    const columnPos = down.indexOf('DROP COLUMN IF EXISTS payable_amount');

    expect(seedPos).toBeGreaterThanOrEqual(0);
    expect(seedPos).toBeLessThan(taxesIndexPos);
    expect(taxesIndexPos).toBeLessThan(tablePos);
    expect(tablePos).toBeLessThan(payableIndexPos);
    expect(payableIndexPos).toBeLessThan(columnPos);
  });

  it('no importa código de apps/api ni usa synchronize (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
    expect(MIGRATION_SOURCE).not.toContain('synchronize');
  });
});

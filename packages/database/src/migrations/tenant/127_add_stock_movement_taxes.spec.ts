import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddStockMovementTaxes1270000000000 } from './127_add_stock_movement_taxes';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './127_add_stock_movement_taxes.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddStockMovementTaxes1270000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddStockMovementTaxes1270000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('AddStockMovementTaxes127', () => {
  it('crea stock_movement_taxes con snapshot, CHECKs y FK CASCADE, sin FK a tax_definitions', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TABLE stock_movement_taxes');
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
    expect(sql).toContain('REFERENCES stock_movements (id)');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/REFERENCES\s+tax_definitions/i);
    expect(sql).not.toMatch(/ALTER TABLE stock_movements/i);
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
  });

  it('unicidad por movimiento+código e índice por tenant+movimiento', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE UNIQUE INDEX uq_stock_movement_taxes_movement_tax_code');
    expect(sql).toMatch(/ON stock_movement_taxes \(stock_movement_id, tax_code\)/);
    expect(sql).toContain('CREATE INDEX idx_stock_movement_taxes_tenant_movement');
    expect(sql).toMatch(/ON stock_movement_taxes \(tenant_id, stock_movement_id\)/);
  });

  it('es reversible en orden: índices y luego tabla', async () => {
    const down = await downSql();

    expect(down).toContain('DROP INDEX IF EXISTS idx_stock_movement_taxes_tenant_movement');
    expect(down).toContain('DROP INDEX IF EXISTS uq_stock_movement_taxes_movement_tax_code');
    expect(down).toContain('DROP TABLE IF EXISTS stock_movement_taxes');

    const tenantIndexPos = down.indexOf(
      'DROP INDEX IF EXISTS idx_stock_movement_taxes_tenant_movement',
    );
    const uniqueIndexPos = down.indexOf(
      'DROP INDEX IF EXISTS uq_stock_movement_taxes_movement_tax_code',
    );
    const tablePos = down.indexOf('DROP TABLE IF EXISTS stock_movement_taxes');

    expect(tenantIndexPos).toBeGreaterThanOrEqual(0);
    expect(tenantIndexPos).toBeLessThan(uniqueIndexPos);
    expect(uniqueIndexPos).toBeLessThan(tablePos);
  });

  it('no importa código de apps/api ni usa synchronize (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
    expect(MIGRATION_SOURCE).not.toContain('synchronize');
  });
});

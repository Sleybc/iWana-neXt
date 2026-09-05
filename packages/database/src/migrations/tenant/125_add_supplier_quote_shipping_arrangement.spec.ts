import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddSupplierQuoteShippingArrangement1250000000000 } from './125_add_supplier_quote_shipping_arrangement';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './125_add_supplier_quote_shipping_arrangement.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSupplierQuoteShippingArrangement1250000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSupplierQuoteShippingArrangement1250000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('AddSupplierQuoteShippingArrangement125', () => {
  it('añade shipping_arrangement, backfill y check de las tres condiciones', async () => {
    const sql = await upSql();

    expect(sql).toContain('ADD COLUMN shipping_arrangement VARCHAR(16)');
    expect(sql).toContain("'FREE'");
    expect(sql).toContain("'ON_INVOICE'");
    expect(sql).toContain("'PAY_CARRIER'");
    expect(sql).toContain('chk_supplier_quotes_shipping_arrangement');
  });

  it('es reversible', async () => {
    const down = await downSql();

    expect(down).toContain('DROP CONSTRAINT IF EXISTS chk_supplier_quotes_shipping_arrangement');
    expect(down).toContain('DROP COLUMN IF EXISTS shipping_arrangement');
  });

  it('no importa código de apps/api (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
  });
});

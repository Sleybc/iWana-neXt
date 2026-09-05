import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddInventoryItemBarcode1230000000000 } from './123_add_inventory_item_barcode';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './123_add_inventory_item_barcode.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddInventoryItemBarcode1230000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddInventoryItemBarcode1230000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('AddInventoryItemBarcode123', () => {
  it('crea el enum de formato con exactamente los cuatro valores del PRD §11.4', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TYPE inventory_barcode_type AS ENUM');
    expect(sql).toContain("'EAN13'");
    expect(sql).toContain("'UPCA'");
    expect(sql).toContain("'CODE128'");
    expect(sql).toContain("'OTHER'");
    expect(sql.match(/inventory_barcode_type AS ENUM \(([^)]*)\)/)?.[1]?.split(',')).toHaveLength(
      4,
    );
  });

  it('añade barcode VARCHAR(64) nullable y barcode_type nullable, sin tocar datos', async () => {
    const sql = await upSql();

    expect(sql).toContain('ADD COLUMN barcode VARCHAR(64)');
    expect(sql).toContain('ADD COLUMN barcode_type inventory_barcode_type');
    expect(sql).not.toMatch(/UPDATE\s+\w+/i);
    expect(sql).not.toContain('NOT NULL DEFAULT');
    expect(sql).not.toContain('sku');
  });

  it('el índice de unicidad es único, POR TENANT y PARCIAL (CA-F4-09, restricción 3)', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE UNIQUE INDEX uq_inventory_items_tenant_barcode');
    expect(sql).toMatch(/ON inventory_items \(tenant_id, barcode\)/);
    expect(sql).toMatch(/WHERE barcode IS NOT NULL/);
  });

  it('es reversible sin pérdida: down revierte índice, columnas y enum (CA-F4-10)', async () => {
    const down = await downSql();

    expect(down).toContain('DROP INDEX IF EXISTS uq_inventory_items_tenant_barcode');
    expect(down).toContain('DROP COLUMN IF EXISTS barcode_type');
    expect(down).toContain('DROP COLUMN IF EXISTS barcode');
    expect(down).toContain('DROP TYPE IF EXISTS inventory_barcode_type');

    // Orden: el índice se elimina antes de las columnas que soporta, y las
    // columnas antes del tipo que usan.
    const indexPos = down.indexOf('DROP INDEX');
    const columnsPos = down.indexOf('DROP COLUMN');
    const typePos = down.indexOf('DROP TYPE');
    expect(indexPos).toBeLessThan(columnsPos);
    expect(columnsPos).toBeLessThan(typePos);
  });

  it('el down no borra datos de otras columnas: solo lo añadido por el up', async () => {
    const down = await downSql();

    expect(down).toMatch(/^[\s\S]*DROP INDEX[\s\S]*ALTER TABLE inventory_items[\s\S]*DROP TYPE/);
    expect(down).not.toContain('DELETE FROM');
    expect(down).not.toContain('DROP TABLE');
  });

  it('no importa código de apps/api (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});

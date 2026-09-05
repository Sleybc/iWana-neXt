import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NormalizeUomToCanonicalCatalog12200000000000 } from './122_normalize_uom_to_canonical_catalog';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './122_normalize_uom_to_canonical_catalog.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new NormalizeUomToCanonicalCatalog12200000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new NormalizeUomToCanonicalCatalog12200000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('NormalizeUomToCanonicalCatalog122', () => {
  it('mapea solo por equivalencia exacta al catálogo canónico', async () => {
    const sql = await upSql();

    for (const literal of [
      "'unidad'",
      "'UND'",
      "'und'",
      "'UNIDAD'",
      "'metro'",
      "'m'",
      "'M'",
      "'METRO'",
      "'caja'",
      "'CAJA'",
    ]) {
      expect(sql).toContain(literal);
    }
    expect(sql).toContain("THEN 'UNIT'");
    expect(sql).toContain("THEN 'METER'");
    expect(sql).toContain("THEN 'BOX'");
    expect(sql).toContain('UPDATE inventory_items');
  });

  it('prohíbe la normalización difusa: sin LOWER, TRIM, ILIKE ni similitud', async () => {
    const sql = await upSql();

    expect(sql).not.toMatch(/lower\s*\(/i);
    expect(sql).not.toMatch(/trim\s*\(/i);
    expect(sql).not.toMatch(/btrim\s*\(/i);
    expect(sql).not.toMatch(/ilike/i);
    expect(sql).not.toMatch(/similar\s+to/i);
    expect(sql).not.toMatch(/levenshtein|similarity\(/i);
  });

  it('se detiene y reporta ante un valor sin equivalencia exacta (CA-F5A-03)', async () => {
    const sql = await upSql();

    // Parada en ambas columnas, con valor, conteo y schema en el reporte.
    expect(sql).toContain('unit_of_measure NOT IN');
    expect(sql).toContain('purchase_unit_of_measure NOT IN');
    expect(sql).toContain('RAISE EXCEPTION');
    expect(sql).toContain('se detiene');
    expect(sql).toContain('offending_value');
    expect(sql).toContain('offending_count');
  });

  it('no recalcula saldos ni movimientos y no aplica el factor (CA-F5A-04, F5b fuera)', async () => {
    const sql = await upSql();

    expect(sql).not.toContain('stock_movements');
    expect(sql).not.toContain('stock_balances');
    expect(sql).not.toContain('purchase_to_base_uom_factor');
    expect(sql).not.toMatch(/UPDATE\s+(?!inventory_items)\w+/i);
  });

  it('es reversible sin pérdida: provenance exacta y down que restaura (CA-F5A-05)', async () => {
    const up = await upSql();
    const down = await downSql();

    expect(up).toContain('uom_normalization_122_provenance');
    expect(up).toContain('previous_unit_of_measure');
    expect(up).toContain('previous_purchase_unit_of_measure');
    expect(up).toContain('ON CONFLICT (item_id) DO NOTHING');

    expect(down).toContain('previous_unit_of_measure');
    expect(down).toContain('previous_purchase_unit_of_measure');
    expect(down).toContain('DROP TABLE IF EXISTS uom_normalization_122_provenance');
  });

  it('corre por tenant: valida schema, fija search_path y filtra por tenant canónico', async () => {
    const up = await upSql();
    const down = await downSql();

    for (const sql of [up, down]) {
      expect(sql).toContain('current_schema()');
      expect(sql).toContain("tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$'");
      expect(sql).toContain('canonical_tenant_id');
    }
    expect(up).not.toContain('tenant_iwana');
    expect(up).not.toContain('tenant_alpha');
  });

  it('es idempotente: los códigos ya canónicos se aceptan por identidad', async () => {
    const sql = await upSql();

    // Los canónicos están en el conjunto permitido (no disparan la parada),
    // pero ningún CASE los reescribe: el ELSE los deja intactos.
    expect(sql).toContain("'UNIT', 'METER', 'BOX'");
    expect(sql).toContain('ELSE unit_of_measure');
    expect(sql).toContain('ELSE purchase_unit_of_measure');
  });

  it('deja intactas las filas con purchase_unit_of_measure NULL (sin unidad de compra)', async () => {
    const sql = await upSql();

    // La parada 2 excluye los NULL: no disparan la detención.
    expect(sql).toContain('purchase_unit_of_measure IS NOT NULL');
    // El CASE conserva el valor sin equivalencia: NULL permanece NULL.
    expect(sql).toContain('ELSE purchase_unit_of_measure');
  });

  it('la re-ejecución sobre valores ya canónicos es no-op', async () => {
    const sql = await upSql();

    // Los canónicos están en el conjunto permitido (no disparan la parada),
    // ningún WHEN los reescribe (el ELSE los deja intactos) y la
    // provenance no duplica filas ya registradas.
    expect(sql).toContain("'UNIT', 'METER', 'BOX'");
    expect(sql).toContain('ELSE unit_of_measure');
    expect(sql).toContain('ELSE purchase_unit_of_measure');
    expect(sql).toContain('ON CONFLICT (item_id) DO NOTHING');
  });

  it('no importa código de apps/api (boundary)', async () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
  });
});

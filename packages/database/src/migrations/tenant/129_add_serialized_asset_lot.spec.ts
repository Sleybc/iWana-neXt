import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AddSerializedAssetLot1290000000000 } from './129_add_serialized_asset_lot';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './129_add_serialized_asset_lot.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSerializedAssetLot1290000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AddSerializedAssetLot1290000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('AddSerializedAssetLot129', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    // El backfill informa por consola; sin silenciarlo el spec ensucia la salida.
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('añade lot_id UUID nullable, nunca NOT NULL ni con default', async () => {
    const sql = await upSql();

    expect(sql).toContain('ALTER TABLE serialized_assets');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS lot_id UUID');
    expect(sql).not.toMatch(/lot_id\s+UUID\s+NOT NULL/i);
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS lot_id UUID DEFAULT/i);
  });

  it('declara la FK a stock_lots con guarda por catálogo (no existe ADD CONSTRAINT IF NOT EXISTS)', async () => {
    const sql = await upSql();

    expect(sql).toContain('fk_serialized_assets_lot');
    expect(sql).toContain('FOREIGN KEY (lot_id)');
    expect(sql).toContain('REFERENCES stock_lots (id)');
    expect(sql).toContain("WHERE conname = 'fk_serialized_assets_lot'");
    expect(sql).toContain("AND conrelid = 'serialized_assets'::regclass");
    // Un lote con activos no se borra en silencio: sin ON DELETE CASCADE/SET NULL.
    expect(sql).not.toMatch(/ON DELETE/i);
  });

  it('el índice es PARCIAL por tenant+lote: patrón «seriales de este lote»', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_serialized_assets_tenant_lot');
    expect(sql).toMatch(/ON serialized_assets \(tenant_id, lot_id\)/);
    expect(sql).toMatch(/WHERE lot_id IS NOT NULL/);
  });

  it('backfillea desde el movimiento de RECEPCIÓN más antiguo del kardex', async () => {
    const sql = await upSql();

    expect(sql).toContain('UPDATE serialized_assets sa');
    expect(sql).toContain('SET lot_id = origen.lot_id');
    expect(sql).toContain('DISTINCT ON (sml.serialized_asset_id)');
    expect(sql).toContain('FROM stock_movement_lines sml');
    expect(sql).toContain('JOIN stock_movements sm ON sm.id = sml.movement_id');
    expect(sql).toContain("sm.origin IN ('PURCHASE_RECEIPT', 'COUNTER_PURCHASE')");
    expect(sql).toContain('sm.is_reversal = false');
    // El «más antiguo» es literalmente el orden ascendente por fecha del movimiento.
    expect(sql).toMatch(/ORDER BY sml\.serialized_asset_id,\s*sm\.created_at ASC/);
  });

  it('el backfill no inventa lotes: exige lot_id en el kardex y solo toca activos sin lote', async () => {
    const sql = await upSql();

    expect(sql).toContain('AND sml.lot_id IS NOT NULL');
    expect(sql).toContain('AND sa.lot_id IS NULL');
    // Idempotente y acotado por tenant: nunca pisa un lote ya asignado ni cruza tenants.
    expect(sql).toContain('AND sa.tenant_id = origen.tenant_id');
    expect(sql).not.toMatch(/COALESCE\(\s*origen\.lot_id/i);
    expect(sql).not.toMatch(/gen_random_uuid\(\)/i);
  });

  it('el backfill informa conteos sin PII y no borra nada', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined) // ALTER TABLE ADD COLUMN
      .mockResolvedValueOnce(undefined) // DO $$ FK
      .mockResolvedValueOnce(undefined) // CREATE INDEX
      .mockResolvedValueOnce([{ total: '7' }]) // activos sin lote
      .mockResolvedValueOnce([{ total: '5' }]) // recuperables desde el kardex
      .mockResolvedValue(undefined); // UPDATE

    await new AddSerializedAssetLot1290000000000().up({ query } as never);

    const mensaje = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(mensaje).toContain('[129]');
    expect(mensaje).toContain('7 activo(s) sin lote');
    expect(mensaje).toContain('5 recuperable(s)');

    const sql = query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
    expect(sql).not.toMatch(/DELETE FROM/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
  });

  it('es reversible en orden: índice, FK y luego columna', async () => {
    const down = await downSql();

    expect(down).toContain('DROP INDEX IF EXISTS idx_serialized_assets_tenant_lot');
    expect(down).toContain('DROP CONSTRAINT IF EXISTS fk_serialized_assets_lot');
    expect(down).toContain('DROP COLUMN IF EXISTS lot_id');

    const indexPos = down.indexOf('DROP INDEX IF EXISTS idx_serialized_assets_tenant_lot');
    const fkPos = down.indexOf('DROP CONSTRAINT IF EXISTS fk_serialized_assets_lot');
    const columnPos = down.indexOf('DROP COLUMN IF EXISTS lot_id');

    expect(indexPos).toBeGreaterThanOrEqual(0);
    expect(indexPos).toBeLessThan(fkPos);
    expect(fkPos).toBeLessThan(columnPos);
  });

  it('el down solo revierte lo que el up añadió: no toca otras columnas ni datos', async () => {
    const down = await downSql();

    expect(down).not.toMatch(/DELETE FROM/i);
    expect(down).not.toMatch(/DROP TABLE/i);
    expect(down).not.toMatch(/UPDATE\s+serialized_assets/i);
    expect(down).not.toContain('serial_number');
  });

  it('no importa código de apps/api ni usa synchronize (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]\.\.\/\.\.\/\.\.\/apps\/api/);
    expect(MIGRATION_SOURCE).not.toContain('synchronize');
  });

  it('no hardcodea schema de tenant: el DDL va sin calificar (search_path del runner)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/tenant_\w+\.serialized_assets/);
    expect(MIGRATION_SOURCE).not.toMatch(/public\.serialized_assets/);
  });
});

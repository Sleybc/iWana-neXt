import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

import { SerializedAsset } from './serialized-asset.entity';

/**
 * Alineación entidad ↔ DDL de `lot_id` (migración 129).
 *
 * El repo no usa namingStrategy global: una columna camelCase sin `name` snake
 * explícito genera `"lotId"` y cualquier lectura/escritura muere con 42703
 * contra el DDL (mismo hallazgo C1 que dejó comprometido
 * `stock-issue-line-serial.entity.spec.ts`).
 *
 * El índice se comprueba PARCIAL además de compuesto: es el patrón de consulta
 * declarado (seriales de un lote) y la forma que la migración crea.
 */
const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, '..', 'migrations', 'tenant', '129_add_serialized_asset_lot.ts'),
  'utf8',
);

describe('SerializedAsset — lote de origen (129)', () => {
  it('mapea lotId a la columna snake "lot_id", uuid y nullable', () => {
    const columna = getMetadataArgsStorage().columns.find(
      (arg) => arg.target === SerializedAsset && arg.propertyName === 'lotId',
    );

    expect(columna).toBeDefined();
    expect(columna?.options.name).toBe('lot_id');
    expect(columna?.options.type).toBe('uuid');
    expect(columna?.options.nullable).toBe(true);
  });

  it('declara el índice parcial tenant+lote que crea la migración', () => {
    const indice = getMetadataArgsStorage().indices.find(
      (arg) => arg.target === SerializedAsset && arg.name === 'idx_serialized_assets_tenant_lot',
    );

    expect(indice).toBeDefined();
    expect(indice?.columns).toEqual(['tenantId', 'lotId']);
    expect(indice?.where).toContain('lot_id');
    expect(indice?.where).toContain('IS NOT NULL');
    expect(indice?.unique).toBeFalsy();
  });

  it('el DDL de la migración 129 declara la misma columna e índice', () => {
    expect(MIGRATION_SOURCE).toContain('ADD COLUMN IF NOT EXISTS lot_id UUID');
    expect(MIGRATION_SOURCE).toContain('idx_serialized_assets_tenant_lot');
    expect(MIGRATION_SOURCE).toContain('ON serialized_assets (tenant_id, lot_id)');
  });
});

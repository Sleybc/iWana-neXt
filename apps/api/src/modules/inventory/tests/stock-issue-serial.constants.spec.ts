import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { InventoryTrackingMode, SerializedAssetStatus, StockIssueStatus } from '@iwana/shared';
import {
  SERIAL_COMMIT_TERMINAL_STATUSES,
  SERIAL_DISPATCHABLE_STATUSES,
  SERIALIZED_TRACKING_MODES,
} from '../services/stock-issue-serial.constants';

const TENANT_MIGRATIONS_DIR = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  'packages',
  'database',
  'src',
  'migrations',
  'tenant',
);

function readMigration126(): string {
  const file = readdirSync(TENANT_MIGRATIONS_DIR).find(
    (name) => /^126_.*\.ts$/.test(name) && !name.endsWith('.spec.ts'),
  );
  if (!file) {
    throw new Error('No se encontró la migración 126 en packages/database.');
  }
  return readFileSync(resolve(TENANT_MIGRATIONS_DIR, file), 'utf8');
}

/**
 * Centralización y paridad (MOD12 S2.1 · B3): los tres conjuntos viven en un
 * solo archivo y el predicado SQL de la migración 126 dice lo mismo que el
 * enum TS. Si alguien agrega un estado terminal en un lado y no en el otro,
 * este spec lo denuncia.
 */
describe('stock-issue-serial.constants (centralización + paridad)', () => {
  it('modos serializados: SERIALIZED y FIXED_ASSET', () => {
    expect([...SERIALIZED_TRACKING_MODES].sort()).toEqual(
      [InventoryTrackingMode.SERIALIZED, InventoryTrackingMode.FIXED_ASSET].sort(),
    );
  });

  it('despachables: AVAILABLE y AVAILABLE_REFURBISHED (ex PICKABLE_SERIAL_STATUSES)', () => {
    expect(SERIAL_DISPATCHABLE_STATUSES).toEqual([
      SerializedAssetStatus.AVAILABLE,
      SerializedAssetStatus.AVAILABLE_REFURBISHED,
    ]);
  });

  it('terminales en orden canónico CANCELLED, DISPATCHED, RECEIVED', () => {
    expect(SERIAL_COMMIT_TERMINAL_STATUSES).toEqual([
      StockIssueStatus.CANCELLED,
      StockIssueStatus.DISPATCHED,
      StockIssueStatus.RECEIVED,
    ]);
  });

  it('paridad TS↔SQL: el predicado de la 126 contiene exactamente los terminales', () => {
    const source = readMigration126();
    const predicate = source.match(/WHERE issue_status NOT IN \(([^)]+)\)/);

    expect(predicate?.[1]).toBeDefined();
    const literals = (predicate?.[1] ?? '')
      .split(',')
      .map((literal) => literal.trim().replace(/^'|'$/g, ''))
      .sort();

    expect(literals).toEqual([...SERIAL_COMMIT_TERMINAL_STATUSES].sort());
  });
});

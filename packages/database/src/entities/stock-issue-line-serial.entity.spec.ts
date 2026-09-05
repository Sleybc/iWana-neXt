import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

import { StockIssueLineSerial } from './stock-issue-line-serial.entity';

/**
 * Alineación entidad ↔ DDL (MOD12 S2 · hallazgo C1 de la auditoría S2-backend).
 *
 * La entidad no usa namingStrategy global (no existe en el repo): cada columna
 * camelCase debe declarar su `name` snake explícito o TypeORM genera la columna
 * camel (`"issueStatus"`) y cualquier lectura/escritura muere con 42703 contra
 * el DDL de la migración 126 (`issue_status`). Reproducido empíricamente contra
 * la DB local antes del fix (FIND y SAVE fallaban con
 * `column "issueStatus" does not exist`, código 42703).
 *
 * `createdAt`/`updatedAt` ya traían `name` explícito; este spec los deja
 * comprometidos para que nadie los retire en silencio.
 */
const EXPECTED_COLUMNS: ReadonlyArray<{ property: string; ddl: string }> = [
  { property: 'tenantId', ddl: 'tenant_id' },
  { property: 'lineId', ddl: 'line_id' },
  { property: 'issueId', ddl: 'issue_id' },
  { property: 'issueStatus', ddl: 'issue_status' },
  { property: 'serializedAssetId', ddl: 'serialized_asset_id' },
  { property: 'createdAt', ddl: 'created_at' },
  { property: 'updatedAt', ddl: 'updated_at' },
];

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, '..', 'migrations', 'tenant', '126_create_stock_issue_line_serials.ts'),
  'utf8',
);

describe('StockIssueLineSerial — alineación entidad ↔ DDL (C1)', () => {
  it('mapea a la tabla stock_issue_line_serials', () => {
    const table = getMetadataArgsStorage().tables.find(
      (arg) => arg.target === StockIssueLineSerial,
    );

    expect(table).toBeDefined();
    expect(table?.name).toBe('stock_issue_line_serials');
  });

  it.each(EXPECTED_COLUMNS)(
    'mapea $property a la columna snake "$ddl" del DDL',
    ({ property, ddl }) => {
      const columna = getMetadataArgsStorage().columns.find(
        (arg) => arg.target === StockIssueLineSerial && arg.propertyName === property,
      );

      expect(columna).toBeDefined();
      expect(columna?.options.name).toBe(ddl);
    },
  );

  it('el DDL de la migración 126 declara cada columna snake mapeada', () => {
    for (const { ddl } of EXPECTED_COLUMNS) {
      expect(MIGRATION_SOURCE).toContain(ddl);
    }
  });
});

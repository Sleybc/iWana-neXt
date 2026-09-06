import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateStockIssueLineSerials1260000000000 } from './126_create_stock_issue_line_serials';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './126_create_stock_issue_line_serials.ts'),
  'utf8',
);

interface MockRunner {
  query: jest.Mock;
  hasTable: jest.Mock;
}

function mockRunner(
  routes: Array<{ match: string | RegExp; rows: unknown }> = [],
  defaultRows: unknown = undefined,
): MockRunner {
  const query = jest.fn().mockImplementation(async (sql: string) => {
    for (const route of routes) {
      const hits =
        typeof route.match === 'string' ? sql.includes(route.match) : route.match.test(sql);
      if (hits) {
        return route.rows;
      }
    }
    return defaultRows;
  });
  return { query, hasTable: jest.fn().mockResolvedValue(true) };
}

function count(value: number): Array<{ total: string }> {
  return [{ total: String(value) }];
}

async function upSql(runner?: MockRunner): Promise<string> {
  const mock = runner ?? mockRunner();
  await new CreateStockIssueLineSerials1260000000000().up({
    query: mock.query,
    hasTable: mock.hasTable,
  } as never);
  return mock.query.mock.calls.map((call: unknown[]) => String(call[0])).join('\n');
}

async function downSql(hasTable: boolean): Promise<{ sql: string; runner: MockRunner }> {
  const runner = mockRunner();
  runner.hasTable.mockResolvedValue(hasTable);
  await new CreateStockIssueLineSerials1260000000000().down({
    query: runner.query,
    hasTable: runner.hasTable,
  } as never);
  return {
    sql: runner.query.mock.calls.map((call: unknown[]) => String(call[0])).join('\n'),
    runner,
  };
}

describe('CreateStockIssueLineSerials126 (S2.1 · B1)', () => {
  it('crea la tabla hija con espejo tipado, FKs CASCADE/RESTRICT e índices', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS stock_issue_line_serials');
    // Espejo tipado con el enum existente (creado por 057), no varchar.
    expect(sql).toContain('issue_status stock_issue_status NOT NULL');
    // Delete + reinsert del borrador arrastra las filas hijas.
    expect(sql).toMatch(
      /FOREIGN KEY \(line_id\)[\s\S]*?REFERENCES stock_issue_lines \(id\)[\s\S]*?ON DELETE CASCADE/,
    );
    // Un borrado de cabecera no libera seriales en silencio (AI-DATA-ENG).
    expect(sql).toMatch(
      /FOREIGN KEY \(issue_id\)[\s\S]*?REFERENCES stock_issues \(id\)[\s\S]*?ON DELETE RESTRICT/,
    );
    expect(sql).toContain('idx_stock_issue_line_serials_line');
  });

  it('todo el DDL es IF NOT EXISTS (up re-ejecutable)', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS stock_issue_line_serials');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_stock_issue_line_serials_line');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_stock_issue_line_serials_issue');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_issue_line_serials_active_asset',
    );
  });

  it('crea el índice (tenant_id, issue_id) para la lectura y la espejo por salida', async () => {
    const sql = await upSql();

    expect(sql).toMatch(/idx_stock_issue_line_serials_issue[\s\S]*?\(tenant_id, issue_id\)/);
  });

  it('crea el índice único parcial con predicado sobre la columna espejo propia', async () => {
    const sql = await upSql();

    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_issue_line_serials_active_asset',
    );
    expect(sql).toContain('ON stock_issue_line_serials (tenant_id, serialized_asset_id)');
    expect(sql).toContain("WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')");
  });

  it('hace el backfill del singular heredando created_at/updated_at, idempotente', async () => {
    const sql = await upSql();

    expect(sql).toContain('INSERT INTO stock_issue_line_serials');
    expect(sql).toContain('FROM stock_issue_lines l');
    expect(sql).toContain('JOIN stock_issues i ON i.id = l.issue_id');
    expect(sql).toContain('WHERE l.serialized_asset_id IS NOT NULL');
    expect(sql).toContain('i.status');
    // La hija hereda las marcas de la línea, no NOW().
    expect(sql).toContain('l.created_at, l.updated_at');
    // Idempotencia: NOT EXISTS por (línea, serial) + ON CONFLICT DO NOTHING.
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });

  it('la vía simple del backfill no pagina (un solo INSERT sin LIMIT)', async () => {
    const runner = mockRunner();
    await upSql(runner);

    const inserts = runner.query.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .filter((sql) => sql.includes('INSERT INTO stock_issue_line_serials'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).not.toContain('LIMIT');
  });

  it('pre-vuelo 0a aborta con conteo ante líneas con serial huérfanas', async () => {
    const runner = mockRunner([
      { match: 'NOT EXISTS (SELECT 1 FROM stock_issues i WHERE', rows: count(2) },
    ]);

    await expect(
      new CreateStockIssueLineSerials1260000000000().up({
        query: runner.query,
        hasTable: runner.hasTable,
      } as never),
    ).rejects.toThrow(/\[126 pre-vuelo 0a\].*2/);
  });

  it('pre-vuelo 0b aborta con conteo ante mismatch de tenant línea↔cabecera', async () => {
    const runner = mockRunner([{ match: 'l.tenant_id <> i.tenant_id', rows: count(1) }]);

    await expect(
      new CreateStockIssueLineSerials1260000000000().up({
        query: runner.query,
        hasTable: runner.hasTable,
      } as never),
    ).rejects.toThrow(/\[126 pre-vuelo 0b\].*1/);
  });

  it('pre-vuelo 0c aborta con conteo ante colisiones activas del mismo serial', async () => {
    const runner = mockRunner([{ match: 'colisiones', rows: count(3) }]);

    await expect(
      new CreateStockIssueLineSerials1260000000000().up({
        query: runner.query,
        hasTable: runner.hasTable,
      } as never),
    ).rejects.toThrow(/\[126 pre-vuelo 0c\].*3/);
  });

  it('post-vuelo cobertura aborta con conteo si falta réplica en la hija', async () => {
    const runner = mockRunner();
    runner.query.mockImplementation(async (sql: string) => {
      // Solo la sonda de cobertura combina origen singular con la hija;
      // el pre-vuelo (0a/0b/0c) y el INSERT del backfill devuelven 0/vacío.
      if (
        sql.includes('FROM stock_issue_lines l') &&
        sql.includes('stock_issue_line_serials s') &&
        !sql.includes('INSERT INTO')
      ) {
        return count(4);
      }
      return undefined;
    });

    await expect(
      new CreateStockIssueLineSerials1260000000000().up({
        query: runner.query,
        hasTable: runner.hasTable,
      } as never),
    ).rejects.toThrow(/\[126 post-vuelo cobertura\].*4/);
  });

  it('post-vuelo espejo aborta con conteo ante divergentes', async () => {
    const runner = mockRunner([{ match: 's.issue_status <> i.status', rows: count(2) }]);

    await expect(
      new CreateStockIssueLineSerials1260000000000().up({
        query: runner.query,
        hasTable: runner.hasTable,
      } as never),
    ).rejects.toThrow(/\[126 post-vuelo espejo\].*2/);
  });

  it('backfill por rangos cuando un tenant supera 5.000 singulares', async () => {
    const runner = mockRunner([
      { match: 'GROUP BY tenant_id', rows: [{ tenantId: 'tenant-gordo', total: '6000' }] },
      { match: 'SELECT l.id AS id', rows: [] },
    ]);
    await upSql(runner);

    const statements = runner.query.mock.calls.map((call: unknown[]) => String(call[0]));
    // La sonda keyset corre con el cursor inicial nulo.
    expect(
      statements.some((sql) => sql.includes('SELECT l.id AS id') && sql.includes('$1::uuid')),
    ).toBe(true);
    // La vía simple (INSERT sin parámetros) no corre en modo rangos.
    expect(
      statements.some(
        (sql, index) =>
          sql.includes('INSERT INTO stock_issue_line_serials') &&
          (runner.query.mock.calls[index] as unknown[]).length === 1,
      ),
    ).toBe(false);
  });

  it('down es LOSSY documentado con respaldo _backup_126 antes de soltar', async () => {
    const { sql } = await downSql(true);

    expect(sql).toContain('stock_issue_line_serials_backup_126');
    expect(sql).toContain('DROP TABLE IF EXISTS stock_issue_line_serials');
    expect(MIGRATION_SOURCE).toContain('LOSSY');
  });

  it('down no toca nada si la tabla no existe', async () => {
    const { sql, runner } = await downSql(false);

    expect(runner.hasTable).toHaveBeenCalledWith('stock_issue_line_serials');
    expect(sql).toBe('');
  });

  it('declara H8 en el header: sin FK hacia serialized_assets', async () => {
    expect(MIGRATION_SOURCE).toContain('H8');
    expect(MIGRATION_SOURCE).not.toMatch(/REFERENCES serialized_assets/);
  });

  it('no califica schema en el DDL ni importa código de apps/api (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/tenant_\w+\./);
    expect(MIGRATION_SOURCE).not.toMatch(/search_path/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
  });
});

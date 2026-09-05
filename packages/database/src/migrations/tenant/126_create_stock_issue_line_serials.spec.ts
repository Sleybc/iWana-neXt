import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CreateStockIssueLineSerials1260000000000 } from './126_create_stock_issue_line_serials';

const MIGRATION_SOURCE = readFileSync(
  resolve(__dirname, './126_create_stock_issue_line_serials.ts'),
  'utf8',
);

async function upSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new CreateStockIssueLineSerials1260000000000().up({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

async function downSql(): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new CreateStockIssueLineSerials1260000000000().down({ query } as never);
  return query.mock.calls.map((c: unknown[]) => (c as string[])[0]).join('\n');
}

describe('CreateStockIssueLineSerials126', () => {
  it('crea la tabla hija con espejo tipado, FKs CASCADE/RESTRICT e índices', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE TABLE stock_issue_line_serials');
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

  it('crea el índice único parcial con predicado sobre la columna espejo propia', async () => {
    const sql = await upSql();

    expect(sql).toContain('CREATE UNIQUE INDEX uq_stock_issue_line_serials_active_asset');
    expect(sql).toContain('ON stock_issue_line_serials (tenant_id, serialized_asset_id)');
    expect(sql).toContain("WHERE issue_status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')");
  });

  it('hace el backfill del singular: la hija nace autoritativa', async () => {
    const sql = await upSql();

    expect(sql).toContain('INSERT INTO stock_issue_line_serials');
    expect(sql).toContain('FROM stock_issue_lines l');
    expect(sql).toContain('JOIN stock_issues i ON i.id = l.issue_id');
    expect(sql).toContain('WHERE l.serialized_asset_id IS NOT NULL');
    expect(sql).toContain('i.status');
  });

  it('es reversible', async () => {
    const down = await downSql();

    expect(down).toContain('DROP TABLE IF EXISTS stock_issue_line_serials');
  });

  it('no califica schema en el DDL ni importa código de apps/api (boundary)', () => {
    expect(MIGRATION_SOURCE).not.toMatch(/tenant_\w+\./);
    expect(MIGRATION_SOURCE).not.toMatch(/search_path/);
    expect(MIGRATION_SOURCE).not.toMatch(/from ['"]@iwana\/api/);
  });
});

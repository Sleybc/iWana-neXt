import type { QueryRunner } from 'typeorm';
import { AddExecutionOrderTransitionCorrectionOf1330000000000 } from './133_add_execution_order_transition_correction_of';

function mockQueryRunner(expectedSql: string[]): QueryRunner {
  const calls: string[] = [];
  const query = jest.fn(async (sql: string) => {
    calls.push(sql);
    const expectedRaw = expectedSql[calls.length - 1];
    if (expectedRaw === undefined) {
      throw new Error(`Query no esperada (call #${calls.length - 1}): ${sql.substring(0, 120)}`);
    }
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    const expected = expectedRaw.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized.startsWith(expected)) {
      throw new Error(
        `Query #${calls.length - 1} inesperada.\n  esperado: ${expectedRaw}\n  recibido: ${sql.substring(0, 160)}`,
      );
    }
    return [];
  });
  return { query } as unknown as QueryRunner;
}

describe('133 correction_of_id en asientos de transición (adenda B1c)', () => {
  const migration = new AddExecutionOrderTransitionCorrectionOf1330000000000();

  it('up añade la columna nullable sin FK, sin default y sin índice', async () => {
    const qr = mockQueryRunner([
      'ALTER TABLE execution_order_status_transitions ADD COLUMN IF NOT EXISTS correction_of_id UUID',
    ]);

    await migration.up(qr);

    expect((qr.query as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('la columna es nullable y sin default (DDL aditivo seguro sobre historial existente)', async () => {
    const qr = mockQueryRunner([
      'ALTER TABLE execution_order_status_transitions ADD COLUMN IF NOT EXISTS correction_of_id UUID',
    ]);
    await migration.up(qr);
    const sql = ((qr.query as jest.Mock).mock.calls[0] as string[])[0];
    expect(sql).not.toMatch(/NOT NULL/i);
    expect(sql).not.toMatch(/DEFAULT/i);
    expect(sql).not.toMatch(/REFERENCES/i);
  });

  it('down retira la columna (reversible, sin throw incondicional)', async () => {
    const qr = mockQueryRunner([
      'ALTER TABLE execution_order_status_transitions DROP COLUMN IF EXISTS correction_of_id',
    ]);

    await expect(migration.down(qr)).resolves.toBeUndefined();
    expect((qr.query as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('round-trip up → down ejercitado', async () => {
    const qr = mockQueryRunner([
      'ALTER TABLE execution_order_status_transitions ADD COLUMN IF NOT EXISTS correction_of_id UUID',
      'ALTER TABLE execution_order_status_transitions DROP COLUMN IF EXISTS correction_of_id',
    ]);

    await migration.up(qr);
    await migration.down(qr);

    expect((qr.query as jest.Mock).mock.calls).toHaveLength(2);
  });
});

import { AddExecutionOrderEvidenceCapturedAt0960000000000 } from './096_add_execution_order_evidence_captured_at';

describe('AddExecutionOrderEvidenceCapturedAt096', () => {
  it('agrega y revierte captured_at como columna nullable', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    });
    const migration = new AddExecutionOrderEvidenceCapturedAt0960000000000();

    await migration.up({ query } as never);
    await migration.down({ query } as never);

    expect(queries[0]).toContain('ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ');
    expect(queries[0]).not.toContain('NOT NULL');
    expect(queries[2]).toContain('DROP COLUMN IF EXISTS captured_at');
  });
});

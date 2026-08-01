import { LinkExecutionOrderEvidenceIdempotency1000000000000 } from './100_link_execution_order_evidence_idempotency';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

describe('LinkExecutionOrderEvidenceIdempotency100', () => {
  const originalFlag = process.env[FLAG];

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('añade la columna tipada, la FK RESTRICT y el índice parcial', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new LinkExecutionOrderEvidenceIdempotency1000000000000().up(queryRunner);

    const all = queries.join(' ');
    expect(all).toContain('ADD COLUMN IF NOT EXISTS evidence_upload_intent_id UUID');
    expect(all).toContain('fk_execution_order_idempotency_evidence_intent');
    expect(all).toContain('REFERENCES execution_order_evidence_upload_intents (id)');
    expect(all).toContain('ON DELETE RESTRICT');
    expect(all).toContain('idx_execution_order_idempotency_evidence_intent');
    expect(all).toContain('WHERE evidence_upload_intent_id IS NOT NULL');
  });

  it('backfillea solo referencias legacy con forma de UUID que existan en el schema', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new LinkExecutionOrderEvidenceIdempotency1000000000000().up(queryRunner);

    const backfill = queries.find((sql) =>
      sql.includes('UPDATE execution_order_idempotency_records'),
    );
    expect(backfill).toBeDefined();
    expect(backfill).toContain('evidence_upload_intent_id = intents.id');
    expect(backfill).toContain('FROM execution_order_evidence_upload_intents intents');
    expect(backfill).toContain('target.resource_ref ~');
    expect(backfill).toContain('lower(target.resource_ref) = intents.id::text');
    expect(backfill).toContain('target.evidence_upload_intent_id IS NULL');
  });

  it('bloquea down con vínculos poblados y no suelta la columna', async () => {
    delete process.env[FLAG];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)::int')) return [{ total: 1 }];
      return [];
    });

    await expect(
      new LinkExecutionOrderEvidenceIdempotency1000000000000().down({ query } as never),
    ).rejects.toThrow(new RegExp(`${FLAG}=true`));
    const all = query.mock.calls.map(([sql]) => String(sql)).join(' ');
    expect(all).not.toContain('DROP COLUMN');
  });

  it('con flag explícito revierte índice, FK y columna', async () => {
    process.env[FLAG] = 'true';
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new LinkExecutionOrderEvidenceIdempotency1000000000000().down(queryRunner);

    const all = queries.join(' ');
    expect(all).toContain('DROP INDEX IF EXISTS idx_execution_order_idempotency_evidence_intent');
    expect(all).toContain(
      'DROP CONSTRAINT IF EXISTS fk_execution_order_idempotency_evidence_intent',
    );
    expect(all).toContain('DROP COLUMN IF EXISTS evidence_upload_intent_id');
  });
});

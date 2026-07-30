import { CreateExecutionOrderEvidenceUploadIntents0950000000000 } from './095_create_execution_order_evidence_upload_intents';

const FLAG = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

describe('CreateExecutionOrderEvidenceUploadIntents095', () => {
  const originalFlag = process.env[FLAG];

  afterAll(() => {
    if (originalFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = originalFlag;
  });

  it('crea el CHECK de status y los índices de retención', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new CreateExecutionOrderEvidenceUploadIntents0950000000000().up(queryRunner);

    const all = queries.join(' ');
    expect(all).toContain('chk_execution_order_evidence_upload_intents_status');
    expect(all).toContain("'PENDING_ANALYSIS'");
    expect(all).toContain("'AVAILABLE'");
    expect(all).toContain("'REJECTED'");
    expect(all).toContain("'EXPIRED'");
    expect(all).toContain('idx_execution_order_evidence_upload_intents_retention');
    expect(all).toContain('LIMIT batch_size');
    expect(all).toContain('purge_execution_order_retention_batch');
  });

  it('bloquea down con intents y no elimina la tabla', async () => {
    delete process.env[FLAG];
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(*)::int')) return [{ total: 1 }];
      return [];
    });

    await expect(
      new CreateExecutionOrderEvidenceUploadIntents0950000000000().down({ query } as never),
    ).rejects.toThrow(new RegExp(`${FLAG}=true`));
    expect(query.mock.calls.map(([sql]) => String(sql)).join(' ')).not.toContain('DROP TABLE');
  });

  it('con flag explícito revierte constraint, función, índices y tabla', async () => {
    process.env[FLAG] = 'true';
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        return [];
      }),
    } as never;

    await new CreateExecutionOrderEvidenceUploadIntents0950000000000().down(queryRunner);

    const all = queries.join(' ');
    expect(all).toContain('DROP FUNCTION IF EXISTS purge_execution_order_retention_batch(INTEGER)');
    expect(all).toContain(
      'DROP CONSTRAINT IF EXISTS chk_execution_order_evidence_upload_intents_status',
    );
    expect(all).toContain('DROP TABLE IF EXISTS execution_order_evidence_upload_intents');
  });
});

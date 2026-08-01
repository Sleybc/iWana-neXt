import { CreateExecutionOrderEvidenceUploadIntents0950000000000 } from './095_create_execution_order_evidence_upload_intents';
import { AlignExecutionOrderEvidenceIntentRetention1010000000000 } from './101_align_execution_order_evidence_intent_retention';

/** Normaliza SQL para comparar literales independientemente del formato. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Ejecuta una migración contra un queryRunner mock y devuelve los SQL emitidos. */
async function captureSql(run: (queryRunner: never) => Promise<void>): Promise<string[]> {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return [];
    }),
  } as never;
  await run(queryRunner);
  return queries;
}

function extractCreateOrReplace(queries: string[]): string {
  const statement = queries.find((sql) => sql.includes('CREATE OR REPLACE FUNCTION'));
  if (!statement) throw new Error('No se emitió CREATE OR REPLACE FUNCTION');
  return statement;
}

describe('AlignExecutionOrderEvidenceIntentRetention101', () => {
  it('reemplaza la función de retención con la semántica consciente de idempotencia', async () => {
    const queries = await captureSql((queryRunner) =>
      new AlignExecutionOrderEvidenceIntentRetention1010000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    expect(statement).toContain(
      'purge_execution_order_retention_batch(batch_size INTEGER DEFAULT 500)',
    );
    expect(statement).toContain(
      `NOT EXISTS (
               SELECT 1
               FROM execution_order_idempotency_records idem
               WHERE idem.evidence_upload_intent_id = intent.id
             )`,
    );
    // Los cuatro pasos previos (idempotencia, outbox, inbox, auditoría) se conservan.
    expect(statement).toContain('execution_order_idempotency_records');
    expect(statement).toContain('execution_order_outbox_events');
    expect(statement).toContain('execution_order_inbox_events');
    expect(statement).toContain('execution_order_audit_intents');
    expect(statement).toContain('evidence_upload_intents_deleted BIGINT');
    expect(statement).toContain('batch_size must be between 1 and 10000');
  });

  it('no toca el CHECK de estados: lo alineó la 099, la 101 solo reemplaza la función', async () => {
    const queries = await captureSql((queryRunner) =>
      new AlignExecutionOrderEvidenceIntentRetention1010000000000().up(queryRunner),
    );

    const all = queries.join(' ');
    expect(all).not.toContain('ALTER TABLE execution_order_evidence_upload_intents');
    expect(all).not.toContain('ADD CONSTRAINT');
    expect(all).not.toContain('DROP CONSTRAINT');
  });

  it('down restaura EXACTAMENTE la función legacy emitida por la 095', async () => {
    const legacyQueries = await captureSql((queryRunner) =>
      new CreateExecutionOrderEvidenceUploadIntents0950000000000().up(queryRunner),
    );
    const legacyFunction = normalize(extractCreateOrReplace(legacyQueries));

    const downQueries = await captureSql((queryRunner) =>
      new AlignExecutionOrderEvidenceIntentRetention1010000000000().down(queryRunner),
    );
    const restoredFunction = normalize(extractCreateOrReplace(downQueries));

    expect(restoredFunction).toBe(legacyFunction);
    // El literal legacy purga sin consultar idempotencia: el bug queda restaurado.
    expect(restoredFunction).not.toContain('evidence_upload_intent_id');
  });
});

import { AlignExecutionOrderEvidenceIntentRetention1010000000000 } from './101_align_execution_order_evidence_intent_retention';
import {
  AnonymizeExecutionOrderTransitionRetention1340000000000,
  TRANSITION_RETENTION_ANONYMIZED_SENTINEL,
} from './134_anonymize_execution_order_transition_retention';

/** Normaliza SQL para comparar literales independientemente del formato. */
function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** Ejecuta una migración contra un queryRunner mock y devuelve los SQL emitidos. */
async function captureSql(
  run: (queryRunner: never) => Promise<void>,
  countResult = 0,
): Promise<string[]> {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('COUNT(*)::int')) return [{ total: countResult }];
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

describe('AnonymizeExecutionOrderTransitionRetention134', () => {
  it('resuelve la ausencia con columna anulable + centinela nil-UUID (decisión §4.3)', async () => {
    expect(TRANSITION_RETENTION_ANONYMIZED_SENTINEL).toBe('00000000-0000-0000-0000-000000000000');

    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );
    const all = queries.join(' ');

    expect(all).toContain('ALTER COLUMN changed_by DROP NOT NULL');
    expect(all).toContain(TRANSITION_RETENTION_ANONYMIZED_SENTINEL);
  });

  it('extiende la función con la sexta columna sin tocar los cinco pasos previos', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    expect(statement).toContain(
      'purge_execution_order_retention_batch(batch_size INTEGER DEFAULT 500)',
    );
    expect(statement).toContain('status_transitions_anonymized BIGINT');
    // Los cinco pasos previos se conservan intactos.
    expect(statement).toContain('execution_order_idempotency_records');
    expect(statement).toContain('execution_order_outbox_events');
    expect(statement).toContain('execution_order_inbox_events');
    expect(statement).toContain('execution_order_audit_intents');
    expect(statement).toContain('evidence_upload_intents_deleted BIGINT');
    expect(statement).toContain('batch_size must be between 1 and 10000');
  });

  it('anonimiza en vez de borrar: conserva from/to/changed_at y solo retira actor + motivo (CA-01/CA-02/CA-05)', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    expect(statement).toContain('UPDATE execution_order_status_transitions target');
    expect(statement).toContain('reason = NULL');
    expect(statement).not.toContain('DELETE FROM execution_order_status_transitions');
    // La forma temporal no aparece en el SET: sobrevive.
    const setClause = statement.slice(
      statement.indexOf('UPDATE execution_order_status_transitions'),
    );
    expect(setClause).not.toContain('from_status');
    expect(setClause).not.toContain('to_status');
    expect(setClause).not.toContain('changed_at');
  });

  it('mira el estado de la OT padre y el último cierre, no la antigüedad de la fila (CA-03/CA-04)', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    // Solo OT en estado terminal: la abierta no vence nunca, por antigua que sea.
    expect(statement).toContain('JOIN execution_orders o');
    expect(statement).toContain(
      `o.status IN ('COMPLETED', 'COMPLETED_WITH_OBSERVATIONS', 'NOT_EXECUTED', 'CANCELLED')`,
    );
    // Referencia: último asiento de cierre/cancelación; en su defecto closed_at.
    expect(statement).toContain('SELECT MAX(s.changed_at)');
    expect(statement).toContain('o.closed_at');
    expect(statement).toContain(`INTERVAL '24 months'`);
  });

  it('la corrección aditiva no reinicia el plazo pero sí se anonimiza (CA-06)', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    // Excluida del cómputo del instante de referencia...
    expect(statement).toContain('s.correction_of_id IS NULL');
    // ...pero las víctimas no filtran por correction_of_id: toda la OT vence junta.
    const victimsBlock = statement.slice(statement.indexOf('SELECT t.id'));
    expect(victimsBlock).not.toContain('t.correction_of_id');
  });

  it('nunca inventa cierres ni toca lo ya anonimizado o nunca registrado (CA-03/CA-07)', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const statement = extractCreateOrReplace(queries);
    // COALESCE NULL (sin asiento terminal ni closed_at) no satisface el <= : no vence.
    expect(statement).toContain('COALESCE(');
    // Idempotente y preserva la distinción CA-07: salta centinela y NULLs.
    expect(statement).toContain('t.changed_by IS NOT NULL');
    expect(statement).toContain(
      `t.changed_by <> '${TRANSITION_RETENTION_ANONYMIZED_SENTINEL}'::uuid`,
    );
  });

  it('crea el índice parcial que soporta la condición correlacionada', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const all = queries.join(' ');
    expect(all).toContain('idx_execution_order_status_transitions_retention');
    expect(all).toContain('(execution_order_id, changed_at)');
    expect(all).toContain('WHERE changed_by IS NOT NULL');
  });

  it('down restaura EXACTAMENTE la función emitida por la 101 cuando no hay NULLs', async () => {
    const legacyQueries = await captureSql((queryRunner) =>
      new AlignExecutionOrderEvidenceIntentRetention1010000000000().up(queryRunner),
    );
    const legacyFunction = normalize(extractCreateOrReplace(legacyQueries));

    const downQueries = await captureSql(
      (queryRunner) =>
        new AnonymizeExecutionOrderTransitionRetention1340000000000().down(queryRunner),
      0,
    );
    const restoredFunction = normalize(extractCreateOrReplace(downQueries));

    expect(restoredFunction).toBe(legacyFunction);
    expect(restoredFunction).not.toContain('status_transitions_anonymized');

    const all = downQueries.join(' ');
    expect(all).toContain('DROP INDEX IF EXISTS idx_execution_order_status_transitions_retention');
    expect(all).toContain('ALTER COLUMN changed_by SET NOT NULL');
  });

  it('down verifica NULLs ANTES de emitir DDL y bloquea sin inventar actores', async () => {
    const queries: string[] = [];
    const query = jest.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('COUNT(*)::int')) return [{ total: 3 }];
      return [];
    });

    await expect(
      new AnonymizeExecutionOrderTransitionRetention1340000000000().down({ query } as never),
    ).rejects.toThrow(/«nunca se registró»/);
    expect(queries.join(' ')).not.toContain('CREATE OR REPLACE FUNCTION');
    expect(queries.join(' ')).not.toContain('DROP INDEX');
    expect(queries.join(' ')).not.toContain('SET NOT NULL');
  });

  it('no crea cron ni toca contratos: solo DDL de tenant + función (CA-08)', async () => {
    const queries = await captureSql((queryRunner) =>
      new AnonymizeExecutionOrderTransitionRetention1340000000000().up(queryRunner),
    );

    const all = queries.join(' ');
    expect(all).not.toMatch(/cron|pg_cron|schedule/i);
    expect(all).not.toContain('shared');
  });
});

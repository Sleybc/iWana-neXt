import { TenantContext } from '@iwana/db';
import type { QueryRunner } from 'typeorm';
import type { TitularErasureScope } from '../../crm/privacy-adapters/titular-erasure/titular-erasure.types';
import { BillingTitularErasureParticipant } from './billing-titular-erasure.participant';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subscriberId = '20000000-0000-4000-8000-000000000001';

function createScope(overrides: Partial<TitularErasureScope> = {}): TitularErasureScope {
  return {
    partyId: null,
    subscriberIds: [subscriberId],
    expedienteIds: [],
    userIds: [],
    ...overrides,
  };
}

describe('BillingTitularErasureParticipant', () => {
  let participant: BillingTitularErasureParticipant;
  let query: jest.Mock;

  beforeEach(() => {
    participant = new BillingTitularErasureParticipant();
    query = jest.fn();
    jest.spyOn(TenantContext, 'getOrThrow').mockReturnValue({ tenantId } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('preview cuenta datos fiscales, líneas de borradores y campos libres sin escribir', async () => {
    query
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 4 }]);

    const result = await participant.plan(createScope(), { query } as unknown as QueryRunner);

    expect(result).toEqual([
      { table: 'billing_documents', category: 'FISCAL', selected: 3, changed: 0, residual: 3 },
      { table: 'billing_document_lines', category: 'FISCAL', selected: 2, changed: 0, residual: 2 },
      { table: 'billing_payments', category: 'COMERCIAL', selected: 4, changed: 0, residual: 4 },
    ]);
    expect(query).toHaveBeenCalledTimes(6);
    for (const [sql, parameters] of query.mock.calls as [string, unknown[]][]) {
      expect(sql).toContain('tenant_id = $1::uuid');
      expect(parameters.slice(0, 2)).toEqual([tenantId, [subscriberId]]);
    }
    expect(query.mock.calls.every(([sql]) => !String(sql).startsWith('UPDATE'))).toBe(true);
    expect(query.mock.calls.every(([sql]) => !String(sql).startsWith('DELETE'))).toBe(true);
  });

  it('redacta snapshot, elimina documento borrador y verifica cero residuales', async () => {
    query
      .mockResolvedValueOnce([{ count: 3 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 4 }])
      .mockResolvedValueOnce([{ id: 'doc-emitido' }])
      .mockResolvedValueOnce([{ id: 'doc-borrador' }])
      .mockResolvedValueOnce([{ id: 'pago' }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await participant.apply(
      createScope(),
      { query } as unknown as QueryRunner,
      'apply',
    );

    expect(result).toEqual([
      { table: 'billing_documents', category: 'FISCAL', selected: 3, changed: 2, residual: 0 },
      { table: 'billing_document_lines', category: 'FISCAL', selected: 2, changed: 2, residual: 0 },
      { table: 'billing_payments', category: 'COMERCIAL', selected: 4, changed: 1, residual: 0 },
    ]);
    const updateDocumentSql = String(query.mock.calls[3]?.[0]);
    expect(updateDocumentSql).toContain('buyer_document_encrypted = NULL');
    expect(updateDocumentSql).toContain("jsonb_set(buyer_snapshot, '{displayName}'");
    expect(updateDocumentSql).toContain("jsonb_build_object('documentType', $3::text)");
    expect(query.mock.calls[3]?.[1]).toEqual([tenantId, [subscriberId], 'ANONIMIZADO']);
    expect(String(query.mock.calls[4]?.[0])).toContain("status = 'BORRADOR'");
    expect(String(query.mock.calls[5]?.[0])).toContain('SET reference = NULL, note = NULL');
    expect(query.mock.calls[4]?.[1]).toEqual([tenantId, [subscriberId]]);
    expect(query.mock.calls[5]?.[1]).toEqual([tenantId, [subscriberId]]);
  });

  it('no accede a la base cuando el alcance no incluye suscriptores', async () => {
    const result = await participant.plan(createScope({ subscriberIds: [] }), {
      query,
    } as unknown as QueryRunner);

    expect(query).not.toHaveBeenCalled();
    expect(
      result.every((row) => row.selected === 0 && row.changed === 0 && row.residual === 0),
    ).toBe(true);
  });
});

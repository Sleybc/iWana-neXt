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

/**
 * Las sondas de esquema responden aparte: columna `external_pdf_key` (199), tabla
 * `billing_courtesies` (203) y tabla `billing_payment_withholdings` (206, que el participante ya no
 * consulta: decisión D5). El resto va al mock.
 */
function qrOf(
  query: jest.Mock,
  hasPdf = true,
  hasCourtesies = false,
  hasWithholdings = false,
): QueryRunner {
  return {
    query: (sql: string, parameters?: unknown[]) =>
      /information_schema/u.test(sql)
        ? Promise.resolve([
            {
              present: /billing_payment_withholdings/u.test(sql)
                ? hasWithholdings
                : /billing_courtesies/u.test(sql)
                  ? hasCourtesies
                  : hasPdf,
            },
          ])
        : query(sql, parameters),
  } as unknown as QueryRunner;
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

    const result = await participant.plan(createScope(), qrOf(query));

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
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'doc-emitido' }])
      .mockResolvedValueOnce([{ id: 'doc-borrador' }])
      .mockResolvedValueOnce([{ id: 'pago' }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await participant.apply(createScope(), qrOf(query), 'apply');

    expect(result).toEqual([
      { table: 'billing_documents', category: 'FISCAL', selected: 3, changed: 2, residual: 0 },
      { table: 'billing_document_lines', category: 'FISCAL', selected: 2, changed: 2, residual: 0 },
      { table: 'billing_payments', category: 'COMERCIAL', selected: 4, changed: 1, residual: 0 },
    ]);
    const updateDocumentSql = String(query.mock.calls[4]?.[0]);
    expect(updateDocumentSql).toContain('buyer_document_encrypted = NULL');
    expect(updateDocumentSql).toContain("jsonb_set(buyer_snapshot, '{displayName}'");
    expect(updateDocumentSql).toContain("jsonb_build_object('documentType', $3::text)");
    expect(query.mock.calls[4]?.[1]).toEqual([tenantId, [subscriberId], 'ANONIMIZADO']);
    expect(String(query.mock.calls[5]?.[0])).toContain("status = 'BORRADOR'");
    expect(String(query.mock.calls[6]?.[0])).toContain('SET reference = NULL, note = NULL');
    expect(query.mock.calls[5]?.[1]).toEqual([tenantId, [subscriberId]]);
    expect(query.mock.calls[6]?.[1]).toEqual([tenantId, [subscriberId]]);
  });

  it('IMPORTADO: retira el PDF histórico del storage y deja external_pdf_key en NULL', async () => {
    const storage = { deleteObject: jest.fn().mockResolvedValue(undefined) };
    participant = new BillingTitularErasureParticipant(storage as never);
    query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([
        { key: 'tenant_x/billing-imported/uisp_invoice_1.pdf', schema: 'tenant_x' },
      ])
      .mockResolvedValueOnce([{ id: 'doc-importado' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);
    const result = await participant.apply(createScope(), qrOf(query), 'apply');
    expect(result[0]).toMatchObject({ table: 'billing_documents', changed: 1, residual: 0 });
    expect(storage.deleteObject).toHaveBeenCalledWith(
      'tenant_x/billing-imported/uisp_invoice_1.pdf',
    );
    const update = String(query.mock.calls[4]?.[0]);
    expect(update).toContain('external_pdf_key = NULL');
    expect(update).toContain("'IMPORTADO'");
  });

  it('IMPORTADO: sin storage o con clave ajena falla cerrado', async () => {
    query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ key: 'tenant_x/billing-imported/a.pdf', schema: 'tenant_x' }]);
    await expect(participant.apply(createScope(), qrOf(query), 'apply')).rejects.toThrow(
      /requiere storage/u,
    );
    const storage = { deleteObject: jest.fn() };
    participant = new BillingTitularErasureParticipant(storage as never);
    query
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ key: 'otro/billing-imported/a.pdf', schema: 'tenant_x' }]);
    await expect(participant.apply(createScope(), qrOf(query), 'apply')).rejects.toThrow(
      /fuera del schema/u,
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
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

  it('cortesías (203): vacía nota y nota de anulación y verifica cero residuales', async () => {
    query
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ id: 'cortesia-1' }, { id: 'cortesia-2' }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const result = await participant.apply(createScope(), qrOf(query, true, true), 'apply');

    expect(result[3]).toEqual({
      table: 'billing_courtesies',
      category: 'COMERCIAL',
      selected: 2,
      changed: 2,
      residual: 0,
    });
    const update = String(query.mock.calls[11]?.[0]);
    expect(update).toContain('SET note = NULL, void_note = NULL');
    expect(query.mock.calls[11]?.[1]).toEqual([tenantId, [subscriberId]]);
  });

  it('retenciones (206): conserva el número de certificado como soporte contable (decisión D5)', async () => {
    // Conteos en cero y escrituras vacías, para la vista previa y la aplicación.
    query.mockImplementation((sql: string) =>
      Promise.resolve(/COUNT\(\*\)/u.test(sql) ? [{ count: 0 }] : []),
    );
    const seen: string[] = [];
    const base = qrOf(query, true, false, true);
    const qr = {
      query: (sql: string, parameters?: unknown[]) => {
        seen.push(sql);
        return base.query(sql, parameters);
      },
    } as unknown as QueryRunner;

    for (const mode of ['dry-run', 'apply'] as const) {
      const result = await participant.apply(createScope(), qr, mode);
      expect(result.map((row) => row.table)).not.toContain('billing_payment_withholdings');
    }
    expect(seen.some((sql) => /billing_payment_withholdings|certificate_number/u.test(sql))).toBe(
      false,
    );
  });

  it('cortesías en vista previa: cuenta notas sin escribir', async () => {
    query
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const result = await participant.plan(createScope(), qrOf(query, true, true));

    expect(result[3]).toEqual({
      table: 'billing_courtesies',
      category: 'COMERCIAL',
      selected: 1,
      changed: 0,
      residual: 1,
    });
    expect(query.mock.calls.every(([sql]) => !String(sql).trim().startsWith('UPDATE'))).toBe(true);
  });
});

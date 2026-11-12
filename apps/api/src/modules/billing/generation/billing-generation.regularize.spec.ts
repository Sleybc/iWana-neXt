// Spec 2026-11-11 R7/R8: regularización de borradores existentes y motivo de bloqueo.
import { randomUUID } from 'node:crypto';
import { TenantContext } from '@iwana/db';
import type { BillableContract } from '../ports/billing-contract-read.port';
import { BillingGenerationService, draftBlockingReason } from './billing-generation.service';

const query = jest.fn();
jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    runInTenantSchema: jest.fn(
      async (_ds: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ query, manager: { query } }),
    ),
  };
});

const contract = (overrides: Partial<BillableContract> = {}): BillableContract =>
  ({
    contractId: randomUUID(),
    monthlyPrice: '100000.00',
    vatSnapshot: { treatment: 'STANDARD', ratePercent: 19 },
    buyer: { displayName: 'Titular', documentType: 'CC', hasDocumentNumber: true },
    ...overrides,
  }) as BillableContract;

describe('draftBlockingReason', () => {
  it('prioriza precio, luego IVA, luego datos fiscales', () => {
    expect(draftBlockingReason(contract())).toBeNull();
    expect(draftBlockingReason(contract({ monthlyPrice: null }))).toBe('SIN_PRECIO');
    expect(draftBlockingReason(contract({ vatSnapshot: null }))).toBe('SIN_TRATAMIENTO_IVA');
    expect(
      draftBlockingReason(
        contract({
          buyer: {
            displayName: 'Titular',
            documentType: 'CC',
            hasDocumentNumber: false,
          } as BillableContract['buyer'],
        }),
      ),
    ).toBe('SIN_DATOS_FISCALES');
  });
});

describe('BillingGenerationService.regularizeDrafts', () => {
  const tenant = { tenantId: randomUUID(), schemaName: 'tenant_unit', tenantSlug: 'unit' };
  const contractId = randomUUID();
  const contracts = { findByContractId: jest.fn() };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const service = new BillingGenerationService(
    {} as never,
    contracts as never,
    {} as never,
    {} as never,
    audit as never,
    {} as never,
  );
  const run = () => TenantContext.run(tenant, () => service.regularizeDrafts(contractId, 'actor'));
  const draft = (overrides: Record<string, unknown> = {}) => ({
    document_id: randomUUID(),
    blocking_reason: 'SIN_DATOS_FISCALES',
    document_due: '2026-10-14',
    period_id: 'p-oct',
    generation_date: '2026-11-11',
    due_date: '2026-10-14',
    cutoff_date: '2026-10-15',
    effective_policy: { payment_term_days: 14 },
    has_issued: false,
    ...overrides,
  });

  beforeEach(() => {
    query.mockReset();
    audit.logWithin.mockClear();
    contracts.findByContractId.mockResolvedValue(contract({ contractId }));
  });

  it('desbloquea y corre el vencimiento del periodo y de su borrador', async () => {
    query.mockResolvedValueOnce([draft()]).mockResolvedValue([]);

    expect(await run()).toEqual({ unblocked: 1, rescheduled: 1 });

    expect(query.mock.calls[1]?.[1]).toEqual([
      tenant.tenantId,
      'p-oct',
      '2026-11-25',
      '2026-11-26',
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      tenant.tenantId,
      expect.any(String),
      null,
      '2026-11-25',
    ]);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BillingDocument',
        oldValue: { blockingReason: 'SIN_DATOS_FISCALES', dueDate: '2026-10-14' },
        newValue: {
          blockingReason: null,
          dueDate: '2026-11-25',
          reason: 'PRIMER_COBRO_CONTRATO_HEREDADO',
        },
      }),
      expect.anything(),
    );
  });

  it('no corre fechas de un periodo con documento emitido ni toca otros motivos', async () => {
    query
      .mockResolvedValueOnce([draft({ has_issued: true, blocking_reason: 'SIN_PRECIO' })])
      .mockResolvedValue([]);

    expect(await run()).toEqual({ unblocked: 0, rescheduled: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('mantiene el bloqueo si el contrato sigue sin datos fiscales o ya no es legible', async () => {
    contracts.findByContractId.mockResolvedValueOnce(
      contract({
        buyer: {
          displayName: 'Titular',
          documentType: null,
          hasDocumentNumber: true,
        } as BillableContract['buyer'],
      }),
    );
    query
      .mockResolvedValueOnce([draft({ due_date: '2026-11-14', document_due: '2026-11-14' })])
      .mockResolvedValue([]);
    expect(await run()).toEqual({ unblocked: 0, rescheduled: 0 });

    contracts.findByContractId.mockResolvedValueOnce(null);
    query
      .mockResolvedValueOnce([draft({ due_date: '2026-11-14', document_due: '2026-11-14' })])
      .mockResolvedValue([]);
    expect(await run()).toEqual({ unblocked: 0, rescheduled: 0 });
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('dos borradores del mismo periodo comparten el corrimiento y cuentan por documento', async () => {
    query.mockResolvedValueOnce([draft(), draft()]).mockResolvedValue([]);
    expect(await run()).toEqual({ unblocked: 2, rescheduled: 2 });
    const periodUpdates = query.mock.calls.filter(([sql]) =>
      String(sql).includes('UPDATE billing_periods'),
    );
    expect(periodUpdates).toHaveLength(1);
  });
});

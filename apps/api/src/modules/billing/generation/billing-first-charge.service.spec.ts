import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import type { BillingGenerationSummary } from '@iwana/shared';
import { BillingFirstChargeService } from './billing-first-charge.service';

jest.mock('@iwana/db', () => {
  const actual = jest.requireActual('@iwana/db');
  return {
    ...actual,
    runInTenantSchema: jest.fn(
      async (_ds: unknown, _schema: string, work: (qr: unknown) => unknown) =>
        work({ manager: {} }),
    ),
  };
});

const summary = (overrides: Partial<BillingGenerationSummary> = {}): BillingGenerationSummary => ({
  generated: 0,
  failed: 0,
  notDue: 0,
  existing: 0,
  omittedImpersonation: 0,
  omittedTermination: 0,
  blocked: 0,
  withoutCycle: 0,
  unbilledAdditionalDocuments: 0,
  ...overrides,
});

describe('BillingFirstChargeService', () => {
  const contractId = randomUUID();
  const actorId = randomUUID();
  const tenant = { tenantId: randomUUID(), schemaName: 'tenant_unit', tenantSlug: 'unit' };
  let port: {
    findActivationAnchor: jest.Mock;
    freezeInstallationFeeIfMissing: jest.Mock;
    freezeFiscalDataIfMissing: jest.Mock;
  };
  let contracts: { findBillingCycleByContractId: jest.Mock };
  let generation: {
    hasAnyPeriod: jest.Mock;
    generate: jest.Mock;
    pendingCatchUpPeriods: jest.Mock;
    onlyDraftDocuments: jest.Mock;
    regularizeDrafts: jest.Mock;
  };
  let settings: { getSnapshot: jest.Mock };
  let audit: { logWithin: jest.Mock };
  let service: BillingFirstChargeService;

  const call = (date?: string) =>
    TenantContext.run(tenant, () =>
      service.generateFirstCharge({ contractId, actorId, ...(date ? { date } : {}) }),
    );

  beforeEach(() => {
    port = {
      findActivationAnchor: jest.fn().mockResolvedValue({
        contractId,
        status: 'ACTIVE',
        date: '2026-10-30',
        source: 'STATUS_CHANGED_AT',
      }),
      freezeInstallationFeeIfMissing: jest
        .fn()
        .mockResolvedValue({ outcome: 'FROZEN', amount: '50000.00' }),
      freezeFiscalDataIfMissing: jest.fn().mockResolvedValue({
        outcome: 'FROZEN',
        frozenFields: ['DOCUMENT', 'ADDRESS'],
        missingFields: [],
      }),
    };
    contracts = {
      findBillingCycleByContractId: jest.fn().mockResolvedValue({ cycleDay: 1, cutoffDay: 15 }),
    };
    generation = {
      hasAnyPeriod: jest.fn().mockResolvedValue(false),
      generate: jest.fn().mockResolvedValue(summary({ generated: 1 })),
      pendingCatchUpPeriods: jest.fn().mockResolvedValue(['2026-11-01']),
      onlyDraftDocuments: jest.fn().mockResolvedValue(true),
      regularizeDrafts: jest.fn().mockResolvedValue({ unblocked: 2, rescheduled: 1 }),
    };
    settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
    audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
    service = new BillingFirstChargeService(
      {} as never,
      contracts as never,
      port as never,
      generation as never,
      settings as never,
      audit as never,
    );
  });

  it('congela, ancla el primer cobro, se pone al día y audita sin PII', async () => {
    const result = await call('2026-11-11');

    expect(port.freezeInstallationFeeIfMissing).toHaveBeenCalledWith(contractId, actorId);
    expect(generation.generate).toHaveBeenNthCalledWith(1, {
      contractId,
      date: '2026-11-11',
      firstChargeFrom: '2026-10-30',
      actorId,
    });
    expect(generation.generate).toHaveBeenNthCalledWith(2, {
      contractId,
      date: '2026-11-11',
      targetPeriodStart: '2026-11-01',
      actorId,
    });
    expect(port.freezeInstallationFeeIfMissing.mock.invocationCallOrder[0]).toBeLessThan(
      generation.generate.mock.invocationCallOrder[0]!,
    );
    expect(port.freezeFiscalDataIfMissing.mock.invocationCallOrder[0]).toBeLessThan(
      generation.generate.mock.invocationCallOrder[0]!,
    );
    // Sin periodos previos no hay borradores que regularizar.
    expect(generation.regularizeDrafts).not.toHaveBeenCalled();
    expect(result).toEqual({
      contractId,
      anchorDate: '2026-10-30',
      anchorSource: 'STATUS_CHANGED_AT',
      installationFee: { outcome: 'FROZEN', amount: '50000.00' },
      fiscalData: { outcome: 'FROZEN', frozenFields: ['DOCUMENT', 'ADDRESS'], missingFields: [] },
      summary: summary({ generated: 2 }),
      regularizedDrafts: { unblocked: 0, rescheduled: 0 },
    });
    expect(audit.logWithin).toHaveBeenCalledWith(
      {
        action: 'CREATE',
        entityType: 'BillingFirstCharge',
        entityId: contractId,
        userId: actorId,
        newValue: {
          anchorDate: '2026-10-30',
          anchorSource: 'STATUS_CHANGED_AT',
          installationFee: 'FROZEN',
          fiscalFieldsFrozen: ['DOCUMENT', 'ADDRESS'],
          summary: summary({ generated: 2 }),
          regularizedDrafts: { unblocked: 0, rescheduled: 0 },
        },
      },
      expect.anything(),
    );
  });

  it('usa la fecha civil del tenant cuando no se indica fecha', async () => {
    await call();
    expect(settings.getSnapshot).toHaveBeenCalledWith({ tenantId: tenant.tenantId });
    expect(generation.generate.mock.calls[0]?.[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

  it('con periodos solo en BORRADOR congela, no ancla y regulariza los borradores', async () => {
    generation.hasAnyPeriod.mockResolvedValue(true);
    generation.pendingCatchUpPeriods.mockResolvedValue([]);
    port.findActivationAnchor.mockResolvedValue({
      contractId,
      status: 'ACTIVE',
      date: null,
      source: null,
    });

    const result = await call('2026-11-11');

    expect(port.freezeInstallationFeeIfMissing).toHaveBeenCalledWith(contractId, actorId);
    expect(port.freezeFiscalDataIfMissing).toHaveBeenCalledWith(contractId, actorId);
    expect(generation.generate).not.toHaveBeenCalled();
    expect(port.freezeFiscalDataIfMissing.mock.invocationCallOrder[0]).toBeLessThan(
      generation.regularizeDrafts.mock.invocationCallOrder[0]!,
    );
    expect(generation.regularizeDrafts).toHaveBeenCalledWith(contractId, actorId);
    expect(result).toMatchObject({
      anchorDate: null,
      anchorSource: null,
      installationFee: { outcome: 'FROZEN', amount: '50000.00' },
      summary: summary({ existing: 1 }),
      regularizedDrafts: { unblocked: 2, rescheduled: 1 },
    });
  });

  it('con documentos ya emitidos no congela, pero regulariza los borradores restantes', async () => {
    generation.hasAnyPeriod.mockResolvedValue(true);
    generation.onlyDraftDocuments.mockResolvedValue(false);
    generation.pendingCatchUpPeriods.mockResolvedValue([]);
    generation.regularizeDrafts.mockResolvedValue({ unblocked: 0, rescheduled: 0 });

    const result = await call('2026-11-11');

    expect(port.freezeInstallationFeeIfMissing).not.toHaveBeenCalled();
    expect(port.freezeFiscalDataIfMissing).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      installationFee: { outcome: 'NOT_APPLICABLE', amount: null },
      fiscalData: { outcome: 'NOT_APPLICABLE', frozenFields: [], missingFields: [] },
      summary: summary({ existing: 1 }),
    });
  });

  it('corta la puesta al día en el primer periodo fallido', async () => {
    generation.pendingCatchUpPeriods.mockResolvedValue(['2026-11-01', '2026-12-01']);
    generation.generate
      .mockResolvedValueOnce(summary({ generated: 1 }))
      .mockResolvedValueOnce(summary({ failed: 1 }));

    const result = await call('2026-12-02');

    expect(generation.generate).toHaveBeenCalledTimes(2);
    expect(result.summary).toEqual(summary({ generated: 1, failed: 1 }));
  });

  it('sin ciclo no intenta la puesta al día', async () => {
    contracts.findBillingCycleByContractId.mockResolvedValue({ cycleDay: null, cutoffDay: null });
    generation.generate.mockResolvedValue(summary({ withoutCycle: 1 }));

    const result = await call('2026-11-11');

    expect(generation.pendingCatchUpPeriods).not.toHaveBeenCalled();
    expect(result.summary).toEqual(summary({ withoutCycle: 1 }));
  });

  it('404 si el contrato no existe, 409 si no está activo, 422 sin fecha de activación', async () => {
    port.findActivationAnchor.mockResolvedValueOnce(null);
    await expect(call('2026-11-11')).rejects.toBeInstanceOf(NotFoundException);

    port.findActivationAnchor.mockResolvedValueOnce({
      contractId,
      status: 'SUSPENDED',
      date: '2026-10-30',
      source: 'START_DATE',
    });
    await expect(call('2026-11-11')).rejects.toBeInstanceOf(ConflictException);

    port.findActivationAnchor.mockResolvedValueOnce({
      contractId,
      status: 'ACTIVE',
      date: null,
      source: null,
    });
    await expect(call('2026-11-11')).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(port.freezeInstallationFeeIfMissing).not.toHaveBeenCalled();
    expect(port.freezeFiscalDataIfMissing).not.toHaveBeenCalled();
    expect(generation.generate).not.toHaveBeenCalled();
    expect(audit.logWithin).not.toHaveBeenCalled();
  });
});

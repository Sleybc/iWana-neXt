import { UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { TenantContext, runInTenantSchema } from '@iwana/db';
import { DataSource, QueryRunner } from 'typeorm';
import { BillingPolicyService } from './billing-policy.service';
import { BillingContractReadPort } from '../ports/billing-contract-read.port';
import { SettingsPriorityTenantReadPort } from '../../tenant/ports/settings-priority-tenant-read.port';

const tenant = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  schemaName: 'tenant_billing_test',
  tenantSlug: 'billing-test',
};
const actorId = '00000000-0000-4000-8000-000000000002';

const baseUpdate = {
  expectedUpdatedAt: '2026-11-03T10:00:00.123000Z',
  periodTiming: 'ANTICIPADO',
  generationLeadDays: 0,
  cutoffMode: 'DIA_FIJO_CICLO',
  paymentTermDays: 14,
  graceDays: 0,
  cutoffEnabled: true,
  minimumUnpaidForCutoff: 0,
  prorationMethod: 'DIAS_REALES',
  firstPeriodMode: 'SEPARADO',
  automaticGeneration: false,
  approvalMode: 'BORRADOR',
  autoApplyCredit: true,
  generationHour: 6,
  documentPrefix: 'DC',
};

const policyRow = {
  tenant_id: tenant.tenantId,
  period_timing: 'ANTICIPADO',
  generation_lead_days: 0,
  cutoff_mode: 'DIA_FIJO_CICLO',
  payment_term_days: 14,
  grace_days: 0,
  cutoff_enabled: true,
  minimum_unpaid_for_cutoff: '0.00',
  proration_method: 'DIAS_REALES',
  first_period_mode: 'SEPARADO',
  automatic_generation: false,
  approval_mode: 'BORRADOR',
  auto_apply_credit: true,
  generation_hour: 6,
  document_prefix: 'DC',
  updated_by: null,
  updated_at: baseUpdate.expectedUpdatedAt,
};

const billingContractReadPort = {
  findBillableForDate: jest.fn(),
  findByContractId: jest.fn(),
  findBillingCycleByContractId: jest.fn(),
  listBillingCycles: jest.fn(),
  lockTitularForBillingWrite: jest.fn(),
};
const tenantSettingsReadPort = {
  getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }),
};

function createService(dataSource: DataSource, audit: AuditService): BillingPolicyService {
  return new BillingPolicyService(
    dataSource,
    audit,
    billingContractReadPort as unknown as BillingContractReadPort,
    tenantSettingsReadPort as unknown as SettingsPriorityTenantReadPort,
  );
}

describe('BillingPolicyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-04T12:00:00.000Z'));
    tenantSettingsReadPort.getSnapshot.mockResolvedValue({ timezone: 'America/Bogota' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rechaza con 422 la combinación DIA_FIJO_CICLO con VENCIDO antes de abrir transacción', async () => {
    const dataSource = { createQueryRunner: jest.fn() } as unknown as DataSource;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(dataSource, audit);

    await expect(
      service.updatePolicy({ ...baseUpdate, periodTiming: 'VENCIDO' }, actorId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('responde 409 si expectedUpdatedAt no coincide con la política bloqueada', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    const policyManager = { query: jest.fn() };
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: policyManager,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(dataSource, audit);
    const staleRow = { ...policyRow, updated_at: '2026-11-03T10:00:00.123001Z' };
    runnerQuery.mockResolvedValueOnce(undefined).mockResolvedValueOnce([staleRow]);

    await expect(
      TenantContext.run(tenant, () => service.updatePolicy(baseUpdate, actorId)),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'BILLING_POLICY_CHANGED' },
    });
    expect(runnerQuery).toHaveBeenCalledTimes(2);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('audita la actualización dentro del manager de la transacción antes de devolverla', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    const manager = { query: jest.fn() };
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = createService(dataSource, audit);
    const updatedRow = {
      ...policyRow,
      updated_by: actorId,
      updated_at: '2026-11-03T10:01:00.000000Z',
    };
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([policyRow])
      // BR-4.7: consulta de sobrescrituras VENCIDO, que con DIA_FIJO_CICLO no deben existir.
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([[updatedRow], 1]);

    const result = await TenantContext.run(tenant, () => service.updatePolicy(baseUpdate, actorId));

    expect(result.updatedBy).toBe(actorId);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'BillingPolicy', userId: actorId }),
      manager,
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('BR-4.7 rechaza con 422 y sin PII pasar a DIA_FIJO_CICLO si un contrato sobrescribe VENCIDO', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(dataSource, audit);
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ ...policyRow, cutoff_mode: 'VENCIMIENTO_MAS_GRACIA' }])
      .mockResolvedValueOnce([{ '?column?': 1 }]);

    const rejected = await TenantContext.run(tenant, () =>
      service.updatePolicy(baseUpdate, actorId),
    ).catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(UnprocessableEntityException);
    expect((rejected as UnprocessableEntityException).getResponse()).toEqual({
      code: 'BILLING_POLICY_INCOMPATIBLE',
      message: expect.not.stringMatching(/[0-9a-f]{8}-[0-9a-f]{4}/u),
    });
    expect(audit.logWithin).not.toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('permite reiniciar a herencia una sobrescritura VENCIDO usando la política base', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    const manager = { query: jest.fn() };
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager,
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = createService(dataSource, audit);
    const previousOverride = {
      contract_id: '00000000-0000-4000-8000-000000000010',
      tenant_id: tenant.tenantId,
      period_timing: 'VENCIDO',
      generation_lead_days: null,
      payment_term_days: null,
      grace_days: null,
      cutoff_enabled: null,
      first_period_mode: null,
      billing_start_date: null,
      updated_by: null,
      updated_at: baseUpdate.expectedUpdatedAt,
    };
    const savedOverride = { ...previousOverride, period_timing: null, updated_by: actorId };
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([policyRow])
      .mockResolvedValueOnce([previousOverride])
      .mockResolvedValueOnce([savedOverride]);

    const result = await TenantContext.run(tenant, () =>
      service.updateContractPolicy(
        previousOverride.contract_id,
        { periodTiming: null, expectedUpdatedAt: baseUpdate.expectedUpdatedAt },
        actorId,
      ),
    );

    expect(result.data.periodTiming).toBeNull();
    expect(runnerQuery.mock.calls[3]?.[1]?.[2]).toBeNull();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('traduce el FK de contrato ausente a 404 sin exponer el error de PostgreSQL', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(dataSource, audit);
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([policyRow])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce({ driverError: { code: '23503', detail: 'internal detail' } });

    await expect(
      TenantContext.run(tenant, () =>
        service.updateContractPolicy('00000000-0000-4000-8000-000000000099', {}, actorId),
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_CONTRACT_NOT_FOUND', message: 'No se encontró el contrato.' },
    });
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('previsualiza la política propuesta por ciclo sin guardar cambios', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    runnerQuery.mockResolvedValueOnce(undefined).mockResolvedValueOnce([policyRow]);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
    } as unknown as DataSource;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(dataSource, audit);
    billingContractReadPort.listBillingCycles.mockResolvedValue([
      { cycleDay: 1, cutoffDay: 15 },
      { cycleDay: 15, cutoffDay: 30 },
    ]);

    const result = await TenantContext.run(tenant, () =>
      service.preview({
        policy: { periodTiming: 'VENCIDO', cutoffMode: 'VENCIMIENTO_MAS_GRACIA' },
      }),
    );

    expect(result.cycles).toHaveLength(2);
    expect(result.cycles[0]?.items).toHaveLength(3);
    expect(result.cycles[0]?.items[0]?.generationDate).toBe('2026-12-01');
    expect(runnerQuery.mock.calls.map(([query]) => query).join('\n')).not.toMatch(/UPDATE|INSERT/u);
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('previsualiza solo el ciclo del contrato con política base, sobrescritura y propuesta', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([policyRow])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          contract_id: '00000000-0000-4000-8000-000000000010',
          tenant_id: tenant.tenantId,
          period_timing: 'VENCIDO',
          generation_lead_days: 5,
          payment_term_days: null,
          grace_days: null,
          cutoff_enabled: null,
          first_period_mode: null,
          billing_start_date: null,
          updated_by: null,
          updated_at: baseUpdate.expectedUpdatedAt,
        },
      ]);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const audit = { logWithin: jest.fn() } as unknown as AuditService;
    const service = createService(
      { createQueryRunner: jest.fn().mockReturnValue(runner) } as unknown as DataSource,
      audit,
    );
    billingContractReadPort.findBillingCycleByContractId.mockResolvedValue({
      cycleDay: 15,
      cutoffDay: 30,
    });

    const result = await TenantContext.run(tenant, () =>
      service.preview({
        contractId: '00000000-0000-4000-8000-000000000010',
        policy: { cutoffMode: 'VENCIMIENTO_MAS_GRACIA' },
      }),
    );

    expect(result.cycles).toHaveLength(1);
    expect(result.cycles[0]).toMatchObject({ cycleDay: 15, cutoffDay: 30 });
    expect(result.cycles[0]?.items).toHaveLength(3);
    expect(result.cycles[0]?.items[0]?.generationDate).toBe('2026-12-10');
    expect(audit.logWithin).not.toHaveBeenCalled();
  });

  it('devuelve ciclos vacíos para un contrato existente sin ciclo', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    runnerQuery
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([policyRow])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const service = createService(
      { createQueryRunner: jest.fn().mockReturnValue(runner) } as unknown as DataSource,
      { logWithin: jest.fn() } as unknown as AuditService,
    );
    billingContractReadPort.findBillingCycleByContractId.mockResolvedValue({
      cycleDay: null,
      cutoffDay: null,
    });

    const result = await TenantContext.run(tenant, () =>
      service.preview({ contractId: '00000000-0000-4000-8000-000000000010' }),
    );

    expect(result).toEqual({ cycles: [] });
  });

  it('responde 422 para una propuesta incompatible sobre la política efectiva', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    runnerQuery.mockResolvedValueOnce(undefined).mockResolvedValueOnce([policyRow]);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const service = createService(
      { createQueryRunner: jest.fn().mockReturnValue(runner) } as unknown as DataSource,
      { logWithin: jest.fn() } as unknown as AuditService,
    );
    billingContractReadPort.listBillingCycles.mockResolvedValue([{ cycleDay: 1, cutoffDay: 15 }]);

    await expect(
      TenantContext.run(tenant, () => service.preview({ policy: { periodTiming: 'VENCIDO' } })),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'BILLING_POLICY_INCOMPATIBLE' },
    });
  });

  it('responde 404 para un contrato inexistente o anonimizado', async () => {
    const runnerQuery = jest.fn().mockResolvedValue(undefined);
    runnerQuery.mockResolvedValueOnce(undefined).mockResolvedValueOnce([policyRow]);
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: runnerQuery,
      manager: { query: jest.fn() },
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryRunner;
    const service = createService(
      { createQueryRunner: jest.fn().mockReturnValue(runner) } as unknown as DataSource,
      { logWithin: jest.fn() } as unknown as AuditService,
    );
    billingContractReadPort.findBillingCycleByContractId.mockResolvedValue(null);

    await expect(
      TenantContext.run(tenant, () =>
        service.preview({ contractId: '00000000-0000-4000-8000-000000000099' }),
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { code: 'BILLING_CONTRACT_NOT_FOUND' },
    });
  });
});

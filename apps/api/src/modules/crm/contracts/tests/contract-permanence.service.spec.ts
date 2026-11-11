import { ConflictException, NotFoundException } from '@nestjs/common';
import { TenantContext } from '@iwana/db';
import { AuditAction, type PlanPermanenceOffer } from '@iwana/shared';
import { ContractStatus } from '../../enums/contract-status.enum';
import { ContractPermanenceService, toContractPermanence } from '../contract-permanence.service';
import { ContractPermanenceRecord } from '../entities/contract-permanence.entity';
import { SetContractPermanenceBodySchema } from '../contract-permanence.controller';

const TENANT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  schemaName: 'tenant_x',
  tenantSlug: 'x',
};
const CONTRACT_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR = '44444444-4444-4444-8444-444444444444';

const OFFER: PlanPermanenceOffer = {
  connectionFee: 200_000,
  offersPermanence: true,
  months: 12,
  discountedOrDeferredAmount: 120_000,
};

function record(overrides: Partial<ContractPermanenceRecord> = {}): ContractPermanenceRecord {
  return Object.assign(new ContractPermanenceRecord(), {
    contractId: CONTRACT_ID,
    tenantId: TENANT.tenantId,
    accepted: true,
    months: 12,
    connectionFee: '200000.00',
    discountedAmount: '120000.00',
    startDate: null,
    endDate: null,
    voluntarySuspensionDays: 0,
    createdBy: ACTOR,
    updatedBy: ACTOR,
    ...overrides,
  });
}

function build(options: {
  status?: ContractStatus | null;
  existing?: ContractPermanenceRecord | null;
  offer?: PlanPermanenceOffer | null;
  planId?: string;
}) {
  const contract =
    options.status === null
      ? null
      : {
          id: CONTRACT_ID,
          status: options.status ?? ContractStatus.DRAFT,
          planId: options.planId ?? PLAN_ID,
        };
  const manager = {
    findOne: jest.fn(async (entity: unknown) =>
      entity === ContractPermanenceRecord ? (options.existing ?? null) : contract,
    ),
    create: jest.fn((_entity: unknown, data: object) =>
      Object.assign(new ContractPermanenceRecord(), data),
    ),
    save: jest.fn(async (_entity: unknown, data: ContractPermanenceRecord) => data),
  };
  const dataSource = {
    createQueryRunner: jest.fn(() => ({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(),
      isTransactionActive: true,
      manager,
    })),
  };
  const port = {
    getOffer: jest.fn().mockResolvedValue(options.offer === undefined ? OFFER : options.offer),
  };
  const audit = { logWithin: jest.fn().mockResolvedValue(undefined) };
  const service = new ContractPermanenceService(dataSource as never, port as never, audit as never);
  return { service, manager, port, audit };
}

const inTenant = <T>(fn: () => Promise<T>) => TenantContext.run(TENANT, fn);

describe('ContractPermanenceService (bloque H)', () => {
  it('acepta en DRAFT copiando cargo, meses y valor de la oferta, sin fechas', async () => {
    const { service, audit, manager } = build({});
    const view = await inTenant(() => service.set(CONTRACT_ID, true, ACTOR));
    expect(view.permanence).toMatchObject({
      accepted: true,
      months: 12,
      connectionFee: 200_000,
      discountedOrDeferredAmount: 120_000,
      startDate: null,
      endDate: null,
    });
    expect(view.permanence.schedule).toHaveLength(12);
    expect(view.planOffer).toEqual(OFFER);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(audit.logWithin).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CREATE, entityType: 'ContractPermanence' }),
      manager,
    );
  });

  it('rechazar siempre es posible, aun si el plan no ofrece permanencia', async () => {
    const { service, audit } = build({ offer: null, existing: record() });
    const view = await inTenant(() => service.set(CONTRACT_ID, false, ACTOR));
    expect(view.permanence).toEqual({
      accepted: false,
      months: null,
      connectionFee: null,
      discountedOrDeferredAmount: null,
      startDate: null,
      endDate: null,
      schedule: [],
    });
    expect(audit.logWithin.mock.calls[0][0].action).toBe(AuditAction.UPDATE);
  });

  it('409 PLAN_WITHOUT_PERMANENCE si el plan no la ofrece', async () => {
    const { service } = build({
      offer: {
        connectionFee: 0,
        offersPermanence: false,
        months: null,
        discountedOrDeferredAmount: null,
      },
    });
    await expect(inTenant(() => service.set(CONTRACT_ID, true, ACTOR))).rejects.toMatchObject({
      response: { code: 'PLAN_WITHOUT_PERMANENCE' },
    });
  });

  it('plan con id no UUID se trata como sin oferta', async () => {
    const { service, port } = build({ planId: 'plan-legacy' });
    await expect(inTenant(() => service.set(CONTRACT_ID, true, ACTOR))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(port.getOffer).not.toHaveBeenCalled();
  });

  it.each([ContractStatus.ACTIVE, ContractStatus.SUSPENDED, ContractStatus.TERMINATED])(
    '409 CONTRACT_NOT_DRAFT con estado %s',
    async (status) => {
      const { service, manager } = build({ status });
      await expect(inTenant(() => service.set(CONTRACT_ID, false, ACTOR))).rejects.toMatchObject({
        response: { code: 'CONTRACT_NOT_DRAFT' },
      });
      expect(manager.save).not.toHaveBeenCalled();
    },
  );

  it('404 si el contrato no está en el tenant', async () => {
    const { service } = build({ status: null });
    await expect(inTenant(() => service.get(CONTRACT_ID))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('get sin registro devuelve la opción sin permanencia y la oferta', async () => {
    const { service } = build({});
    const view = await inTenant(() => service.get(CONTRACT_ID));
    expect(view.permanence.accepted).toBe(false);
    expect(view.planOffer).toEqual(OFFER);
  });

  it('applyActivationDate fija inicio y fin una sola vez', async () => {
    const existing = record();
    const { service, manager } = build({ existing });
    const result = await inTenant(() =>
      service.applyActivationDate(manager as never, CONTRACT_ID, '2026-11-11'),
    );
    expect(result).toMatchObject({ startDate: '2026-11-11', endDate: '2027-11-11' });
    manager.save.mockClear();
    await inTenant(() => service.applyActivationDate(manager as never, CONTRACT_ID, '2026-12-01'));
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('applyActivationDate sin permanencia no escribe', async () => {
    const { service, manager } = build({ existing: null });
    const result = await inTenant(() =>
      service.applyActivationDate(manager as never, CONTRACT_ID, '2026-11-11'),
    );
    expect(result.accepted).toBe(false);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('shiftForVoluntarySuspension corre el fin y acumula días', async () => {
    const existing = record({ startDate: '2026-11-11', endDate: '2027-11-11' });
    const { service, manager } = build({ existing });
    const result = await inTenant(() =>
      service.shiftForVoluntarySuspension(manager as never, CONTRACT_ID, 20),
    );
    expect(result.endDate).toBe('2027-12-01');
    expect(existing.voluntarySuspensionDays).toBe(20);
  });

  it('shiftForVoluntarySuspension sin fin fijado no escribe', async () => {
    const { service, manager } = build({ existing: record() });
    await inTenant(() => service.shiftForVoluntarySuspension(manager as never, CONTRACT_ID, 5));
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('toContractPermanence de un registro sin aceptar es la opción vacía', () => {
    expect(toContractPermanence(record({ accepted: false })).schedule).toEqual([]);
  });

  it('el cuerpo solo admite accepted booleano', () => {
    expect(SetContractPermanenceBodySchema.safeParse({ accepted: true }).success).toBe(true);
    expect(SetContractPermanenceBodySchema.safeParse({ accepted: 'yes' }).success).toBe(false);
    expect(SetContractPermanenceBodySchema.safeParse({ accepted: true, months: 3 }).success).toBe(
      false,
    );
  });
});

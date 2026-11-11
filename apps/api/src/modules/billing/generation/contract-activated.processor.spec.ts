import { TenantContext } from '@iwana/db';
import { CONTRACT_ACTIVATED_EVENT_TYPE, TenantStatus } from '@iwana/shared';
import { UnrecoverableError } from 'bullmq';
import { periodContaining } from './billing-generation.service';
import { ContractActivatedProcessor } from './contract-activated.processor';

const TENANT = '11111111-1111-4111-8111-111111111111';
const CONTRACT = '22222222-2222-4222-8222-222222222222';
const SUBSCRIBER = '33333333-3333-4333-8333-333333333333';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    eventId: '44444444-4444-4444-8444-444444444444',
    eventType: CONTRACT_ACTIVATED_EVENT_TYPE,
    tenantId: TENANT,
    aggregateId: CONTRACT,
    occurredAt: '2026-11-11T15:00:00.000Z',
    payload: {
      tenantId: TENANT,
      contractId: CONTRACT,
      subscriberId: SUBSCRIBER,
      activatedAt: '2026-11-11T14:00:00.000Z',
      billingStartDate: '2026-11-10',
      source: 'SIGNATURE',
    },
    ...overrides,
  };
}

const summary = (overrides: Record<string, number> = {}) => ({
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

function fixture() {
  const tenant = {
    id: TENANT,
    schemaName: 'tenant_first_charge',
    slug: 'fixture',
    status: TenantStatus.ACTIVE,
    deletedAt: null,
  };
  const tenants = { findTenantLifecycleById: jest.fn().mockResolvedValue(tenant) };
  const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
  const generation = {
    generate: jest.fn().mockResolvedValue(summary({ generated: 1 })),
    automaticGenerationEnabled: jest.fn().mockResolvedValue(false),
  };
  const activationEvents = {
    findActivationEvent: jest.fn().mockResolvedValue({
      eventId: '44444444-4444-4444-8444-444444444444',
      tenantId: TENANT,
      contractId: CONTRACT,
      published: true,
      billingStartDate: '2026-11-10',
      contractStatus: 'ACTIVE',
    }),
  };
  const processor = new ContractActivatedProcessor(
    tenants as never,
    settings as never,
    generation as never,
    activationEvents as never,
  );
  return { processor, tenants, generation, activationEvents };
}

const job = (data: unknown, name: string = CONTRACT_ACTIVATED_EVENT_TYPE) =>
  ({ name, data }) as never;

describe('ContractActivatedProcessor (ADR-109 D6, CA-3)', () => {
  it('genera el primer cobro anclado en billingStartDate dentro del tenant del registro', async () => {
    const { processor, generation } = fixture();
    let seenSchema: string | undefined;
    generation.generate.mockImplementation(async () => {
      seenSchema = TenantContext.getOrThrow().schemaName;
      return summary({ generated: 1 });
    });

    await expect(processor.process(job(envelope()))).resolves.toBe('generated');
    expect(seenSchema).toBe('tenant_first_charge');
    expect(generation.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: CONTRACT,
        firstChargeFrom: '2026-11-10',
        actorId: null,
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
      }),
    );
  });

  it('genera aunque la política tenga el lote automático apagado', async () => {
    const { processor, generation } = fixture();
    await processor.process(job(envelope()));
    expect(generation.automaticGenerationEnabled).not.toHaveBeenCalled();
    expect(generation.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['existing', summary({ existing: 1 })],
    ['blocked', summary({ blocked: 1 })],
    ['omittedImpersonation', summary({ omittedImpersonation: 1 })],
    ['withoutCycle', summary({ withoutCycle: 1 })],
  ])('completa sin reintentar cuando el resultado es %s', async (expected, result) => {
    const { processor, generation } = fixture();
    generation.generate.mockResolvedValue(result);
    await expect(processor.process(job(envelope()))).resolves.toBe(expected);
  });

  it('reintenta (error recuperable) si la generación falla o el contrato aún no es legible', async () => {
    const { processor, generation } = fixture();
    generation.generate.mockResolvedValueOnce(summary({ failed: 1 }));
    const failed = processor.process(job(envelope()));
    await expect(failed).rejects.toBeInstanceOf(Error);
    await expect(failed).rejects.not.toBeInstanceOf(UnrecoverableError);

    generation.generate.mockResolvedValueOnce(summary());
    const missing = processor.process(job(envelope()));
    await expect(missing).rejects.toBeInstanceOf(Error);
    await expect(missing).rejects.not.toBeInstanceOf(UnrecoverableError);
  });

  it.each([
    ['nombre de job ajeno', job(envelope(), 'otro.evento')],
    ['aggregateId distinto del contrato', job(envelope({ aggregateId: SUBSCRIBER }))],
    ['tenant del payload distinto', job(envelope({ tenantId: SUBSCRIBER }))],
    ['campos extra con PII', job({ ...envelope(), email: 'x@example.test' })],
    ['payload no objeto', job('crm.contract.activated')],
  ])('rechaza sin reintento: %s', async (_label, candidate) => {
    const { processor, generation } = fixture();
    await expect(processor.process(candidate)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(generation.generate).not.toHaveBeenCalled();
  });

  it('rechaza sin reintento un tenant inactivo, borrado o inexistente', async () => {
    for (const tenant of [
      null,
      { id: TENANT, schemaName: 's', slug: 's', status: TenantStatus.SUSPENDED, deletedAt: null },
      {
        id: TENANT,
        schemaName: 's',
        slug: 's',
        status: TenantStatus.ACTIVE,
        deletedAt: new Date(),
      },
    ]) {
      const { processor, tenants, generation } = fixture();
      tenants.findTenantLifecycleById.mockResolvedValue(tenant);
      await expect(processor.process(job(envelope()))).rejects.toBeInstanceOf(UnrecoverableError);
      expect(generation.generate).not.toHaveBeenCalled();
    }
  });
});

describe('periodContaining', () => {
  it.each([
    [5, '2026-11-11', '2026-11-05', '2026-12-04'],
    [5, '2026-11-05', '2026-11-05', '2026-12-04'],
    [5, '2026-11-04', '2026-10-05', '2026-11-04'],
    [5, '2026-01-03', '2025-12-05', '2026-01-04'],
    [1, '2026-02-28', '2026-02-01', '2026-02-28'],
  ])('ciclo %i, fecha %s → %s..%s', (cycle, date, start, end) => {
    expect(periodContaining(cycle, date)).toEqual({ periodStart: start, periodEnd: end });
  });

  describe('SEC-3: la fecha sale del outbox de CRM, nunca del payload', () => {
    it('ignora un billingStartDate falsificado en el payload', async () => {
      const { processor, generation, activationEvents } = fixture();
      const forged = envelope({
        payload: { ...envelope().payload, billingStartDate: '2020-01-01' },
      });
      await processor.process(job(forged));
      expect(activationEvents.findActivationEvent).toHaveBeenCalledWith(
        '44444444-4444-4444-8444-444444444444',
      );
      expect(generation.generate).toHaveBeenCalledWith(
        expect.objectContaining({ firstChargeFrom: '2026-11-10' }),
      );
    });

    it.each([
      ['inexistente', null],
      ['de otro contrato', { contractId: '99999999-9999-4999-8999-999999999999' }],
      ['de otro tenant', { tenantId: '88888888-8888-4888-8888-888888888888' }],
      ['con contrato no activo', { contractStatus: 'DRAFT' }],
      ['sin fecha', { billingStartDate: null }],
    ])('rechaza sin reintento un evento %s', async (_name, change) => {
      const { processor, generation, activationEvents } = fixture();
      if (change === null) activationEvents.findActivationEvent.mockResolvedValue(null);
      else {
        activationEvents.findActivationEvent.mockResolvedValue({
          eventId: '44444444-4444-4444-8444-444444444444',
          tenantId: TENANT,
          contractId: CONTRACT,
          published: true,
          billingStartDate: '2026-11-10',
          contractStatus: 'ACTIVE',
          ...change,
        });
      }
      await expect(processor.process(job(envelope()))).rejects.toBeInstanceOf(UnrecoverableError);
      expect(generation.generate).not.toHaveBeenCalled();
    });

    it('un aggregateId que no coincide con el contrato del outbox se rechaza', async () => {
      const { processor, generation } = fixture();
      await expect(
        processor.process(job(envelope({ aggregateId: '99999999-9999-4999-8999-999999999999' }))),
      ).rejects.toBeInstanceOf(UnrecoverableError);
      expect(generation.generate).not.toHaveBeenCalled();
    });

    it('un evento aún no marcado publicado se reintenta (error recuperable)', async () => {
      const { processor, generation, activationEvents } = fixture();
      activationEvents.findActivationEvent.mockResolvedValue({
        eventId: '44444444-4444-4444-8444-444444444444',
        tenantId: TENANT,
        contractId: CONTRACT,
        published: false,
        billingStartDate: '2026-11-10',
        contractStatus: 'ACTIVE',
      });
      const error = await processor.process(job(envelope())).catch((caught: Error) => caught);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(UnrecoverableError);
      expect(generation.generate).not.toHaveBeenCalled();
    });
  });
});

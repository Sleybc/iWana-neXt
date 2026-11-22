import { UnrecoverableError } from 'bullmq';
import { TenantStatus } from '@iwana/shared';
import { BillingGenerationProcessor } from './billing-generation.processor';
import { BILLING_GENERATION_JOB } from './billing-generation.constants';

describe('BR-2.1 programación y ejecución', () => {
  const tenant = {
    id: '11111111-1111-4111-8111-111111111111',
    schemaName: 'tenant_processor_test',
    slug: 'fixture',
    status: TenantStatus.ACTIVE,
    deletedAt: null,
  };
  function fixture() {
    const queue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      removeJobScheduler: jest.fn().mockResolvedValue(true),
    };
    const tenants = {
      listActiveTenantContexts: jest.fn().mockResolvedValue([tenant]),
      findTenantLifecycleById: jest.fn().mockResolvedValue(tenant),
    };
    const settings = { getSnapshot: jest.fn().mockResolvedValue({ timezone: 'America/Bogota' }) };
    const generation = {
      getGenerationSchedule: jest.fn().mockResolvedValue(6),
      automaticGenerationEnabled: jest.fn().mockResolvedValue(false),
      generate: jest.fn(),
    };
    return {
      queue,
      tenants,
      generation,
      processor: new BillingGenerationProcessor(
        queue as never,
        tenants as never,
        settings as never,
        generation as never,
      ),
    };
  }
  it('comprueba la bandera en cada ejecución y permite activarla sin reiniciar', async () => {
    const { processor, generation } = fixture();
    const job = {
      name: BILLING_GENERATION_JOB,
      data: { tenantId: tenant.id, schemaName: tenant.schemaName, localDate: '2026-11-05' },
    };
    await processor.process(job as never);
    expect(generation.generate).not.toHaveBeenCalled();
    generation.automaticGenerationEnabled.mockResolvedValue(true);
    await processor.process(job as never);
    expect(generation.generate).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['inexistente', null],
    ['retirada', { ...tenant, status: TenantStatus.MARKED_FOR_DELETION, deletedAt: new Date() }],
  ])(
    'K: con una empresa %s el programador se retira a sí mismo y el job no falla',
    async (_case, lifecycle) => {
      const { processor, tenants, queue, generation } = fixture();
      tenants.findTenantLifecycleById.mockResolvedValue(lifecycle);
      const job = {
        name: BILLING_GENERATION_JOB,
        data: { tenantId: tenant.id, schemaName: tenant.schemaName, localDate: '2026-11-05' },
      };

      await expect(processor.process(job as never)).resolves.toBeUndefined();
      expect(queue.removeJobScheduler).toHaveBeenCalledWith(
        `billing-generation:${tenant.schemaName}`,
      );
      expect(generation.generate).not.toHaveBeenCalled();
    },
  );
  it.each([TenantStatus.SUSPENDED, TenantStatus.INACTIVE])(
    'una empresa %s termina sin trabajo, sin fallar, y conserva su programador',
    async (status) => {
      const { processor, tenants, queue, generation } = fixture();
      tenants.findTenantLifecycleById.mockResolvedValue({ ...tenant, status });
      const job = {
        name: BILLING_GENERATION_JOB,
        data: { tenantId: tenant.id, schemaName: tenant.schemaName, localDate: '2026-11-05' },
      };
      await expect(processor.process(job as never)).resolves.toBeUndefined();
      expect(queue.removeJobScheduler).not.toHaveBeenCalled();
      expect(generation.generate).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['PROVISIONING', { status: TenantStatus.PROVISIONING }],
    ['PROVISIONING_FAILED', { status: TenantStatus.PROVISIONING_FAILED }],
    ['schema del job distinto', { schemaName: 'tenant_otro' }],
    ['schema inválido en una empresa ACTIVE', { schemaName: 'public; DROP TABLE x' }],
  ])('rechaza sin reintento: %s', async (_case, override) => {
    const { processor, tenants, queue, generation } = fixture();
    tenants.findTenantLifecycleById.mockResolvedValue({ ...tenant, ...override });
    const job = {
      name: BILLING_GENERATION_JOB,
      data: { tenantId: tenant.id, schemaName: tenant.schemaName, localDate: '2026-11-05' },
    };
    await expect(processor.process(job as never)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    expect(generation.generate).not.toHaveBeenCalled();
  });
  it('al retirar el programador de una empresa marcada usa el schema de la fila', async () => {
    const { processor, tenants, queue } = fixture();
    tenants.findTenantLifecycleById.mockResolvedValue({
      ...tenant,
      schemaName: 'tenant_de_la_fila',
      status: TenantStatus.MARKED_FOR_DELETION,
      deletedAt: new Date(),
    });
    const job = {
      name: BILLING_GENERATION_JOB,
      data: { tenantId: tenant.id, schemaName: tenant.schemaName, localDate: '2026-11-05' },
    };
    await processor.process(job as never);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('billing-generation:tenant_de_la_fila');
  });
  it('K: al marcar una empresa se retira su programador; al restaurarla se vuelve a programar', async () => {
    const { processor, queue } = fixture();
    await processor.onTenantRetired({ tenantId: tenant.id, schemaName: tenant.schemaName });
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      `billing-generation:${tenant.schemaName}`,
    );
    await processor.onTenantRestored();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      `billing-generation:${tenant.schemaName}`,
      expect.anything(),
      expect.anything(),
    );
  });
  it('reemplaza el horario con el mismo scheduler estable', async () => {
    const { processor, queue, generation } = fixture();
    await processor.onApplicationBootstrap();
    generation.getGenerationSchedule.mockResolvedValue(9);
    await processor.onApplicationBootstrap();
    expect(queue.upsertJobScheduler.mock.calls.map((args: unknown[]) => args.slice(0, 2))).toEqual([
      [`billing-generation:${tenant.schemaName}`, { pattern: '0 6 * * *', tz: 'America/Bogota' }],
      [`billing-generation:${tenant.schemaName}`, { pattern: '0 9 * * *', tz: 'America/Bogota' }],
    ]);
  });
  it('un tenant que falla no impide programar los siguientes', async () => {
    const { processor, tenants, queue, generation } = fixture();
    tenants.listActiveTenantContexts.mockResolvedValue([
      tenant,
      { ...tenant, id: '22222222-2222-4222-8222-222222222222', schemaName: 'tenant_other' },
    ]);
    generation.getGenerationSchedule.mockRejectedValueOnce(new Error('fixture'));
    await expect(processor.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
  });
});

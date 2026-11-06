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
    const queue = { upsertJobScheduler: jest.fn().mockResolvedValue(undefined) };
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

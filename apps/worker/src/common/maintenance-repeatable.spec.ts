import { MAINTENANCE_JOB_RETENTION } from '@iwana/shared';
import { registerMaintenanceRepeatable } from './maintenance-repeatable';
import { SchedulerService } from '../services/scheduler.service';
import { EvidenceOrphanDetectionProcessor } from '../processors/evidence-orphan-detection.processor';
import { ExecutionOrderTombstoneProcessor } from '../processors/execution-order-tombstone.processor';
import { ContractMediaSweepProcessor } from '../processors/contract-media-sweep.processor';
import { TenantUsageSamplerProcessor } from '../processors/tenant-usage-sampler.processor';

/** Cola doble que registra el orden de removeRepeatable y add. */
function queueDouble() {
  return {
    add: jest.fn().mockResolvedValue(undefined),
    removeRepeatable: jest.fn().mockResolvedValue(true),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  };
}

function expectMaintenanceRepeatable(
  queue: ReturnType<typeof queueDouble>,
  name: string,
  pattern: string,
  jobId: string,
): void {
  expect(queue.removeRepeatable).toHaveBeenCalledWith(name, { pattern }, jobId);
  expect(queue.add).toHaveBeenCalledWith(
    name,
    expect.anything(),
    expect.objectContaining({ repeat: { pattern }, jobId, ...MAINTENANCE_JOB_RETENTION }),
  );
  const removeOrder = queue.removeRepeatable.mock.invocationCallOrder;
  const addOrder = queue.add.mock.invocationCallOrder;
  const removeIndex = queue.removeRepeatable.mock.calls.findIndex((call) => call[0] === name);
  const addIndex = queue.add.mock.calls.findIndex((call) => call[0] === name);
  expect(removeOrder[removeIndex]).toBeLessThan(addOrder[addIndex] as number);
}

const config = { get: (_key: string, fallback?: unknown) => fallback } as never;

describe('B(b) — retención de mantenimiento (familia M) en los productores del worker', () => {
  it('la familia M conserva 7 días y 50 fallidos, y 50 completados', () => {
    expect(MAINTENANCE_JOB_RETENTION).toEqual({
      removeOnComplete: { count: 50 },
      removeOnFail: { age: 604_800, count: 50 },
    });
  });

  it('registerMaintenanceRepeatable retira el repetible antes de registrarlo con la retención', async () => {
    const queue = queueDouble();
    await registerMaintenanceRepeatable(queue as never, 'x', { pattern: '0 1 * * *' }, 'x-id', {
      a: 1,
    });
    expectMaintenanceRepeatable(queue, 'x', '0 1 * * *', 'x-id');
    expect(queue.add.mock.calls[0]?.[1]).toEqual({ a: 1 });
  });

  it('scheduler: purga de refresh tokens y purga de schemas', async () => {
    const purge = queueDouble();
    const schemas = queueDouble();
    await new SchedulerService(purge as never, schemas as never).onApplicationBootstrap();
    expectMaintenanceRepeatable(
      purge,
      'purge-expired-tokens',
      '0 3 * * *',
      'refresh-token-purge-daily',
    );
    expectMaintenanceRepeatable(
      schemas,
      'purge-marked-tenant-schemas',
      '30 3 * * *',
      'tenant-schema-purge-daily',
    );
  });

  it('revisión de evidencias huérfanas', async () => {
    const queue = queueDouble();
    await new EvidenceOrphanDetectionProcessor(config, queue as never, {
      deleteObject: jest.fn(),
    }).onApplicationBootstrap();
    expectMaintenanceRepeatable(
      queue,
      'detect-orphans-recurring',
      '0 */6 * * *',
      'evidence-orphan-detection-recurring',
    );
  });

  it('tombstone de órdenes de ejecución', async () => {
    const queue = queueDouble();
    await new ExecutionOrderTombstoneProcessor(config, queue as never).onApplicationBootstrap();
    expectMaintenanceRepeatable(
      queue,
      'compact-execution-tombstones',
      '0 4 * * *',
      'execution-tombstone-daily',
    );
  });

  it('barrido de medios de contratos', async () => {
    const queue = queueDouble();
    const processor = new ContractMediaSweepProcessor(
      {} as never,
      { listObjects: jest.fn(), deleteObject: jest.fn() } as never,
      queue as never,
    );
    await processor.onApplicationBootstrap();
    expect(queue.removeRepeatable).toHaveBeenCalledTimes(1);
    const [name, repeat, jobId] = queue.removeRepeatable.mock.calls[0] as [
      string,
      { pattern: string },
      string,
    ];
    expectMaintenanceRepeatable(queue, name, repeat.pattern, jobId);
  });

  it('muestreador de uso: el programador usa la retención M', async () => {
    const queue = queueDouble();
    await new TenantUsageSamplerProcessor({} as never, queue as never).onApplicationBootstrap();
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ opts: MAINTENANCE_JOB_RETENTION }),
    );
  });
});

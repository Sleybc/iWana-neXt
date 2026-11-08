import { UnrecoverableError } from 'bullmq';
import { RetentionExpiryProcessor } from './retention-expiry.processor';

const TENANT = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';

function processorWith(overrides: Record<string, unknown> = {}): {
  processor: RetentionExpiryProcessor;
  queue: { add: jest.Mock };
  service: { runTenantBatch: jest.Mock };
  dataSource: { query: jest.Mock };
} {
  const queue = { add: jest.fn(async () => undefined) };
  const service = { runTenantBatch: jest.fn(async () => ({ status: 'COMPLETE' })) };
  const queryRunner = {
    connect: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => undefined),
    query: jest.fn(async () => undefined),
    commitTransaction: jest.fn(async () => undefined),
    rollbackTransaction: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    manager: {},
  };
  const dataSource = {
    query: jest.fn(async () => []),
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const processor = new RetentionExpiryProcessor(
    dataSource as never,
    queue as never,
    service as never,
  );
  Object.assign(processor, overrides);
  return { processor, queue, service, dataSource };
}

describe('RetentionExpiryProcessor (H-EXP B2, ADR-105)', () => {
  it('rechaza como terminal un payload con campos de más', async () => {
    const { processor } = processorWith();
    await expect(
      processor.process({
        name: 'privacy-retention-expiry-tenant',
        data: { version: 1, tenantId: TENANT, runId: RUN, schemaName: 'tenant_demo' },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('rechaza como terminal un tenant inactivo o borrado sin tocar tablas tenant', async () => {
    const { processor, dataSource, service } = processorWith();
    dataSource.query.mockResolvedValueOnce([
      {
        id: TENANT,
        slug: 'demo',
        schema_name: 'tenant_demo',
        status: 'INACTIVE',
        deleted_at: null,
      },
    ]);
    await expect(
      processor.process({
        name: 'privacy-retention-expiry-tenant',
        data: { version: 1, tenantId: TENANT, runId: RUN },
      } as never),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(service.runTenantBatch).not.toHaveBeenCalled();
  });

  it('reencola el siguiente lote mientras el resultado sea CONTINUE', async () => {
    const { processor, queue, dataSource, service } = processorWith();
    dataSource.query.mockResolvedValueOnce([
      { id: TENANT, slug: 'demo', schema_name: 'tenant_demo', status: 'ACTIVE', deleted_at: null },
    ]);
    service.runTenantBatch.mockResolvedValueOnce({
      status: 'CONTINUE',
      nextCursor: { phase: 'TITULAR', eligibleOn: '2026-11-08', id: TENANT },
      counts: { titulares: 100, prospectos: 0, solicitudes: 0, failed: 0 },
      reasonCounts: {},
    });
    await processor.process({
      name: 'privacy-retention-expiry-tenant',
      data: { version: 1, tenantId: TENANT, runId: RUN },
    } as never);
    expect(queue.add).toHaveBeenCalledWith(
      'privacy-retention-expiry-tenant',
      { version: 1, tenantId: TENANT, runId: RUN },
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('programa el barrido diario a las 04:00 de Bogotá al arrancar', async () => {
    const { processor, queue } = processorWith();
    await processor.onApplicationBootstrap();
    expect(queue.add).toHaveBeenCalledWith(
      'privacy-retention-expiry-sweep',
      {},
      expect.objectContaining({
        repeat: expect.objectContaining({ pattern: '0 4 * * *', tz: 'America/Bogota' }),
      }),
    );
  });
});

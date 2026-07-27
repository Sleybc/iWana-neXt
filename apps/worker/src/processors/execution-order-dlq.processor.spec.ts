import { ConfigService } from '@nestjs/config';
import { ExecutionOrderDlqProcessor } from './execution-order-dlq.processor';
import type { Job } from 'bullmq';

function mockConfig(): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal: string) => defaultVal),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
}

describe('ExecutionOrderDlqProcessor', () => {
  let processor: ExecutionOrderDlqProcessor;
  let poolClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    poolClient = { query: jest.fn(), release: jest.fn() };
    processor = new ExecutionOrderDlqProcessor(mockConfig());
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(poolClient),
    } as never;
  });

  it('registra el evento fallido en el outbox con last_error', async () => {
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE outbox
      .mockResolvedValueOnce({ rowCount: 1 }); // INSERT inbox

    const dlqJob = {
      data: {
        tenantId: 't0000000-0000-4000-8000-000000000001',
        envelope: {
          eventId: 'e0000000-0000-4000-8000-000000000001',
          eventType: 'ExecutionOrderStartedV1' as const,
          tenantId: 't0000000-0000-4000-8000-000000000001',
          aggregateId: 'a0000000-0000-4000-8000-000000000001',
          aggregateVersion: 1,
          occurredAt: new Date().toISOString(),
          correlationId: 'c0000000-0000-4000-8000-000000000001',
          payload: {} as never,
        },
        diagnostic: {
          failedAt: new Date().toISOString(),
          attemptsMade: 8,
          jobId: 'job-001',
          errorMessage: 'Connection timeout',
          errorName: 'Error',
        },
      },
    } as Job;

    await processor.process(dlqJob);

    const updateQuery = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('UPDATE execution_order_outbox_events'),
    );
    expect(updateQuery).toBeDefined();
    // updateQuery call = [sql, [eventId, tenantId, jsonString]]
    const updateParams = updateQuery![1] as unknown[];
    expect(updateParams).toBeDefined();
    expect(updateParams[2]).toContain('attemptsMade');
    expect(updateParams[2]).toContain('Connection timeout');

    const inboxQuery = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('INSERT INTO execution_order_inbox_events'),
    );
    expect(inboxQuery).toBeDefined();
    // inboxQuery call = [sql, [tenantId, consumer, eventId, aggregateId, version, dlqMsg]]
    expect((inboxQuery![1] as unknown[])[5]).toContain('DLQ:');
  });

  it('no lanza error si el tenant no existe', async () => {
    poolClient.query.mockResolvedValueOnce({ rows: [] } as never); // Sin tenant

    const dlqJob = {
      data: {
        tenantId: 't-dead-dead-dead-dead',
        envelope: {
          eventId: 'e0000000-0000-4000-8000-000000000002',
          eventType: 'ExecutionOrderClosedV1' as const,
          tenantId: 't-dead-dead-dead-dead',
          aggregateId: 'a0000000-0000-4000-8000-000000000002',
          aggregateVersion: 2,
          occurredAt: new Date().toISOString(),
          correlationId: 'c0000000-0000-4000-8000-000000000002',
          payload: {} as never,
        },
        diagnostic: {
          failedAt: new Date().toISOString(),
          attemptsMade: 8,
          errorMessage: 'Unknown error',
          errorName: 'Error',
        },
      },
    } as Job;

    // Debe completar sin lanzar
    await expect(processor.process(dlqJob)).resolves.toBeUndefined();
  });
});

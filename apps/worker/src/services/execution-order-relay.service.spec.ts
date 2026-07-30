import { ConfigService } from '@nestjs/config';
import { ExecutionOrderRelayService } from './execution-order-relay.service';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type TestMock = jest.MockedFunction<(...args: never[]) => Promise<unknown>>;

function mockConfig(config: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn(
      (key: string, defaultVal: string) => config[key] ?? defaultVal,
    ) as unknown as TestMock,
    getOrThrow: jest.fn() as unknown as TestMock,
  } as unknown as ConfigService;
}

describe('ExecutionOrderRelayService', () => {
  let relayService: ExecutionOrderRelayService;
  let eventsQueue: { add: TestMock };
  let relayQueue: { add: TestMock };
  let poolClient: {
    query: TestMock;
    release: TestMock;
  };

  beforeEach(() => {
    eventsQueue = {
      add: jest.fn<(...args: never[]) => Promise<unknown>>().mockResolvedValue(undefined),
    };
    relayQueue = {
      add: jest.fn<(...args: never[]) => Promise<unknown>>().mockResolvedValue(undefined),
    };
    poolClient = {
      query: jest.fn<(...args: never[]) => Promise<unknown>>(),
      release: jest.fn<(...args: never[]) => Promise<unknown>>(),
    };

    relayService = new ExecutionOrderRelayService(
      mockConfig(),
      relayQueue as unknown as Queue,
      eventsQueue as unknown as Queue,
    );

    (relayService as unknown as { pool: { connect: TestMock } }).pool = {
      connect: jest.fn<(...args: never[]) => Promise<unknown>>().mockResolvedValue(poolClient),
    } as never;
  });

  it('escanea tenants activos y encola eventos pendientes', async () => {
    poolClient.query
      // SELECT tenants
      .mockResolvedValueOnce({
        rows: [{ id: 't1', schema_name: 'tenant_test001' }],
      } as never)
      // BEGIN
      .mockResolvedValueOnce(undefined)
      // SET LOCAL
      .mockResolvedValueOnce(undefined)
      // UPDATE outbox (lease) — retorna 1 fila
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: 'e0000000-0000-4000-8000-000000000001',
            tenant_id: 't1',
            aggregate_id: 'a0000000-0000-4000-8000-000000000001',
            aggregate_version: 1,
            event_type: 'ExecutionOrderStartedV1',
            payload: {
              executionOrderId: 'a0000000-0000-4000-8000-000000000001',
            },
            correlation_id: 'c0000000-0000-4000-8000-000000000001',
            occurred_at: new Date().toISOString(),
          },
        ],
      } as never)
      // COMMIT lease
      .mockResolvedValueOnce(undefined)
      // BEGIN mark
      .mockResolvedValueOnce(undefined)
      // SET LOCAL para mark
      .mockResolvedValueOnce(undefined)
      // UPDATE mark published
      .mockResolvedValueOnce(undefined)
      // COMMIT mark
      .mockResolvedValueOnce(undefined);

    const relayed = await relayService.scanAndRelay(100);

    expect(relayed).toBe(1);
    expect(eventsQueue.add).toHaveBeenCalledWith(
      'deliver-execution-event',
      expect.objectContaining({
        tenantId: 't1',
        envelope: expect.objectContaining({
          eventId: 'e0000000-0000-4000-8000-000000000001',
          eventType: 'ExecutionOrderStartedV1',
        }),
      }),
      expect.objectContaining({
        jobId: 'execution-event-e0000000-0000-4000-8000-000000000001',
        attempts: 8,
        backoff: expect.objectContaining({ type: 'exponential', delay: 1000 }),
      }),
    );
  });

  it('excluye tenants con schema inválido', async () => {
    poolClient.query
      .mockResolvedValueOnce({
        rows: [
          { id: 't1', schema_name: 'invalid_schema' },
          { id: 't2', schema_name: 'tenant_valid001' },
        ],
      } as never)
      // tenant t2: BEGIN
      .mockResolvedValueOnce(undefined)
      // SET LOCAL
      .mockResolvedValueOnce(undefined)
      // UPDATE sin filas
      .mockResolvedValueOnce({ rows: [] } as never)
      // COMMIT
      .mockResolvedValueOnce(undefined);

    const relayed = await relayService.scanAndRelay(100);
    expect(relayed).toBe(0);
  });

  it('devuelve métricas de eventos pendientes por tenant', async () => {
    poolClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 't1', schema_name: 'tenant_test001' }],
      } as never)
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({
        rows: [
          {
            pending_count: '5',
            oldest_age_seconds: '120',
            dlq_size: '2',
            lag_count: '5',
            lag_min_seconds: '3',
            lag_p50_seconds: '30',
            lag_p95_seconds: '120',
            lag_p99_seconds: '120',
            lag_max_seconds: '120',
          },
        ],
      } as never)
      .mockResolvedValueOnce(undefined); // COMMIT

    const metrics = await relayService.getPendingEventsPerTenant();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.pendingCount).toBe(5);
    expect(metrics[0]!.oldestAgeSeconds).toBe(120);
    expect(metrics[0]!.dlqSize).toBe(2);
    expect(metrics[0]!.lagDistributionSeconds.p95Seconds).toBe(120);
  });

  it('distingue un fallo de enqueue de un fallo de marcado', async () => {
    const row = {
      event_id: 'e0000000-0000-4000-8000-000000000002',
      tenant_id: 't1',
      aggregate_id: 'a0000000-0000-4000-8000-000000000001',
      aggregate_version: 1,
      event_type: 'ExecutionOrderStartedV1',
      payload: { executionOrderId: 'a0000000-0000-4000-8000-000000000001' },
      correlation_id: 'c0000000-0000-4000-8000-000000000001',
      occurred_at: new Date().toISOString(),
    };
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // BEGIN lease
      .mockResolvedValueOnce(undefined) // SET LOCAL lease
      .mockResolvedValueOnce({ rows: [row] } as never)
      .mockResolvedValueOnce(undefined); // COMMIT lease
    eventsQueue.add.mockRejectedValueOnce(new Error('enqueue failed'));

    expect(await relayService.scanAndRelay(100)).toBe(0);
    const queryCalls = poolClient.query.mock.calls as unknown[][];
    expect(queryCalls.some(([sql]) => typeof sql === 'string' && sql === 'BEGIN')).toBe(true);
    expect(queryCalls).toHaveLength(5);

    poolClient.query.mockReset();
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ id: 't1', schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // BEGIN lease
      .mockResolvedValueOnce(undefined) // SET LOCAL lease
      .mockResolvedValueOnce({ rows: [row] } as never)
      .mockResolvedValueOnce(undefined) // COMMIT lease
      .mockResolvedValueOnce(undefined) // BEGIN mark
      .mockResolvedValueOnce(undefined) // SET LOCAL mark
      .mockRejectedValueOnce(new Error('mark failed'))
      .mockResolvedValueOnce(undefined); // ROLLBACK mark
    expect(await relayService.scanAndRelay(100)).toBe(0);
    const markFailureCalls = poolClient.query.mock.calls as unknown[][];
    expect(
      markFailureCalls.some(([sql]) => typeof sql === 'string' && sql.includes('published_at')),
    ).toBe(true);
  });

  it('relayStatus devuelve el estado actual', () => {
    const status = relayService.relayStatus;
    expect(status).toHaveProperty('lastScanAt');
    expect(status).toHaveProperty('lastScanCount');
    expect(status).toHaveProperty('pendingEvents');
  });
});

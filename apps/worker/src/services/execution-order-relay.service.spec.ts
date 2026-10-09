import { ConfigService } from '@nestjs/config';
import { ExecutionOrderRelayService } from './execution-order-relay.service';
import type { Queue } from 'bullmq';
import { INVENTORY_SOURCE_CLEANUP_INTERVAL_MS } from '@iwana/shared';
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
  let telemetryRedis: { set: TestMock };
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
    telemetryRedis = {
      set: jest.fn<(...args: never[]) => Promise<unknown>>().mockResolvedValue('OK'),
    };
    poolClient = {
      query: jest.fn<(...args: never[]) => Promise<unknown>>(),
      release: jest.fn<(...args: never[]) => Promise<unknown>>(),
    };

    relayService = new ExecutionOrderRelayService(
      mockConfig(),
      relayQueue as unknown as Queue,
      eventsQueue as unknown as Queue,
      telemetryRedis as never,
    );

    (relayService as unknown as { pool: { connect: TestMock } }).pool = {
      connect: jest.fn<(...args: never[]) => Promise<unknown>>().mockResolvedValue(poolClient),
    } as never;
  });

  it('programa la limpieza horaria de colas de inventario desde el worker', async () => {
    await relayService.onApplicationBootstrap();

    expect(relayQueue.add).toHaveBeenCalledWith(
      'clean-expired-inventory-source-failures',
      {},
      expect.objectContaining({
        repeat: { every: INVENTORY_SOURCE_CLEANUP_INTERVAL_MS },
        jobId: 'execution-order-inventory-source-cleanup-worker',
      }),
    );
  });

  it.each<[string, number | { age: number }]>([
    ['InventoryConsumptionRequestedV1', { age: 24 * 60 * 60 }],
    ['InventoryConsumptionRequestedV2', { age: 24 * 60 * 60 }],
    ['InventoryMovementConfirmedV1', { age: 24 * 60 * 60 }],
    ['InventoryMovementRejectedV1', { age: 24 * 60 * 60 }],
    ['ExecutionOrderStartedV1', 30 * 24 * 60 * 60],
  ])('aplica retención por tipo de evento: %s', async (eventType, expectedRetention) => {
    const eventId = 'e0000000-0000-4000-8000-000000000001';
    const tenantId = '10000000-0000-4000-8000-000000000001';
    const orderId = 'a0000000-0000-4000-8000-000000000001';
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ id: tenantId, schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // BEGIN lease
      .mockResolvedValueOnce(undefined) // SET LOCAL lease
      .mockResolvedValueOnce({
        rows: [
          {
            event_id: eventId,
            tenant_id: tenantId,
            aggregate_id: orderId,
            aggregate_version: 1,
            event_type: eventType,
            payload: { executionOrderId: orderId },
            correlation_id: eventId,
            occurred_at: new Date().toISOString(),
            attempt_count: 1,
          },
        ],
      } as never)
      .mockResolvedValueOnce(undefined) // COMMIT lease
      .mockResolvedValueOnce(undefined) // BEGIN mark
      .mockResolvedValueOnce(undefined) // SET LOCAL mark
      .mockResolvedValueOnce(undefined) // UPDATE mark published
      .mockResolvedValueOnce(undefined); // COMMIT mark

    await relayService.scanAndRelay(100);

    expect(eventsQueue.add).toHaveBeenCalledWith(
      'deliver-execution-event',
      expect.any(Object),
      expect.objectContaining({ removeOnFail: expectedRetention }),
    );
  });

  it('retransmite el envelope del agregado sin consultar el vínculo de agenda', async () => {
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
            attempt_count: 1,
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
          aggregateId: 'a0000000-0000-4000-8000-000000000001',
          correlationId: 'c0000000-0000-4000-8000-000000000001',
          payload: {
            executionOrderId: 'a0000000-0000-4000-8000-000000000001',
          },
        }),
      }),
      expect.objectContaining({
        jobId: 'execution-event-e0000000-0000-4000-8000-000000000001-1',
        attempts: 8,
        backoff: expect.objectContaining({ type: 'exponential', delay: 1000 }),
      }),
    );
    const queries = poolClient.query.mock.calls.map(([sql]) => String(sql));
    expect(queries.some((sql) => sql.includes('schedule_event_id'))).toBe(false);
    expect(queries.some((sql) => sql.includes('execution_orders'))).toBe(false);
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

  it('registra el escaneo aunque el ciclo no publique eventos', async () => {
    poolClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 't1', schema_name: 'tenant_test001' }],
      } as never)
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rows: [] } as never) // sin publicaciones
      .mockResolvedValueOnce(undefined); // COMMIT

    expect(await relayService.scanAndRelay(100)).toBe(0);

    expect(relayService.relayStatus.lastScanAt).toEqual(expect.any(Date));
    expect(relayService.relayStatus.lastScanCount).toBe(0);
    expect(telemetryRedis.set).toHaveBeenCalledWith(
      'iwana:platform:execution-order-relay:last-scan-at',
      expect.any(String),
    );
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
    const warnSpy = jest.spyOn(
      (relayService as unknown as { logger: { warn: (message: string) => void } }).logger,
      'warn',
    );
    const errorSpy = jest.spyOn(
      (relayService as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    );
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
    const capturedLogs = [...warnSpy.mock.calls.flat(), ...errorSpy.mock.calls.flat()].join(' ');
    expect(capturedLogs).not.toContain('enqueue failed');
    expect(capturedLogs).not.toContain('mark failed');
    expect(capturedLogs).toContain('error_type=Error');
  });

  it('relayStatus devuelve el estado actual', () => {
    const status = relayService.relayStatus;
    expect(status).toHaveProperty('lastScanAt');
    expect(status).toHaveProperty('lastScanCount');
    expect(status).toHaveProperty('pendingEvents');
  });
});

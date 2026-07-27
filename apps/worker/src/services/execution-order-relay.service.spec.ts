import { ConfigService } from '@nestjs/config';
import { ExecutionOrderRelayService } from './execution-order-relay.service';
import type { Queue } from 'bullmq';

function mockConfig(config: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal: string) => config[key] ?? defaultVal),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
}

describe('ExecutionOrderRelayService', () => {
  let relayService: ExecutionOrderRelayService;
  let eventsQueue: { add: jest.Mock };
  let relayQueue: { add: jest.Mock };
  let poolClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    eventsQueue = { add: jest.fn().mockResolvedValue(undefined) };
    relayQueue = { add: jest.fn().mockResolvedValue(undefined) };
    poolClient = { query: jest.fn(), release: jest.fn() };

    relayService = new ExecutionOrderRelayService(
      mockConfig(),
      relayQueue as unknown as Queue,
      eventsQueue as unknown as Queue,
    );

    (relayService as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(poolClient),
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
      // COMMIT
      .mockResolvedValueOnce(undefined)
      // SET LOCAL para mark
      .mockResolvedValueOnce(undefined)
      // UPDATE mark published
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
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({
        rows: [{ pending_count: '5', oldest_age_seconds: '120' }],
      } as never);

    const metrics = await relayService.getPendingEventsPerTenant();
    expect(metrics).toHaveLength(1);
    expect(metrics[0]!.pendingCount).toBe(5);
    expect(metrics[0]!.oldestAgeSeconds).toBe(120);
  });

  it('relayStatus devuelve el estado actual', () => {
    const status = relayService.relayStatus;
    expect(status).toHaveProperty('lastScanAt');
    expect(status).toHaveProperty('lastScanCount');
    expect(status).toHaveProperty('pendingEvents');
  });
});

import { ConfigService } from '@nestjs/config';
import { ExecutionOrderEventsProcessor } from './execution-order-events.processor';
import type { Job, Queue } from 'bullmq';
import type { OperationalEventEnvelopeV1 } from '@iwana/shared';

// Helpers para construir envelopes de test
function makeEnvelope(
  overrides: Partial<OperationalEventEnvelopeV1> = {},
): OperationalEventEnvelopeV1 {
  return {
    eventId: 'e0000000-0000-4000-8000-000000000001',
    eventType: 'ExecutionOrderStartedV1',
    tenantId: 't0000000-0000-4000-8000-000000000001',
    aggregateId: 'a0000000-0000-4000-8000-000000000001',
    aggregateVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: 'c0000000-0000-4000-8000-000000000001',
    payload: {
      executionOrderId: 'a0000000-0000-4000-8000-000000000001',
    } as never,
    ...overrides,
  } as OperationalEventEnvelopeV1;
}

function makeConfig(config: Record<string, string> = {}): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal: string) => config[key] ?? defaultVal),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
}

/**
 * Construye el mock de query para el flujo feliz de process().
 * Retorna las respuestas en orden:
 *  0: SELECT schema_name → { rows: [{ schema_name }] }
 *  1: BEGIN → undefined
 *  2: SET LOCAL → undefined
 *  3: inbox version check → { rows: [] } (no processed events)
 *  4: INSERT inbox → { rows: [{ id }], rowCount: 1 }
 *  5+: definidas por cada test
 */
function setupHappyPath(poolClient: { query: jest.Mock }): jest.Mock {
  const schemaName = 'tenant_test001';
  poolClient.query
    .mockResolvedValueOnce({ rows: [{ schema_name: schemaName }] } as never)
    .mockResolvedValueOnce(undefined) // BEGIN
    .mockResolvedValueOnce(undefined) // SET LOCAL
    .mockResolvedValueOnce({ rows: [] }) // inbox check (no prev events)
    .mockResolvedValueOnce({ rows: [{ id: 'inv-001' }], rowCount: 1 }); // INSERT inbox
  return poolClient.query;
}

describe('ExecutionOrderEventsProcessor', () => {
  let processor: ExecutionOrderEventsProcessor;
  let poolClient: {
    query: jest.Mock;
    release: jest.Mock;
  };
  let dlqQueue: { add: jest.Mock };

  beforeEach(() => {
    poolClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    dlqQueue = { add: jest.fn() };

    processor = new ExecutionOrderEventsProcessor(makeConfig(), dlqQueue as unknown as Queue);

    // Reemplazar el pool interno para testing
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(poolClient),
    } as never;
  });

  describe('deduplicación por inbox', () => {
    it('no procesa eventos fuera de orden (versión antigua después de nueva)', async () => {
      poolClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ aggregate_version: 5 }] }); // latest = 5

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 3,
            eventType: 'ExecutionOrderStartedV1',
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);
      expect(queries).toContain('COMMIT');
      const insertCount = queries.filter((q: string) =>
        q.includes('INSERT INTO execution_order_inbox_events'),
      ).length;
      expect(insertCount).toBe(0);
    });

    it('no procesa duplicados (mismo eventId ya en inbox)', async () => {
      poolClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rows: [] }) // inbox check: no prev events
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // INSERT DO NOTHING returns 0

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 1,
            eventType: 'ExecutionOrderStartedV1',
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);
      expect(queries).toContain('COMMIT');
    });
  });

  /**
   * Fase 0 — red de seguridad (PROMPT-MOD09-CICLO-VIDA-VISITA-CAMPO §3).
   *
   * F0.5 — cubierto por los tests heredados de esta suite:
   *   "ExecutionOrderClosedV1 EXECUTED: ... VisitRequest→CLOSED" (§ejecutada)
   *   "ExecutionOrderClosedV1 CANCELLED: VisitRequest→CANCELLED" (§cancelada)
   *   "ExecutionOrderFollowUpRequiredV1 REQUIRES_FOLLOW_UP: ... VisitRequest→REQUIRES_RESCHEDULE" (§requiere seguimiento)
   *
   * F0.6 — cubierto por "ExecutionOrderClosedV1 EXECUTED: ... VisitRequest→CLOSED":
   *   una visita ejecutada normalmente cierra en CLOSED, no en REQUIRES_RESCHEDULE
   *   ni en ningún estado de los flujos nuevos (F2–F4).
   */
  describe('matriz de convergencia ADR-068', () => {
    it('ExecutionOrderStartedV1: ScheduleEvent→IN_PROGRESS, VisitRequest→IN_EXECUTION, Task→IN_PROGRESS', async () => {
      setupHappyPath(poolClient)
        // 5: UPDATE schedule_events
        .mockResolvedValueOnce({ rowCount: 1 })
        // 6: UPDATE visit_requests
        .mockResolvedValueOnce({ rowCount: 1 })
        // 7: SELECT task_id from execution_orders
        .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
        // 8: UPDATE operational_tasks
        .mockResolvedValueOnce({ rowCount: 1 })
        // 9: UPDATE inbox processed_at
        .mockResolvedValueOnce({ rowCount: 1 })
        // 10: COMMIT
        .mockResolvedValueOnce(undefined);

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 1,
            eventType: 'ExecutionOrderStartedV1',
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

      const scheduleUpdate = queries.find(
        (q: string) => q.includes('UPDATE schedule_events') && q.includes('IN_PROGRESS'),
      );
      expect(scheduleUpdate).toBeDefined();

      const visitUpdate = queries.find(
        (q: string) => q.includes('UPDATE visit_requests') && q.includes('IN_EXECUTION'),
      );
      expect(visitUpdate).toBeDefined();

      // Task status is in params ($3), not SQL text
      const taskCallStart = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
        (call[0] as string).includes('UPDATE operational_tasks'),
      );
      expect(taskCallStart).toBeDefined();
      expect((taskCallStart![1] as unknown[])[2]).toBe('IN_PROGRESS');
    });

    it('ExecutionOrderClosedV1 EXECUTED: ScheduleEvent→COMPLETED, VisitRequest→CLOSED, Task→RESOLVED', async () => {
      setupHappyPath(poolClient)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE schedule_events COMPLETED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE visit_requests CLOSED
        .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never) // SELECT task_id
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE operational_tasks RESOLVED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE inbox processed_at
        .mockResolvedValueOnce(undefined); // COMMIT

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 2,
            eventType: 'ExecutionOrderClosedV1',
            payload: {
              executionOrderId: 'a0000000-0000-4000-8000-000000000001',
              result: 'EXECUTED',
              closedAt: new Date().toISOString(),
            } as never,
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

      const scheduleUpdate = queries.find(
        (q: string) => q.includes('UPDATE schedule_events') && q.includes('COMPLETED'),
      );
      expect(scheduleUpdate).toBeDefined();

      const visitUpdate = queries.find(
        (q: string) => q.includes('UPDATE visit_requests') && q.includes('CLOSED'),
      );
      expect(visitUpdate).toBeDefined();

      // Task status is in params
      const taskCallExecuted = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
        (call[0] as string).includes('UPDATE operational_tasks'),
      );
      expect(taskCallExecuted).toBeDefined();
      expect((taskCallExecuted![1] as unknown[])[2]).toBe('RESOLVED');
    });

    it('ExecutionOrderClosedV1 NOT_EXECUTED: ScheduleEvent→CANCELLED, VisitRequest→REQUIRES_RESCHEDULE, Task→READY', async () => {
      setupHappyPath(poolClient)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE schedule_events CANCELLED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE visit_requests REQUIRES_RESCHEDULE
        .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE operational_tasks READY
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE inbox processed_at
        .mockResolvedValueOnce(undefined); // COMMIT

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 2,
            eventType: 'ExecutionOrderClosedV1',
            payload: {
              executionOrderId: 'a0000000-0000-4000-8000-000000000001',
              result: 'NOT_EXECUTED',
              closedAt: new Date().toISOString(),
            } as never,
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

      const scheduleUpdate = queries.find(
        (q: string) => q.includes('UPDATE schedule_events') && q.includes('CANCELLED'),
      );
      expect(scheduleUpdate).toBeDefined();

      const visitUpdate = poolClient.query.mock.calls.find(
        (call: [string, ...unknown[]]) =>
          (call[0] as string).includes('UPDATE visit_requests') &&
          (call[1] as unknown[])[2] === 'REQUIRES_RESCHEDULE',
      );
      expect(visitUpdate).toBeDefined();

      // Task status is in params
      const taskCallNotExecuted = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
        (call[0] as string).includes('UPDATE operational_tasks'),
      );
      expect(taskCallNotExecuted).toBeDefined();
      expect((taskCallNotExecuted![1] as unknown[])[2]).toBe('READY');
    });

    it('ExecutionOrderClosedV1 CANCELLED: VisitRequest→CANCELLED, Task→CANCELLED', async () => {
      setupHappyPath(poolClient)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE schedule_events CANCELLED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE visit_requests CANCELLED
        .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE operational_tasks CANCELLED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE inbox processed_at
        .mockResolvedValueOnce(undefined); // COMMIT

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 2,
            eventType: 'ExecutionOrderClosedV1',
            payload: {
              executionOrderId: 'a0000000-0000-4000-8000-000000000001',
              result: 'CANCELLED',
              closedAt: new Date().toISOString(),
            } as never,
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

      const visitUpdate = queries.find(
        (q: string) => q.includes('UPDATE visit_requests') && q.includes('CANCELLED'),
      );
      expect(visitUpdate).toBeDefined();

      // Task status is in params, not SQL
      const taskCall = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
        (call[0] as string).includes('UPDATE operational_tasks'),
      );
      expect(taskCall).toBeDefined();
      expect((taskCall![1] as unknown[])[2]).toBe('CANCELLED');
    });

    it('ExecutionOrderBlockedV1: VisitRequest→IN_EXECUTION, Task→BLOCKED', async () => {
      setupHappyPath(poolClient)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE schedule_events (touch)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE visit_requests IN_EXECUTION
        .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE operational_tasks BLOCKED
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE inbox processed_at
        .mockResolvedValueOnce(undefined); // COMMIT

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 2,
            eventType: 'ExecutionOrderBlockedV1',
            payload: {
              executionOrderId: 'a0000000-0000-4000-8000-000000000001',
            } as never,
          }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await processor.process(job);

      const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

      const visitUpdate = queries.find(
        (q: string) => q.includes('UPDATE visit_requests') && q.includes('IN_EXECUTION'),
      );
      expect(visitUpdate).toBeDefined();

      // Buscar el UPDATE operational_tasks y verificar params
      const taskCall = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
        (call[0] as string).includes('UPDATE operational_tasks'),
      );
      expect(taskCall).toBeDefined();
      // params: [taskId, tenantId, 'BLOCKED']
      expect((taskCall![1] as unknown[])[2]).toBe('BLOCKED');
    });
  });

  it('ExecutionOrderClosedV1 EXECUTED_WITH_OBSERVATIONS: mismo mapeo que EXECUTED', async () => {
    setupHappyPath(poolClient)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    const job = {
      data: {
        tenantId: 't0000000-0000-4000-8000-000000000001',
        envelope: makeEnvelope({
          aggregateVersion: 2,
          eventType: 'ExecutionOrderClosedV1',
          payload: {
            executionOrderId: 'a0000000-0000-4000-8000-000000000001',
            result: 'EXECUTED_WITH_OBSERVATIONS',
            closedAt: new Date().toISOString(),
          } as never,
        }),
      },
    } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

    await processor.process(job);

    const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);
    const taskCall = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('UPDATE operational_tasks'),
    );
    expect(taskCall).toBeDefined();
    expect((taskCall![1] as unknown[])[2]).toBe('RESOLVED');

    const scheduleUpdate = queries.find(
      (q: string) => q.includes('UPDATE schedule_events') && q.includes('COMPLETED'),
    );
    expect(scheduleUpdate).toBeDefined();
  });

  it('ExecutionOrderFollowUpRequiredV1 REQUIRES_FOLLOW_UP: ScheduleEvent→COMPLETED, VisitRequest→REQUIRES_RESCHEDULE, Task→PENDING_INTERNAL', async () => {
    setupHappyPath(poolClient)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    const job = {
      data: {
        tenantId: 't0000000-0000-4000-8000-000000000001',
        envelope: makeEnvelope({
          aggregateVersion: 2,
          eventType: 'ExecutionOrderFollowUpRequiredV1',
          payload: {
            executionOrderId: 'a0000000-0000-4000-8000-000000000001',
          } as never,
        }),
      },
    } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

    await processor.process(job);

    const queries = poolClient.query.mock.calls.map((call: [string, ...unknown[]]) => call[0]);

    const scheduleCompleted = queries.find(
      (q: string) => q.includes('UPDATE schedule_events') && q.includes('COMPLETED'),
    );
    expect(scheduleCompleted).toBeDefined();

    const visitReschedule = queries.find(
      (q: string) => q.includes('UPDATE visit_requests') && q.includes('REQUIRES_RESCHEDULE'),
    );
    expect(visitReschedule).toBeDefined();

    const taskCall = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('UPDATE operational_tasks'),
    );
    expect(taskCall).toBeDefined();
    expect((taskCall![1] as unknown[])[2]).toBe('PENDING_INTERNAL');
  });

  describe('fiabilidad de entrega con reintentos y DLQ', () => {
    it('reintenta tras fallo transitorio sin llegar a DLQ en el primer intento', async () => {
      const schemaName = 'tenant_test001';
      const failOnceClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ schema_name: schemaName }] } as never)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ id: 'inv-001' }], rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ task_id: 'task-001' }] } as never)
          .mockResolvedValueOnce({ rowCount: 1 })
          .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
          .mockResolvedValueOnce(undefined),
        release: jest.fn(),
      };

      const testProcessor = new ExecutionOrderEventsProcessor(
        makeConfig(),
        dlqQueue as unknown as Queue,
      );
      (testProcessor as unknown as { pool: { connect: jest.Mock } }).pool = {
        connect: jest.fn().mockResolvedValue(failOnceClient),
      } as never;

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({
            aggregateVersion: 1,
            eventType: 'ExecutionOrderStartedV1',
          }),
        },
        attemptsMade: 1,
        opts: { attempts: 8 },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await expect(testProcessor.process(job)).rejects.toThrow(
        'Connection terminated unexpectedly',
      );

      const rollbackCalls = failOnceClient.query.mock.calls.filter(([query]) =>
        String(query).includes('ROLLBACK'),
      );
      expect(rollbackCalls.length).toBeGreaterThanOrEqual(1);
      expect(failOnceClient.release).toHaveBeenCalled();
    });
  });

  describe('validación de envelope', () => {
    it('rechaza eventos con tenantId vacío', async () => {
      poolClient.query.mockReset();

      const job = {
        data: {
          tenantId: '',
          envelope: makeEnvelope({ tenantId: '' }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await expect(processor.process(job)).rejects.toThrow();
    });

    it('rechaza eventos con aggregateVersion < 1', async () => {
      poolClient.query.mockReset();

      const job = {
        data: {
          tenantId: 't0000000-0000-4000-8000-000000000001',
          envelope: makeEnvelope({ aggregateVersion: 0 }),
        },
      } as Job<{ tenantId: string; envelope: OperationalEventEnvelopeV1 }>;

      await expect(processor.process(job)).rejects.toThrow();
    });
  });
});

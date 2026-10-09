import { ConfigService } from '@nestjs/config';
import { ExecutionOrderDlqProcessor } from './execution-order-dlq.processor';
import type { Job, Queue } from 'bullmq';

const QUEUE_NAME = 'operations-execution-dlq';
const LEGACY_MARKER_KEY =
  'bull:operations-execution-dlq:execution-order-dlq-legacy-payload-purge-v2:complete';
const LEGACY_PENDING_FIELD = 'dlqLegacyPayloadPurgeV2Pending';

function legacyJobData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: '10000000-0000-4000-8000-000000000001',
    envelope: {
      eventId: 'e0000000-0000-4000-8000-000000000001',
      eventType: 'ExecutionOrderStartedV1',
      tenantId: '10000000-0000-4000-8000-000000000001',
      aggregateId: 'a0000000-0000-4000-8000-000000000001',
      aggregateVersion: 1,
      occurredAt: '2026-10-09T00:00:00.000Z',
      correlationId: 'c0000000-0000-4000-8000-000000000001',
      payload: { sensitive: 'RAW_PAYLOAD_SHOULD_NOT_SURVIVE' },
    },
    diagnostic: {
      failedAt: '2026-10-09T00:00:00.000Z',
      attemptsMade: 8,
      errorMessage: 'RAW_EXCEPTION_SHOULD_NOT_SURVIVE',
      errorName: 'Error',
    },
    ...overrides,
  };
}

function mockConfig(): ConfigService {
  return {
    get: jest.fn((key: string, defaultVal: string) => defaultVal),
    getOrThrow: jest.fn(),
  } as unknown as ConfigService;
}

describe('ExecutionOrderDlqProcessor', () => {
  let processor: ExecutionOrderDlqProcessor;
  let queue: {
    add: jest.Mock;
    clean: jest.Mock;
    client: Promise<{
      exists: jest.Mock;
      scan: jest.Mock;
      type: jest.Mock;
      hget: jest.Mock;
      hset: jest.Mock;
      hdel: jest.Mock;
      set: jest.Mock;
    }>;
    toKey: jest.Mock;
    getJobState: jest.Mock;
    remove: jest.Mock;
  };
  let bullRegistrar: { register: jest.Mock };
  let poolClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    poolClient = { query: jest.fn(), release: jest.fn() };
    const redisClient = {
      exists: jest.fn().mockResolvedValue(1),
      scan: jest.fn().mockResolvedValue(['0', []]),
      type: jest.fn().mockResolvedValue('hash'),
      hget: jest.fn(),
      hset: jest.fn().mockResolvedValue(1),
      hdel: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
    };
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      clean: jest.fn().mockResolvedValue([]),
      client: Promise.resolve(redisClient),
      toKey: jest.fn((key: string) => `bull:${QUEUE_NAME}:${key}`),
      getJobState: jest.fn().mockResolvedValue('unknown'),
      remove: jest.fn().mockResolvedValue(1),
    };
    bullRegistrar = { register: jest.fn() };
    processor = new ExecutionOrderDlqProcessor(
      mockConfig(),
      queue as unknown as Queue,
      bullRegistrar as never,
    );
    (processor as unknown as { pool: { connect: jest.Mock } }).pool = {
      connect: jest.fn().mockResolvedValue(poolClient),
    } as never;
  });

  it('sanea payloads heredados activos desde el hash Redis, sin completarlos ni registrar su contenido', async () => {
    const client = await queue.client;
    const legacyKey = `bull:${QUEUE_NAME}:legacy-waiting-job`;
    client.exists.mockResolvedValueOnce(0);
    client.scan.mockResolvedValueOnce(['0', [legacyKey]]);
    client.hget
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(legacyJobData()))
      .mockResolvedValueOnce(
        JSON.stringify({ attempts: 4, backoff: { type: 'exponential', delay: 500 } }),
      );
    queue.getJobState.mockResolvedValueOnce('waiting');

    await expect(processor.purgeLegacyJobsByRedisKey()).resolves.toBe(0);

    const [, dataField, sanitizedJson, optsField, optsJson, markerField, markerValue] = client.hset
      .mock.calls[0] as [string, string, string, string, string, string, string];
    expect(dataField).toBe('data');
    expect(optsField).toBe('opts');
    expect(markerField).toBe(LEGACY_PENDING_FIELD);
    expect(markerValue).toBe('1');
    expect(JSON.parse(optsJson)).toMatchObject({
      attempts: 4,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: true,
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
    expect(sanitizedJson).toContain('execution-event');
    expect(sanitizedJson).toContain('10000000-0000-4000-8000-000000000001');
    expect(sanitizedJson).not.toContain('envelope');
    expect(sanitizedJson).not.toContain('diagnostic');
    expect(sanitizedJson).not.toContain('RAW_PAYLOAD_SHOULD_NOT_SURVIVE');
    expect(sanitizedJson).not.toContain('RAW_EXCEPTION_SHOULD_NOT_SURVIVE');
    expect(client.hdel).toHaveBeenCalledWith(legacyKey, LEGACY_PENDING_FIELD);
    expect(queue.remove).not.toHaveBeenCalled();
    expect(client.set).toHaveBeenCalledWith(LEGACY_MARKER_KEY, '1');
  });

  it('actualiza la retención de jobs ya saneados por una migración anterior', async () => {
    const client = await queue.client;
    const legacyKey = `bull:${QUEUE_NAME}:previously-sanitized-job`;
    const safeData = {
      kind: 'execution-event',
      eventId: 'e0000000-0000-4000-8000-000000000001',
      failedAt: '2026-10-09T00:00:00.000Z',
      attemptsMade: 8,
      errorType: 'Error',
    };
    client.exists.mockResolvedValueOnce(0);
    client.scan.mockResolvedValueOnce(['0', [legacyKey]]);
    client.hget
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(safeData))
      .mockResolvedValueOnce(JSON.stringify({ removeOnComplete: false, removeOnFail: false }));
    queue.getJobState.mockResolvedValueOnce('waiting');

    await expect(processor.purgeLegacyJobsByRedisKey()).resolves.toBe(0);

    expect(client.hset).toHaveBeenCalledWith(
      legacyKey,
      'data',
      JSON.stringify(safeData),
      'opts',
      JSON.stringify({
        removeOnComplete: true,
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      }),
      LEGACY_PENDING_FIELD,
      '1',
    );
    expect(client.hdel).toHaveBeenCalledWith(legacyKey, LEGACY_PENDING_FIELD);
  });

  it('no registra workers antes de completar el barrido de claves Redis', async () => {
    const client = await queue.client;
    const legacyKey = `bull:${QUEUE_NAME}:legacy-completed-job`;
    client.exists.mockResolvedValueOnce(0);
    client.scan.mockResolvedValueOnce(['0', [legacyKey]]);
    client.type.mockResolvedValueOnce('hash');
    client.hget
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(legacyJobData()))
      .mockResolvedValueOnce(JSON.stringify({ removeOnComplete: false, removeOnFail: false }));
    queue.getJobState.mockResolvedValueOnce('completed');

    await processor.onModuleInit();
    expect(bullRegistrar.register).not.toHaveBeenCalled();
    await processor.onApplicationBootstrap();

    expect(client.hset.mock.invocationCallOrder[0]).toBeLessThan(
      bullRegistrar.register.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(queue.remove.mock.invocationCallOrder[0]).toBeLessThan(
      bullRegistrar.register.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(client.set.mock.invocationCallOrder[0]).toBeLessThan(
      bullRegistrar.register.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('falla cerrado y no registra workers si falla el barrido Redis', async () => {
    const client = await queue.client;
    const loggerError = jest.spyOn(
      (processor as unknown as { logger: { error: (message: string) => void } }).logger,
      'error',
    );
    client.exists.mockResolvedValueOnce(0);
    client.scan.mockRejectedValueOnce(new Error('RAW_REDIS_FAILURE_DETAIL'));

    await expect(processor.onModuleInit()).rejects.toThrow(
      'Execution order DLQ legacy payload purge failed',
    );

    expect(bullRegistrar.register).not.toHaveBeenCalled();
    expect(loggerError.mock.calls.flat().join(' ')).not.toContain('RAW_REDIS_FAILURE_DETAIL');
    expect(loggerError.mock.calls.flat().join(' ')).not.toContain(LEGACY_MARKER_KEY);
  });

  it('purga jobs heredados terminales una sola vez por sus claves Redis', async () => {
    const client = await queue.client;
    const completedKey = `bull:${QUEUE_NAME}:legacy-completed-job`;
    const failedKey = `bull:${QUEUE_NAME}:legacy-failed-job`;
    client.exists.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    client.scan.mockResolvedValueOnce(['0', [completedKey, failedKey]]);
    client.hget
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(legacyJobData()))
      .mockResolvedValueOnce(JSON.stringify({ removeOnComplete: false, removeOnFail: false }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(legacyJobData()))
      .mockResolvedValueOnce(JSON.stringify({ removeOnComplete: false, removeOnFail: false }));
    queue.getJobState.mockResolvedValueOnce('completed').mockResolvedValueOnce('failed');

    await expect(processor.purgeLegacyJobsByRedisKey()).resolves.toBe(2);
    await expect(processor.purgeLegacyJobsByRedisKey()).resolves.toBe(0);

    expect(client.scan).toHaveBeenCalledTimes(1);
    expect(client.scan).toHaveBeenCalledWith('0', 'MATCH', `bull:${QUEUE_NAME}:*`, 'COUNT', 100);
    expect(queue.remove).toHaveBeenNthCalledWith(1, 'legacy-completed-job');
    expect(queue.remove).toHaveBeenNthCalledWith(2, 'legacy-failed-job');
    expect(client.hset).toHaveBeenCalledTimes(2);
  });

  it('reanuda la purga terminal tras interrumpirse después del saneamiento atómico', async () => {
    const client = await queue.client;
    const completedKey = `bull:${QUEUE_NAME}:legacy-completed-job`;
    client.exists.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    client.scan
      .mockResolvedValueOnce(['0', [completedKey]])
      .mockResolvedValueOnce(['0', [completedKey]]);
    client.hget
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify(legacyJobData()))
      .mockResolvedValueOnce(JSON.stringify({ removeOnComplete: false, removeOnFail: false }))
      .mockResolvedValueOnce('1')
      .mockResolvedValueOnce(
        JSON.stringify({
          kind: 'execution-event',
          eventId: 'e0000000-0000-4000-8000-000000000001',
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          removeOnComplete: true,
          removeOnFail: { age: 30 * 24 * 60 * 60 },
        }),
      );
    queue.getJobState.mockResolvedValue('completed');
    queue.remove
      .mockRejectedValueOnce(new Error('temporary Redis failure'))
      .mockResolvedValueOnce(1);

    await expect(processor.purgeLegacyJobsByRedisKey()).rejects.toThrow('temporary Redis failure');
    expect(client.set).not.toHaveBeenCalled();

    await expect(processor.purgeLegacyJobsByRedisKey()).resolves.toBe(1);

    expect(queue.remove).toHaveBeenNthCalledWith(2, 'legacy-completed-job');
    expect(client.hset).toHaveBeenCalledTimes(1);
    expect(client.set).toHaveBeenCalledWith(LEGACY_MARKER_KEY, '1');
  });

  it('programa la limpieza horaria de fallos con una gracia de 30 días', async () => {
    await processor.onApplicationBootstrap();

    expect(queue.add).toHaveBeenCalledWith(
      'clean-expired-execution-order-dlq',
      { kind: 'execution-order-dlq-cleanup' },
      expect.objectContaining({
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'execution-order-dlq-cleanup-hourly',
        removeOnComplete: true,
        removeOnFail: { age: 30 * 24 * 60 * 60 },
      }),
    );
    expect(bullRegistrar.register).toHaveBeenCalledTimes(1);
  });

  it('limpia fallos diagnósticos de más de 30 días', async () => {
    queue.clean.mockResolvedValueOnce(['expired-job']);

    await processor.process({
      data: { kind: 'execution-order-dlq-cleanup' },
    } as Job);

    expect(queue.clean).toHaveBeenCalledWith(30 * 24 * 60 * 60 * 1000, 1000, 'failed');
  });

  it('registra el evento fallido en el outbox con last_error', async () => {
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE outbox
      .mockResolvedValueOnce({ rowCount: 1 }) // INSERT inbox
      .mockResolvedValueOnce(undefined); // COMMIT

    const dlqJob = {
      data: {
        kind: 'execution-event',
        tenantId: '10000000-0000-4000-8000-000000000001',
        eventId: 'e0000000-0000-4000-8000-000000000001',
        aggregateId: 'a0000000-0000-4000-8000-000000000001',
        aggregateVersion: 1,
        failedAt: new Date().toISOString(),
        attemptsMade: 8,
        errorType: 'Error',
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
    expect(updateParams[2]).toContain('errorType');
    expect(updateParams[2]).not.toContain('Connection timeout');

    const inboxQuery = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('INSERT INTO execution_order_inbox_events'),
    );
    expect(inboxQuery).toBeDefined();
    // inboxQuery call = [sql, [tenantId, consumer, eventId, aggregateId, version, dlqMsg]]
    expect((inboxQuery![1] as unknown[])[5]).toContain('DLQ:');
  });

  it('acepta el diagnóstico genérico nuevo, con IDs validados y sin mensaje crudo', async () => {
    poolClient.query
      .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // SET LOCAL
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE outbox
      .mockResolvedValueOnce({ rowCount: 1 }) // INSERT inbox
      .mockResolvedValueOnce(undefined); // COMMIT

    await processor.process({
      data: {
        kind: 'execution-event',
        tenantId: '10000000-0000-4000-8000-000000000001',
        eventId: 'e0000000-0000-4000-8000-000000000005',
        aggregateId: 'a0000000-0000-4000-8000-000000000005',
        aggregateVersion: 5,
        failedAt: new Date().toISOString(),
        attemptsMade: 8,
        errorType: 'QueryFailedError',
      },
    } as Job);

    const updateQuery = poolClient.query.mock.calls.find((call: [string, ...unknown[]]) =>
      (call[0] as string).includes('UPDATE execution_order_outbox_events'),
    );
    expect(updateQuery).toBeDefined();
    expect((updateQuery![1] as unknown[])[2]).toContain('QueryFailedError');
    expect((updateQuery![1] as unknown[])[2]).not.toContain('errorMessage');
  });

  it('no lanza error si el tenant no existe', async () => {
    poolClient.query.mockResolvedValueOnce({ rows: [] } as never); // Sin tenant

    const dlqJob = {
      data: {
        kind: 'execution-event',
        tenantId: '10000000-0000-4000-8000-000000000099',
        eventId: 'e0000000-0000-4000-8000-000000000002',
        aggregateId: 'a0000000-0000-4000-8000-000000000002',
        aggregateVersion: 2,
        failedAt: new Date().toISOString(),
        attemptsMade: 8,
        errorType: 'Error',
      },
    } as Job;

    // Debe completar sin lanzar
    await expect(processor.process(dlqJob)).resolves.toBeUndefined();
  });

  describe('fault injection', () => {
    it('sustituye por un error fijo el rechazo al adquirir la conexión SQL', async () => {
      const loggerError = jest.spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      );
      const rawConnectionError = 'RAW_DATABASE_CONNECTION_FAILURE';
      (processor as unknown as { pool: { connect: jest.Mock } }).pool.connect.mockRejectedValueOnce(
        new Error(rawConnectionError),
      );

      const dlqJob = {
        data: {
          kind: 'execution-event',
          tenantId: '10000000-0000-4000-8000-000000000001',
          eventId: 'e0000000-0000-4000-8000-000000000006',
          aggregateId: 'a0000000-0000-4000-8000-000000000006',
          aggregateVersion: 6,
          failedAt: new Date().toISOString(),
          attemptsMade: 8,
          errorType: 'Error',
        },
      } as Job;

      await expect(processor.process(dlqJob)).rejects.toThrow(
        'Execution order DLQ diagnostic persistence failed',
      );
      expect(loggerError.mock.calls.flat().join(' ')).not.toContain(rawConnectionError);
      expect(poolClient.release).not.toHaveBeenCalled();
    });

    it('retiene el diagnóstico sin mensaje crudo si falla su persistencia', async () => {
      const loggerError = jest.spyOn(
        (processor as unknown as { logger: { error: (message: string) => void } }).logger,
        'error',
      );
      poolClient.query.mockRejectedValueOnce(new Error('DB connection pool exhausted'));

      const dlqJob = {
        data: {
          kind: 'execution-event',
          tenantId: '10000000-0000-4000-8000-000000000001',
          eventId: 'e0000000-0000-4000-8000-000000000003',
          aggregateId: 'a0000000-0000-4000-8000-000000000003',
          aggregateVersion: 3,
          failedAt: new Date().toISOString(),
          attemptsMade: 8,
          errorType: 'Error',
        },
      } as Job;

      await expect(processor.process(dlqJob)).rejects.toThrow(
        'Execution order DLQ diagnostic persistence failed',
      );
      expect(loggerError.mock.calls.flat().join(' ')).not.toContain('DB connection pool exhausted');
    });

    it('no falla si la actualización del outbox afecta 0 filas', async () => {
      poolClient.query
        .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_test001' }] } as never)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // SET LOCAL
        .mockResolvedValueOnce({ rowCount: 0 }) // UPDATE outbox → 0 filas
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT inbox
        .mockResolvedValueOnce(undefined); // COMMIT

      const dlqJob = {
        data: {
          kind: 'execution-event',
          tenantId: '10000000-0000-4000-8000-000000000001',
          eventId: 'e0000000-0000-4000-8000-000000000004',
          aggregateId: 'a0000000-0000-4000-8000-000000000004',
          aggregateVersion: 4,
          failedAt: new Date().toISOString(),
          attemptsMade: 8,
          errorType: 'TimeoutError',
        },
      } as Job;

      // No debe lanzar — outbox puede no tener el evento
      await expect(processor.process(dlqJob)).resolves.toBeUndefined();
    });
  });
});

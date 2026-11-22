import { getQueueToken } from '@nestjs/bullmq';
import { PlatformHealthSample } from '@iwana/db';
import {
  MAINTENANCE_JOB_RETENTION,
  PLATFORM_API_QUEUE_NAMES,
  SAMPLED_QUEUE_NAMES,
} from '@iwana/shared';
import { PLATFORM_HEALTH_SAMPLER_QUEUE, WORKER_QUEUE_NAMES } from '../worker-queues';
import {
  PLATFORM_HEALTH_SAMPLE_INTERVAL_MS,
  PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
  PlatformHealthSamplerProcessor,
  resolveApiHealthUrl,
} from './platform-health-sampler.processor';

const now = new Date('2026-11-21T12:00:00.000Z');

function queueStub(waiting = 0, failed = 0, oldestTimestamp?: number, failedRecent = failed) {
  const zcount = jest.fn().mockResolvedValue(failedRecent);
  return {
    getJobCounts: jest.fn().mockResolvedValue({ waiting, failed }),
    getJobs: jest
      .fn()
      .mockResolvedValue(oldestTimestamp === undefined ? [] : [{ timestamp: oldestTimestamp }]),
    // B(b): fallidos recientes con ZCOUNT sobre el zset `failed` (puntaje = finishedOn en ms).
    client: Promise.resolve({ zcount }),
    clean: jest.fn().mockResolvedValue([]),
    keys: { failed: 'bull:cola:failed' },
    zcount,
  };
}

function build(options: {
  apiUrl?: string;
  dbFails?: boolean;
  ping?: () => Promise<string>;
  queues?: Record<string, ReturnType<typeof queueStub>>;
}) {
  const insert = jest.fn().mockResolvedValue(undefined);
  const execute = jest.fn().mockResolvedValue({ affected: 3 });
  const where = jest.fn().mockReturnValue({ execute });
  const queryBuilder = { delete: () => ({ from: () => ({ where }) }) };
  const dataSource = {
    query: options.dbFails
      ? jest.fn().mockRejectedValue(new Error('down'))
      : jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    getRepository: jest.fn().mockReturnValue({ insert }),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  };
  const ownQueue = {
    client: Promise.resolve({ ping: options.ping ?? (async () => 'PONG') }),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  };
  const queues = options.queues ?? {};
  const moduleRef = {
    get: jest.fn((token: string) => {
      const name = WORKER_QUEUE_NAMES.find((queueName) => getQueueToken(queueName) === token);
      const queue = name ? queues[name] : undefined;
      if (!queue) throw new Error('not found');
      return queue;
    }),
  };
  const config = { get: jest.fn().mockReturnValue(options.apiUrl) };
  const processor = new PlatformHealthSamplerProcessor(
    dataSource as never,
    ownQueue as never,
    moduleRef as never,
    config as never,
  );
  return { processor, insert, where, dataSource, ownQueue };
}

describe('resolveApiHealthUrl', () => {
  it('compone el health del API sobre el origen y rechaza valores no http(s)', () => {
    expect(resolveApiHealthUrl('http://api:3000')).toBe('http://api:3000/api/v1/health');
    expect(resolveApiHealthUrl('http://api:3000/otra/ruta')).toBe('http://api:3000/api/v1/health');
    expect(resolveApiHealthUrl(undefined)).toBeNull();
    expect(resolveApiHealthUrl('  ')).toBeNull();
    expect(resolveApiHealthUrl('ftp://api')).toBeNull();
    expect(resolveApiHealthUrl('no es url')).toBeNull();
    // L-2 (sec-eng F3-D3): usuario, contraseña y query se descartan; nunca se envían.
    expect(resolveApiHealthUrl('http://u:p@api:3000/x?y=1')).toBe('http://api:3000/api/v1/health');
  });
});

describe('PlatformHealthSamplerProcessor', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('registra un programador con id fijo cada 5 minutos', async () => {
    const { processor, ownQueue } = build({});
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    await processor.onApplicationBootstrap();
    expect(ownQueue.upsertJobScheduler).toHaveBeenCalledWith(
      PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
      { every: PLATFORM_HEALTH_SAMPLE_INTERVAL_MS },
      expect.objectContaining({ name: 'sample', data: {} }),
    );
    expect(PLATFORM_HEALTH_SAMPLE_INTERVAL_MS).toBe(300_000);
  });

  it('I-2: sin API_INTERNAL_URL o con un valor inválido avisa al arrancar sin imprimir el valor', async () => {
    for (const apiUrl of [undefined, 'ftp://secreto@api']) {
      const { processor } = build(apiUrl === undefined ? {} : { apiUrl });
      const warn = jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
      await processor.onApplicationBootstrap();
      expect(warn).toHaveBeenCalledWith(
        'platform_health.api_not_measured reason=API_INTERNAL_URL_missing_or_invalid',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secreto');
    }
  });

  it('L-1: cancela el cuerpo de la respuesta de la sonda tras leer el status', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({ status: 200, body: { cancel } }) as never;
    const { processor } = build({ apiUrl: 'http://api:3000' });
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    await expect(processor.sample(now)).resolves.toEqual(expect.objectContaining({ apiOk: true }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('L-1: si cancelar el cuerpo falla, la medición se conserva', async () => {
    const cancel = jest.fn().mockRejectedValue(new Error('ya cerrado'));
    global.fetch = jest.fn().mockResolvedValue({ status: 200, body: { cancel } }) as never;
    const { processor } = build({ apiUrl: 'http://api:3000' });
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    await expect(processor.sample(now)).resolves.toEqual(expect.objectContaining({ apiOk: true }));
  });

  it('sin API_INTERNAL_URL no mide el API (null, nunca OK) y no llama a fetch', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as never;
    const { processor, insert } = build({});
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    const result = await processor.sample(now);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.apiOk).toBeNull();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ sampledAt: now, apiOk: null, dbOk: true, redisOk: true }),
    );
  });

  it('mide API, DB, Redis y colas; antigüedad del trabajo más viejo y cola vacía', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 200 }) as never;
    // Todas las colas de la plataforma (worker y API); las del API llegan por `queueFor`.
    const queues = Object.fromEntries(SAMPLED_QUEUE_NAMES.map((name) => [name, queueStub()]));
    queues[PLATFORM_HEALTH_SAMPLER_QUEUE] = queueStub(2, 1, now.getTime() - 90_500);
    const { processor, insert, where, ownQueue } = build({ apiUrl: 'http://api:3000', queues });
    (ownQueue as unknown as { opts: unknown }).opts = { connection: {}, prefix: 'itest' };
    (processor as unknown as { queueFor: (name: string) => unknown }).queueFor = (name) =>
      queues[name];
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);

    const result = await processor.sample(now);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://api:3000/api/v1/health',
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(result).toEqual({
      apiOk: true,
      dbOk: true,
      redisOk: true,
      queues: SAMPLED_QUEUE_NAMES.length,
      pruned: 3,
    });
    const row = insert.mock.calls[0]?.[0] as PlatformHealthSample;
    expect(row.queues).toContainEqual({
      name: PLATFORM_HEALTH_SAMPLER_QUEUE,
      waiting: 2,
      failed: 1,
      failedRecent: 1,
      oldestWaitingSeconds: 90,
    });
    expect(row.queues).toContainEqual({
      name: WORKER_QUEUE_NAMES[0],
      waiting: 0,
      failed: 0,
      failedRecent: 0,
      oldestWaitingSeconds: null,
    });
    const [, params] = where.mock.calls[0] as [string, { cutoff: Date }];
    expect(params.cutoff.toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });

  it('B(b): failedRecent cuenta solo los fallidos de las últimas 72 h; failed sigue siendo el total', async () => {
    const queues = Object.fromEntries(WORKER_QUEUE_NAMES.map((name) => [name, queueStub()]));
    const viejos = queueStub(0, 5, undefined, 0);
    queues[PLATFORM_HEALTH_SAMPLER_QUEUE] = viejos;
    const { processor, insert } = build({ queues });
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    await processor.sample(now);

    expect(viejos.zcount).toHaveBeenCalledWith(
      'bull:cola:failed',
      now.getTime() - 72 * 60 * 60 * 1000,
      '+inf',
    );
    const row = insert.mock.calls[0]?.[0] as PlatformHealthSample;
    expect(row.queues).toContainEqual(
      expect.objectContaining({ name: PLATFORM_HEALTH_SAMPLER_QUEUE, failed: 5, failedRecent: 0 }),
    );
  });

  it('muestrea todas las colas de la plataforma, también las que procesa el API', async () => {
    const stubs = new Map<string, ReturnType<typeof queueStub>>(
      SAMPLED_QUEUE_NAMES.map((name) => [name, queueStub()]),
    );
    stubs.set('users-bulk-create', queueStub(0, 3, undefined, 2));
    const { processor, insert } = build({});
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    (processor as unknown as { queueFor: (name: string) => unknown }).queueFor = (name) =>
      stubs.get(name);

    const result = await processor.sample(now);

    expect(result.queues).toBe(SAMPLED_QUEUE_NAMES.length);
    const row = insert.mock.calls[0]?.[0] as PlatformHealthSample;
    const names = row.queues.map((queue) => queue.name);
    for (const name of PLATFORM_API_QUEUE_NAMES) expect(names).toContain(name);
    expect(row.queues).toContainEqual(
      expect.objectContaining({ name: 'users-bulk-create', failed: 3, failedRecent: 2 }),
    );
  });

  it('C-3: cada vuelta retira los fallidos más viejos que la edad de su familia', async () => {
    const stubs = new Map<string, ReturnType<typeof queueStub>>(
      SAMPLED_QUEUE_NAMES.map((name) => [name, queueStub()]),
    );
    stubs.get('tenant-provisioning')!.clean.mockResolvedValue(['viejo-1', 'viejo-2']);
    const { processor } = build({});
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    (processor as unknown as { queueFor: (name: string) => unknown }).queueFor = (name) =>
      stubs.get(name);

    await expect(processor.pruneExpiredFailures()).resolves.toBe(2);

    expect(stubs.get('tenant-provisioning')!.clean).toHaveBeenCalledWith(
      30 * 86_400 * 1000,
      1000,
      'failed',
    );
    expect(stubs.get('assurance-field-service')!.clean).toHaveBeenCalledWith(
      14 * 86_400 * 1000,
      1000,
      'failed',
    );
    expect(stubs.get('users-bulk-create')!.clean).toHaveBeenCalledWith(
      86_400 * 1000,
      1000,
      'failed',
    );
    // Las colas de OT tienen su propia limpieza (DLQ/relay): no se tocan aquí.
    expect(stubs.get('operations-execution-dlq')!.clean).not.toHaveBeenCalled();
  });

  it('C-3: la limpieza de una cola que falla no detiene a las demás', async () => {
    const stubs = new Map<string, ReturnType<typeof queueStub>>(
      SAMPLED_QUEUE_NAMES.map((name) => [name, queueStub()]),
    );
    stubs.get('refresh-token-purge')!.clean.mockRejectedValue(new Error('redis'));
    const { processor } = build({});
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    (processor as unknown as { queueFor: (name: string) => unknown }).queueFor = (name) =>
      stubs.get(name);

    await processor.pruneExpiredFailures();
    expect(stubs.get('tenant-provisioning')!.clean).toHaveBeenCalled();
  });

  it('B(b): el programador usa la retención de mantenimiento (familia M)', async () => {
    const { processor, ownQueue } = build({});
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    await processor.onApplicationBootstrap();
    expect(ownQueue.upsertJobScheduler).toHaveBeenCalledWith(
      PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
      expect.anything(),
      expect.objectContaining({ opts: MAINTENANCE_JOB_RETENTION }),
    );
  });

  it('registra fallos: API 503, DB caída, Redis sin PONG y cola ilegible se omite', async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 503 }) as never;
    const { processor, insert } = build({
      apiUrl: 'http://api:3000',
      dbFails: true,
      ping: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);

    const result = await processor.sample(now);

    expect(result).toEqual(
      expect.objectContaining({ apiOk: false, dbOk: false, redisOk: false, queues: 0 }),
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ queues: [] }));
  });

  it('un API que no responde cuenta como caído', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('aborted')) as never;
    const { processor } = build({ apiUrl: 'http://api:3000' });
    jest.spyOn(processor['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(processor['logger'], 'warn').mockImplementation(() => undefined);
    await expect(processor.sample(now)).resolves.toEqual(expect.objectContaining({ apiOk: false }));
  });

  it('process muestrea con la hora actual', async () => {
    const { processor } = build({});
    const spy = jest.spyOn(processor, 'sample').mockResolvedValue({} as never);
    await processor.process({} as never);
    expect(spy).toHaveBeenCalledWith(expect.any(Date));
  });
});

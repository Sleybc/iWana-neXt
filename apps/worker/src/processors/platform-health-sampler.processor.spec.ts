import { getQueueToken } from '@nestjs/bullmq';
import { PlatformHealthSample } from '@iwana/db';
import { PLATFORM_HEALTH_SAMPLER_QUEUE, WORKER_QUEUE_NAMES } from '../worker-queues';
import {
  PLATFORM_HEALTH_SAMPLE_INTERVAL_MS,
  PLATFORM_HEALTH_SAMPLER_SCHEDULER_ID,
  PlatformHealthSamplerProcessor,
  resolveApiHealthUrl,
} from './platform-health-sampler.processor';

const now = new Date('2026-11-21T12:00:00.000Z');

function queueStub(waiting = 0, failed = 0, oldestTimestamp?: number) {
  return {
    getJobCounts: jest.fn().mockResolvedValue({ waiting, failed }),
    getJobs: jest
      .fn()
      .mockResolvedValue(oldestTimestamp === undefined ? [] : [{ timestamp: oldestTimestamp }]),
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
    const queues = Object.fromEntries(WORKER_QUEUE_NAMES.map((name) => [name, queueStub()]));
    queues[PLATFORM_HEALTH_SAMPLER_QUEUE] = queueStub(2, 1, now.getTime() - 90_500);
    const { processor, insert, where } = build({ apiUrl: 'http://api:3000', queues });
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
      queues: WORKER_QUEUE_NAMES.length,
      pruned: 3,
    });
    const row = insert.mock.calls[0]?.[0] as PlatformHealthSample;
    expect(row.queues).toContainEqual({
      name: PLATFORM_HEALTH_SAMPLER_QUEUE,
      waiting: 2,
      failed: 1,
      oldestWaitingSeconds: 90,
    });
    expect(row.queues).toContainEqual({
      name: WORKER_QUEUE_NAMES[0],
      waiting: 0,
      failed: 0,
      oldestWaitingSeconds: null,
    });
    const [, params] = where.mock.calls[0] as [string, { cutoff: Date }];
    expect(params.cutoff.toISOString()).toBe('2026-10-17T12:00:00.000Z');
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

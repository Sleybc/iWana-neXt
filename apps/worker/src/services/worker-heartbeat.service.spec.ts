import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  DEFAULT_WORKER_HEARTBEAT_INTERVAL_SECONDS,
  DEFAULT_WORKER_HEARTBEAT_TTL_SECONDS,
  resolveWorkerHeartbeatTiming,
  WORKER_HEARTBEAT_PREFIX,
} from './worker-heartbeat.health';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

describe('WorkerHeartbeatService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('renews an expiring Redis heartbeat for the production worker', async () => {
    jest.useFakeTimers();
    const redis = { set: jest.fn().mockResolvedValue('OK') } as unknown as Redis;
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'production' : undefined)),
    } as unknown as ConfigService;
    const service = new WorkerHeartbeatService(redis, config);

    service.onApplicationBootstrap();
    await Promise.resolve();

    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(WORKER_HEARTBEAT_PREFIX),
      expect.stringMatching(/^\d+$/),
      'EX',
      DEFAULT_WORKER_HEARTBEAT_TTL_SECONDS,
    );

    await jest.advanceTimersByTimeAsync(DEFAULT_WORKER_HEARTBEAT_INTERVAL_SECONDS * 1000);
    expect(redis.set).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(DEFAULT_WORKER_HEARTBEAT_INTERVAL_SECONDS * 2000);
    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('does not publish health keys outside production unless explicitly enabled', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as unknown as Redis;
    const config = {
      get: jest.fn((key: string) => (key === 'NODE_ENV' ? 'development' : undefined)),
    } as unknown as ConfigService;
    const service = new WorkerHeartbeatService(redis, config);

    service.onApplicationBootstrap();
    await Promise.resolve();

    expect(redis.set).not.toHaveBeenCalled();
    service.onApplicationShutdown();
  });

  it('allows the heartbeat to be enabled by the E2E runtime', async () => {
    const redis = { set: jest.fn().mockResolvedValue('OK') } as unknown as Redis;
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'WORKER_HEARTBEAT_ENABLED') return 'true';
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new WorkerHeartbeatService(redis, config);

    service.onApplicationBootstrap();
    await Promise.resolve();

    expect(redis.set).toHaveBeenCalledTimes(1);
    service.onApplicationShutdown();
  });

  it('validates the configured interval and TTL relationship', () => {
    expect(resolveWorkerHeartbeatTiming('5', '15')).toEqual({ intervalSeconds: 5, ttlSeconds: 15 });
    expect(() => resolveWorkerHeartbeatTiming('10', '10')).toThrow(
      'WORKER_HEARTBEAT_TTL_SECONDS debe ser al menos el doble del intervalo.',
    );
  });
});

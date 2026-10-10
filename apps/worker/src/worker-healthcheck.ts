import Redis from 'ioredis';
import { hostname } from 'node:os';
import {
  isWorkerHeartbeatFresh,
  resolveWorkerHeartbeatTiming,
  WORKER_HEARTBEAT_PREFIX,
} from './services/worker-heartbeat.health';

async function checkWorkerHeartbeat(): Promise<void> {
  const { ttlSeconds } = resolveWorkerHeartbeatTiming(
    process.env['WORKER_HEARTBEAT_INTERVAL_SECONDS'],
    process.env['WORKER_HEARTBEAT_TTL_SECONDS'],
  );
  const redis = new Redis({
    host: process.env['REDIS_HOST'] || 'redis',
    port: Number(process.env['REDIS_PORT'] || 6379),
    password: process.env['REDIS_PASSWORD'],
    db: Number(process.env['REDIS_DB'] || 0),
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  const timeout = setTimeout(() => {
    redis.disconnect();
    process.exit(1);
  }, 4000);

  try {
    await redis.connect();
    const heartbeat = await redis.get(`${WORKER_HEARTBEAT_PREFIX}${hostname()}`);
    if (!isWorkerHeartbeatFresh(heartbeat, Date.now(), ttlSeconds)) {
      process.exitCode = 1;
    }
  } catch {
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    redis.disconnect();
  }
}

void checkWorkerHeartbeat();

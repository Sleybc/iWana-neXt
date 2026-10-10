export const WORKER_HEARTBEAT_PREFIX = 'iwana:worker:heartbeat:';
export const DEFAULT_WORKER_HEARTBEAT_INTERVAL_SECONDS = 10;
export const DEFAULT_WORKER_HEARTBEAT_TTL_SECONDS = 30;

const MAX_WORKER_HEARTBEAT_SECONDS = 3600;

function positiveSeconds(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WORKER_HEARTBEAT_SECONDS) {
    throw new Error(`${name} debe ser un entero entre 1 y ${MAX_WORKER_HEARTBEAT_SECONDS}.`);
  }

  return parsed;
}

export function resolveWorkerHeartbeatTiming(
  intervalValue: unknown,
  ttlValue: unknown,
): { intervalSeconds: number; ttlSeconds: number } {
  const intervalSeconds = positiveSeconds(
    intervalValue,
    DEFAULT_WORKER_HEARTBEAT_INTERVAL_SECONDS,
    'WORKER_HEARTBEAT_INTERVAL_SECONDS',
  );
  const ttlSeconds = positiveSeconds(
    ttlValue,
    DEFAULT_WORKER_HEARTBEAT_TTL_SECONDS,
    'WORKER_HEARTBEAT_TTL_SECONDS',
  );

  if (ttlSeconds < intervalSeconds * 2) {
    throw new Error('WORKER_HEARTBEAT_TTL_SECONDS debe ser al menos el doble del intervalo.');
  }

  return { intervalSeconds, ttlSeconds };
}

export function isWorkerHeartbeatFresh(
  value: string | null,
  nowMs: number,
  ttlSeconds: number,
): boolean {
  if (value === null || !/^\d+$/u.test(value)) {
    return false;
  }

  const timestamp = Number(value);
  if (!Number.isSafeInteger(timestamp)) {
    return false;
  }

  const ageMs = nowMs - timestamp;
  return ageMs >= 0 && ageMs <= ttlSeconds * 1000;
}

import { resolveWorkerHeartbeatTiming } from './services/worker-heartbeat.health';

/**
 * Redis autentica también en desarrollo. Se valida después de cargar los
 * archivos de entorno para fallar antes de crear productores y workers.
 */
export function validateWorkerConfiguration(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const redisPassword = environment['REDIS_PASSWORD'];

  if (typeof redisPassword !== 'string' || redisPassword.trim().length === 0) {
    throw new Error('REDIS_PASSWORD es obligatoria para autenticar Redis.');
  }

  resolveWorkerHeartbeatTiming(
    environment['WORKER_HEARTBEAT_INTERVAL_SECONDS'],
    environment['WORKER_HEARTBEAT_TTL_SECONDS'],
  );

  const heartbeatEnabled = environment['WORKER_HEARTBEAT_ENABLED'];
  if (
    heartbeatEnabled !== undefined &&
    heartbeatEnabled !== 'true' &&
    heartbeatEnabled !== 'false'
  ) {
    throw new Error('WORKER_HEARTBEAT_ENABLED debe ser true o false.');
  }

  return environment;
}

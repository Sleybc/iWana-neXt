import { validateWorkerConfiguration } from './worker.config';

describe('validateWorkerConfiguration', () => {
  it.each([undefined, '', '   '])('rechaza REDIS_PASSWORD ausente o vacía (%s)', (value) => {
    expect(() => validateWorkerConfiguration({ REDIS_PASSWORD: value })).toThrow(
      'REDIS_PASSWORD es obligatoria para autenticar Redis.',
    );
  });

  it('conserva la configuración con una contraseña presente', () => {
    const environment = { REDIS_PASSWORD: 'test-only-redis-password' };

    expect(validateWorkerConfiguration(environment)).toBe(environment);
  });

  it('rechaza un intervalo y TTL incompatibles para el heartbeat', () => {
    expect(() =>
      validateWorkerConfiguration({
        REDIS_PASSWORD: 'test-only-redis-password',
        WORKER_HEARTBEAT_INTERVAL_SECONDS: '10',
        WORKER_HEARTBEAT_TTL_SECONDS: '10',
      }),
    ).toThrow('WORKER_HEARTBEAT_TTL_SECONDS debe ser al menos el doble del intervalo.');
  });

  it('rechaza valores ambiguos para habilitar el heartbeat', () => {
    expect(() =>
      validateWorkerConfiguration({
        REDIS_PASSWORD: 'test-only-redis-password',
        WORKER_HEARTBEAT_ENABLED: 'yes',
      }),
    ).toThrow('WORKER_HEARTBEAT_ENABLED debe ser true o false.');
  });
});

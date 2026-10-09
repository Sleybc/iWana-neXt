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
});

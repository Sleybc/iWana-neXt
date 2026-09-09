import { randomBytes } from 'node:crypto';
import type * as Joi from 'joi';
import { createAppConfigurationSchema } from './app.config';

/**
 * TTL de sesion configurables (JWT_ACCESS_EXPIRATION / JWT_REFRESH_EXPIRATION).
 *
 * El formato `<numero><s|m|h|d>` y el minimo por token se validan al arranque:
 * un valor invalido o absurdo (ej. un access de 1s) debe tumbar el proceso en
 * vez de dejar sesiones que expiran al instante. Los defaults y el parser viven
 * en modules/auth/token-ttl.constants.ts.
 */

// Opciones efectivas de @nestjs/config (ver app.config.production-urls.spec.ts).
const VALIDATION_OPTIONS = { abortEarly: false, allowUnknown: true } as const;

/** Entorno mínimo que satisface el resto del esquema en perfil desarrollo. */
function buildDevelopmentEnv(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DB_NAME: 'iwana_test',
    DB_USER: 'iwana_app_test',
    DB_PASSWORD: 'not-a-real-password',
    JWT_PRIVATE_KEY: 'test-only-private-key-material',
    JWT_PUBLIC_KEY: 'test-only-public-key-material',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_HASH_KEY: randomBytes(32).toString('hex'),
  };
}

function validate(env: Record<string, string | undefined>): Joi.ValidationResult {
  return createAppConfigurationSchema().validate(env, VALIDATION_OPTIONS);
}

describe('createAppConfigurationSchema — TTL de sesion configurables', () => {
  it('aplica los defaults 15m y 7d cuando las variables faltan', () => {
    const env = buildDevelopmentEnv();

    const { error, value } = validate(env);

    expect(error).toBeUndefined();
    expect(value['JWT_ACCESS_EXPIRATION']).toBe('15m');
    expect(value['JWT_REFRESH_EXPIRATION']).toBe('7d');
  });

  it.each([
    ['JWT_ACCESS_EXPIRATION', '60s'],
    ['JWT_ACCESS_EXPIRATION', '15m'],
    ['JWT_ACCESS_EXPIRATION', '2h'],
    ['JWT_REFRESH_EXPIRATION', '1d'],
    ['JWT_REFRESH_EXPIRATION', '7d'],
  ] as const)('acepta %s=%s', (key, raw) => {
    const env = buildDevelopmentEnv();
    env[key] = raw;

    const { error, value } = validate(env);

    expect(error).toBeUndefined();
    expect(value[key]).toBe(raw);
  });

  it.each([
    ['JWT_ACCESS_EXPIRATION', '15'],
    ['JWT_ACCESS_EXPIRATION', '15w'],
    ['JWT_ACCESS_EXPIRATION', 'quince'],
    ['JWT_REFRESH_EXPIRATION', '7.5d'],
    ['JWT_REFRESH_EXPIRATION', ''],
  ] as const)('rechaza %s=%s por formato invalido', (key, raw) => {
    const env = buildDevelopmentEnv();
    env[key] = raw;

    const { error } = validate(env);

    expect(error).toBeDefined();
    expect(error?.message).toContain(key);
  });

  it.each([
    ['JWT_ACCESS_EXPIRATION', '30s'],
    ['JWT_REFRESH_EXPIRATION', '5s'],
  ] as const)('rechaza %s=%s por debajo del minimo de 60s', (key, raw) => {
    const env = buildDevelopmentEnv();
    env[key] = raw;

    const { error } = validate(env);

    expect(error).toBeDefined();
    expect(error?.message).toContain('al menos 60 segundos');
  });
});

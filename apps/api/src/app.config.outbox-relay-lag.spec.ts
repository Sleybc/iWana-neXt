import { randomBytes } from 'node:crypto';
import type * as Joi from 'joi';
import { createAppConfigurationSchema } from './app.config';

/**
 * Umbrales del relay de outbox: sin valores aprobados, `.env.production.example` los deja
 * vacíos y Compose los entrega como ''. Vacío debe equivaler a ausente; un valor no numérico
 * sigue tumbando el arranque (plan 2026-11-24, arranque del entorno estable).
 */
const VALIDATION_OPTIONS = { abortEarly: false, allowUnknown: true } as const;

function buildEnv(extra: Record<string, string>): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DB_NAME: 'iwana_test',
    DB_USER: 'iwana_app_test',
    DB_PASSWORD: 'not-a-real-password',
    REDIS_PASSWORD: 'test-only-redis-password',
    JWT_PRIVATE_KEY: 'test-only-private-key-material',
    JWT_PUBLIC_KEY: 'test-only-public-key-material',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_HASH_KEY: randomBytes(32).toString('hex'),
    ...extra,
  };
}

function validate(env: Record<string, string>): Joi.ValidationResult {
  return createAppConfigurationSchema().validate(env, VALIDATION_OPTIONS);
}

describe('createAppConfigurationSchema — umbrales del relay de outbox', () => {
  it('trata los umbrales vacíos como ausentes', () => {
    const { error, value } = validate(
      buildEnv({ OUTBOX_RELAY_LAG_DEGRADED_SECONDS: '', OUTBOX_RELAY_LAG_STOPPED_SECONDS: '' }),
    );
    expect(error).toBeUndefined();
    expect(value.OUTBOX_RELAY_LAG_DEGRADED_SECONDS).toBeUndefined();
    expect(value.OUTBOX_RELAY_LAG_STOPPED_SECONDS).toBeUndefined();
  });

  it('acepta enteros y rechaza valores no numéricos', () => {
    expect(validate(buildEnv({ OUTBOX_RELAY_LAG_DEGRADED_SECONDS: '60' })).value).toMatchObject({
      OUTBOX_RELAY_LAG_DEGRADED_SECONDS: 60,
    });
    expect(validate(buildEnv({ OUTBOX_RELAY_LAG_STOPPED_SECONDS: 'abc' })).error).toBeDefined();
  });
});

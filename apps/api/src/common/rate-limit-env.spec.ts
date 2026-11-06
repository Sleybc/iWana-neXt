import { randomBytes } from 'node:crypto';
import {
  assertRateLimitE2EAllowed,
  isRateLimitE2ERelaxed,
  RATE_LIMIT_E2E_MULTIPLIER,
  resolveRouteRateLimit,
} from './rate-limit-env';
import { createAppConfigurationSchema } from '../app.config';

// CA-6 — La API no arranca con RATE_LIMIT_E2E_RELAXED en producción.
// La válvula solo existe en el entorno E2E: con NODE_ENV=production el
// esquema Joi (bootstrap de ConfigModule) y el helper de los decoradores
// rechazan el valor `true`. Solo multiplica límites de ruta (x100);
// nunca toca el límite global ni el tracker (no se prueban aquí: se
// comprueban por código — `app.module.ts` y `rate-limit-tracker.ts`
// quedan intactos en este cambio).

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    DB_NAME: 'test',
    DB_USER: 'iwana',
    DB_PASSWORD: '',
    REDIS_PASSWORD: 'redis-test-pass',
    JWT_PRIVATE_KEY: 'test-private-key',
    JWT_PUBLIC_KEY: 'test-public-key',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_HASH_KEY: randomBytes(32).toString('hex'),
  };
}

describe('CA-6 — RATE_LIMIT_E2E_RELAXED rechaza el arranque en producción', () => {
  it('multiplica solo los límites de ruta x100 cuando está en true fuera de producción', () => {
    const env = { ...baseEnv(), RATE_LIMIT_E2E_RELAXED: 'true' };
    expect(isRateLimitE2ERelaxed(env)).toBe(true);
    expect(resolveRouteRateLimit(30, env)).toBe(30 * RATE_LIMIT_E2E_MULTIPLIER);
    expect(resolveRouteRateLimit(5, env)).toBe(5 * RATE_LIMIT_E2E_MULTIPLIER);
  });

  it('no multiplica cuando no está definido', () => {
    expect(isRateLimitE2ERelaxed(baseEnv())).toBe(false);
    expect(resolveRouteRateLimit(30, baseEnv())).toBe(30);
  });

  it('el helper lanza con NODE_ENV=production y RATE_LIMIT_E2E_RELAXED=true', () => {
    const env = {
      ...baseEnv(),
      NODE_ENV: 'production',
      RATE_LIMIT_E2E_RELAXED: 'true',
    };
    expect(() => assertRateLimitE2EAllowed(env)).toThrow(/NODE_ENV=production/);
    expect(() => resolveRouteRateLimit(10, env)).toThrow(/NODE_ENV=production/);
  });

  it('el esquema de configuración rechaza production + true (bootstrap fail-fast)', () => {
    const schema = createAppConfigurationSchema();
    const { error } = schema.validate({
      ...baseEnv(),
      NODE_ENV: 'production',
      RATE_LIMIT_E2E_RELAXED: true,
      PII_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      INTERNAL_QUEUE_SIGNING_KEY: Buffer.alloc(32, 1).toString('base64'),
      CORS_ORIGIN: 'https://web.example.test,https://portal.example.test',
      FRONTEND_URL: 'https://web.example.test',
      STORAGE_DRIVER: 'minio',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
      TYPESENSE_HOST: 'typesense.example.test',
      TYPESENSE_API_KEY: 'test',
    });
    expect(error).toBeDefined();
    expect(error?.message).toContain('RATE_LIMIT_E2E_RELAXED');
  });

  it('el esquema acepta production sin la variable y development con true', () => {
    const schema = createAppConfigurationSchema();
    const production = schema.validate({
      ...baseEnv(),
      NODE_ENV: 'production',
      PII_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      INTERNAL_QUEUE_SIGNING_KEY: Buffer.alloc(32, 1).toString('base64'),
      CORS_ORIGIN: 'https://web.example.test,https://portal.example.test',
      FRONTEND_URL: 'https://web.example.test',
      STORAGE_DRIVER: 'minio',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test',
      TYPESENSE_HOST: 'typesense.example.test',
      TYPESENSE_API_KEY: 'test',
    });
    expect(production.error).toBeUndefined();
    const e2e = schema.validate({ ...baseEnv(), RATE_LIMIT_E2E_RELAXED: true });
    expect(e2e.error).toBeUndefined();
  });
});

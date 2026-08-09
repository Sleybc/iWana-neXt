import { randomBytes } from 'node:crypto';
import type * as Joi from 'joi';
import { createAppConfigurationSchema } from './app.config';

/**
 * C-5 (ADR-081): `COOKIE_SECURE` no puede quedar en `false` con
 * NODE_ENV=production. Sin `Secure`, un navegador por HTTP enviaría las
 * cookies de sesión en claro y el prefijo `__Host-` sería inválido.
 *
 * El acople vive en el esquema de validación (app.config.ts), no solo en un
 * overlay de Compose: si un despliegue productivo arranca sin la variable o con
 * el valor en false, debe fallar al arrancar.
 */

// Opciones efectivas de @nestjs/config (ver app.config.production-urls.spec.ts).
const VALIDATION_OPTIONS = { abortEarly: false, allowUnknown: true } as const;

/** Entorno mínimo que satisface el resto del esquema en perfil producción. */
function buildProductionEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DB_NAME: 'iwana_test',
    DB_USER: 'iwana_app_test',
    DB_PASSWORD: 'not-a-real-password',
    JWT_PRIVATE_KEY: 'test-only-private-key-material',
    JWT_PUBLIC_KEY: 'test-only-public-key-material',
    EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    PII_HASH_KEY: randomBytes(32).toString('hex'),
    STORAGE_DRIVER: 'minio',
    S3_ACCESS_KEY_ID: 'test-only-access-key-id',
    S3_SECRET_ACCESS_KEY: 'test-only-secret-access-key',
    TYPESENSE_HOST: 'typesense',
    TYPESENSE_API_KEY: 'test-only-typesense-key',
    CORS_ORIGIN: 'https://app.ejemplo.example,https://portal.ejemplo.example',
    FRONTEND_URL: 'https://app.ejemplo.example',
  };
}

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

describe('createAppConfigurationSchema — COOKIE_SECURE acoplado a producción (ADR-081 C-5)', () => {
  describe('perfil producción', () => {
    it('arranca sin COOKIE_SECURE y aplica el default seguro (true)', () => {
      const env = buildProductionEnv();
      delete env['COOKIE_SECURE'];

      const { error, value } = validate(env);

      expect(error).toBeUndefined();
      expect(value['COOKIE_SECURE']).toBe(true);
    });

    it('arranca con COOKIE_SECURE=true', () => {
      const env = buildProductionEnv();
      env['COOKIE_SECURE'] = 'true';

      const { error, value } = validate(env);

      expect(error).toBeUndefined();
      expect(value['COOKIE_SECURE']).toBe(true);
    });

    it('rechaza COOKIE_SECURE=false con un mensaje explícito', () => {
      const env = buildProductionEnv();
      env['COOKIE_SECURE'] = 'false';

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain('COOKIE_SECURE debe ser true con NODE_ENV=production');
    });
  });

  describe('fuera de producción', () => {
    it('default false sin la variable (HTTP on-prem de desarrollo)', () => {
      const env = buildDevelopmentEnv();
      delete env['COOKIE_SECURE'];

      const { error, value } = validate(env);

      expect(error).toBeUndefined();
      expect(value['COOKIE_SECURE']).toBe(false);
    });

    it('respeta un valor explícito true en desarrollo', () => {
      const env = buildDevelopmentEnv();
      env['COOKIE_SECURE'] = 'true';

      const { error, value } = validate(env);

      expect(error).toBeUndefined();
      expect(value['COOKIE_SECURE']).toBe(true);
    });
  });
});

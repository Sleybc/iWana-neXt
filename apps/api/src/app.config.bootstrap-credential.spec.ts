import { randomBytes } from 'node:crypto';
import type * as Joi from 'joi';
import { createAppConfigurationSchema } from './app.config';

/**
 * MOD01 §3.2 — la credencial de arranque no puede existir en producción.
 *
 * `PLATFORM_SUPER_ADMIN_EMAIL` / `PLATFORM_SUPER_ADMIN_PASSWORD` crean el primer
 * superusuario de la consola de plataforma a partir del fichero de entorno. Esa
 * credencial la conoce todo el que despliega, y el cambio forzado del primer
 * ingreso acota la ventana pero no la cierra: entre el arranque y el primer
 * login, cualquiera con el fichero puede entrar. Fuera de producción es la vía
 * normal de arranque; dentro es un defecto, y el esquema lo rechaza al arrancar.
 *
 * Sin credenciales reales: los valores son marcadores evidentes o material
 * generado en memoria.
 */

// Opciones efectivas de @nestjs/config (ver app.config.production-urls.spec.ts).
const VALIDATION_OPTIONS = { abortEarly: false, allowUnknown: true } as const;

/** Dominio reservado para ejemplos (RFC 2606) — nunca un dominio real. */
const PRODUCTION_ORIGIN = 'https://app.ejemplo.example';

/** Marcador evidente, no una contraseña: solo debe satisfacer la longitud mínima. */
const BOOTSTRAP_PASSWORD_PLACEHOLDER = 'marcador-de-prueba-no-es-una-credencial';
const BOOTSTRAP_EMAIL_PLACEHOLDER = 'arranque@ejemplo.example';

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
    CORS_ORIGIN: PRODUCTION_ORIGIN,
    FRONTEND_URL: PRODUCTION_ORIGIN,
  };
}

function buildDevelopmentEnv(): Record<string, string> {
  return {
    NODE_ENV: 'development',
    DB_NAME: 'iwana_dev',
    DB_USER: 'iwana',
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

describe('createAppConfigurationSchema — credencial de arranque de plataforma', () => {
  describe('perfil producción: la credencial de arranque está prohibida', () => {
    it('rechaza el arranque si se define PLATFORM_SUPER_ADMIN_PASSWORD', () => {
      const env = buildProductionEnv();
      env['PLATFORM_SUPER_ADMIN_PASSWORD'] = BOOTSTRAP_PASSWORD_PLACEHOLDER;

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        'PLATFORM_SUPER_ADMIN_PASSWORD no puede definirse con NODE_ENV=production',
      );
      expect(error?.message).toContain('bootstrap autenticado');
    });

    it('rechaza el arranque si se define PLATFORM_SUPER_ADMIN_EMAIL', () => {
      const env = buildProductionEnv();
      env['PLATFORM_SUPER_ADMIN_EMAIL'] = BOOTSTRAP_EMAIL_PLACEHOLDER;

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain(
        'PLATFORM_SUPER_ADMIN_EMAIL no puede definirse con NODE_ENV=production',
      );
    });

    it('el mensaje nunca reproduce el valor recibido', () => {
      // Un mensaje de error que eco la credencial la deja en los logs de arranque.
      const env = buildProductionEnv();
      env['PLATFORM_SUPER_ADMIN_PASSWORD'] = BOOTSTRAP_PASSWORD_PLACEHOLDER;

      const { error } = validate(env);

      expect(error?.message).not.toContain(BOOTSTRAP_PASSWORD_PLACEHOLDER);
    });

    it('sin las variables, el perfil de producción valida sin error', () => {
      const { error } = validate(buildProductionEnv());

      expect(error).toBeUndefined();
    });

    it('una variable declarada pero vacía no bloquea el arranque', () => {
      // Un `.env` compartido suele arrastrar claves vacías. El hueco no es una
      // credencial: rechazarlo convertiría el control en un estorbo operativo.
      const env = buildProductionEnv();
      env['PLATFORM_SUPER_ADMIN_EMAIL'] = '';
      env['PLATFORM_SUPER_ADMIN_PASSWORD'] = '';

      const { error } = validate(env);

      expect(error).toBeUndefined();
    });
  });

  describe('fuera de producción: sigue siendo la vía normal de arranque', () => {
    it('acepta ambas variables en desarrollo', () => {
      const env = buildDevelopmentEnv();
      env['PLATFORM_SUPER_ADMIN_EMAIL'] = BOOTSTRAP_EMAIL_PLACEHOLDER;
      env['PLATFORM_SUPER_ADMIN_PASSWORD'] = BOOTSTRAP_PASSWORD_PLACEHOLDER;

      const { error } = validate(env);

      expect(error).toBeUndefined();
    });

    it('siguen siendo opcionales: su ausencia no rompe el arranque', () => {
      const { error } = validate(buildDevelopmentEnv());

      expect(error).toBeUndefined();
    });

    it('rechaza un email de arranque mal formado antes de crear la cuenta', () => {
      const env = buildDevelopmentEnv();
      env['PLATFORM_SUPER_ADMIN_EMAIL'] = 'no-es-un-email';

      const { error } = validate(env);

      expect(error).toBeDefined();
    });

    it('rechaza una credencial de arranque más corta que la política de cambio', () => {
      // Si el arranque admitiera una contraseña que el endpoint de cambio
      // rechaza (mín. 10), el primer ingreso quedaría en un callejón sin salida.
      const env = buildDevelopmentEnv();
      env['PLATFORM_SUPER_ADMIN_PASSWORD'] = 'corta';

      const { error } = validate(env);

      expect(error).toBeDefined();
    });
  });
});

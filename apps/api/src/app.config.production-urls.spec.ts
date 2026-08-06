import { randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import type * as Joi from 'joi';
import { createAppConfigurationSchema } from './app.config';

/**
 * Puerta 1 del plan PLAT-OPS-G7 (Fase 1, riesgos 1 y 2 de ADR-070).
 *
 * `FRONTEND_URL` y `CORS_ORIGIN` eran opcionales o traían default a localhost:
 * en perfil de producción la API arrancaba sin fallo visible y los correos de
 * reset y verificación salían con enlaces a `http://localhost:3001`.
 *
 * Este spec demuestra los DOS lados del criterio de aceptación:
 * sin las variables el arranque falla con mensaje explícito; con ellas arranca.
 * Y verifica que el endurecimiento no alcanza a desarrollo ni a test.
 */

// Opciones efectivas de @nestjs/config: `allowUnknown` se fuerza a true cuando
// no se declara (config.module.js → getSchemaValidationOptions), y app.module.ts
// solo fija `abortEarly: false`.
const VALIDATION_OPTIONS = { abortEarly: false, allowUnknown: true } as const;

/** Dominio reservado para ejemplos (RFC 2606) — nunca un dominio real. */
const PRODUCTION_ORIGIN = 'https://app.ejemplo.example';
const PORTAL_ORIGIN = 'https://portal.ejemplo.example';

/**
 * Entorno mínimo que satisface el resto del esquema en perfil producción.
 * Los valores se generan en memoria o son marcadores evidentes: no hay
 * credenciales ni material criptográfico real versionado.
 */
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
    CORS_ORIGIN: `${PRODUCTION_ORIGIN},${PORTAL_ORIGIN}`,
    FRONTEND_URL: PRODUCTION_ORIGIN,
  };
}

function validate(env: Record<string, string | undefined>): Joi.ValidationResult {
  return createAppConfigurationSchema().validate(env, VALIDATION_OPTIONS);
}

describe('createAppConfigurationSchema — CORS_ORIGIN y FRONTEND_URL en producción', () => {
  describe('perfil producción: la configuración incompleta debe fallar', () => {
    it('rechaza el arranque sin FRONTEND_URL con un mensaje explícito', () => {
      const env = buildProductionEnv();
      delete env['FRONTEND_URL'];

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain('FRONTEND_URL es obligatoria con NODE_ENV=production');
      expect(error?.message).toContain('correos de reset y verificación');
    });

    it('rechaza el arranque sin CORS_ORIGIN con un mensaje explícito', () => {
      const env = buildProductionEnv();
      delete env['CORS_ORIGIN'];

      const { error } = validate(env);

      expect(error).toBeDefined();
      expect(error?.message).toContain('CORS_ORIGIN es obligatorio con NODE_ENV=production');
    });

    it('acumula ambos fallos en el mismo arranque (abortEarly: false)', () => {
      const env = buildProductionEnv();
      delete env['CORS_ORIGIN'];
      delete env['FRONTEND_URL'];

      const { error } = validate(env);

      expect(error?.details).toHaveLength(2);
      expect(error?.details.map((detail) => detail.path.join('.')).sort()).toEqual([
        'CORS_ORIGIN',
        'FRONTEND_URL',
      ]);
    });

    it.each([
      ['http://localhost:3001'],
      ['http://127.0.0.1:3001'],
      ['http://app.localhost'],
      ['http://[::1]:3001'],
    ])('rechaza FRONTEND_URL apuntando a %s', (url) => {
      const { error } = validate({ ...buildProductionEnv(), FRONTEND_URL: url });

      expect(error?.message).toContain('FRONTEND_URL no puede apuntar a localhost/127.0.0.1');
    });

    it('rechaza CORS_ORIGIN si cualquier entrada de la lista es de desarrollo', () => {
      const { error } = validate({
        ...buildProductionEnv(),
        CORS_ORIGIN: `${PRODUCTION_ORIGIN},http://localhost:3002`,
      });

      expect(error?.message).toContain('CORS_ORIGIN no puede apuntar a localhost/127.0.0.1');
    });

    it.each([['ejemplo.example'], ['ftp://ejemplo.example'], ['   ']])(
      'rechaza FRONTEND_URL que no es una URL absoluta http(s): %s',
      (url) => {
        const { error } = validate({ ...buildProductionEnv(), FRONTEND_URL: url });

        expect(error?.message).toContain('FRONTEND_URL debe ser una URL absoluta http(s)');
      },
    );

    it('rechaza CORS_ORIGIN que no es una lista de orígenes absolutos', () => {
      const { error } = validate({ ...buildProductionEnv(), CORS_ORIGIN: 'app.ejemplo.example' });

      expect(error?.message).toContain('CORS_ORIGIN debe ser una lista de orígenes absolutos');
    });
  });

  describe('perfil producción: la configuración completa debe arrancar', () => {
    it('acepta ambas variables con dominios reales y las deja intactas', () => {
      const { error, value } = validate(buildProductionEnv());

      expect(error).toBeUndefined();
      expect(value['FRONTEND_URL']).toBe(PRODUCTION_ORIGIN);
      expect(value['CORS_ORIGIN']).toBe(`${PRODUCTION_ORIGIN},${PORTAL_ORIGIN}`);
    });

    // DB_HOST y REDIS_HOST sí conservan default a localhost: el overlay de
    // producción los sobrescribe con los nombres de servicio de Compose. La
    // Puerta 1 solo cubre las dos variables que viajan al usuario final.
    it('no deja ningún default a localhost en las dos variables endurecidas', () => {
      const { value } = validate(buildProductionEnv());

      expect(value['CORS_ORIGIN']).not.toContain('localhost');
      expect(value['FRONTEND_URL']).not.toContain('localhost');
    });
  });

  describe('el endurecimiento no alcanza a desarrollo ni a test', () => {
    it('mantiene el default de desarrollo de CORS_ORIGIN y FRONTEND_URL opcional', () => {
      const { error, value } = validate({
        NODE_ENV: 'development',
        DB_NAME: 'iwana_next',
        DB_USER: 'iwana',
        DB_PASSWORD: '',
        JWT_PRIVATE_KEY: 'test-only-private-key-material',
        JWT_PUBLIC_KEY: 'test-only-public-key-material',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
        MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
        PII_HASH_KEY: randomBytes(32).toString('hex'),
      });

      expect(error).toBeUndefined();
      expect(value['CORS_ORIGIN']).toBe('http://localhost:3001,http://localhost:3002');
      expect(value['FRONTEND_URL']).toBeUndefined();
    });

    it('sin NODE_ENV explícito cae en el perfil de desarrollo, no en el endurecido', () => {
      const { error, value } = validate({
        DB_NAME: 'iwana_next',
        DB_USER: 'iwana',
        DB_PASSWORD: '',
        JWT_PRIVATE_KEY: 'test-only-private-key-material',
        JWT_PUBLIC_KEY: 'test-only-public-key-material',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: randomBytes(32).toString('hex'),
        MFA_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
        PII_HASH_KEY: randomBytes(32).toString('hex'),
      });

      expect(error).toBeUndefined();
      expect(value['NODE_ENV']).toBe('development');
      expect(value['CORS_ORIGIN']).toBe('http://localhost:3001,http://localhost:3002');
    });
  });
});

/**
 * El bloque anterior valida el esquema; este valida el arranque real: es
 * `ConfigModule.forRoot` quien ejecuta la validación durante el bootstrap de
 * AppModule, con las mismas opciones que app.module.ts.
 */
describe('ConfigModule.forRoot — fail-fast de arranque en perfil producción', () => {
  /**
   * Aplica el entorno sobre `process.env` y lo restaura siempre. No se sustituye
   * el objeto completo: Jest y Node leen otras variables del proceso durante la
   * ejecución. Las claves con `undefined` se eliminan para simular su ausencia.
   */
  async function bootConfigModule(env: Record<string, string | undefined>): Promise<void> {
    const snapshot = { ...process.env };

    try {
      for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }

      // `forRoot` es `static async`: rechaza la promesa, no lanza en la llamada.
      await ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validationSchema: createAppConfigurationSchema(),
        validationOptions: { abortEarly: false },
      });
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in snapshot)) {
          delete process.env[key];
        }
      }
      Object.assign(process.env, snapshot);
    }
  }

  it('aborta el arranque si faltan FRONTEND_URL y CORS_ORIGIN', async () => {
    await expect(
      bootConfigModule({
        ...buildProductionEnv(),
        FRONTEND_URL: undefined,
        CORS_ORIGIN: undefined,
      }),
    ).rejects.toThrow(/FRONTEND_URL es obligatoria con NODE_ENV=production/);
  });

  it('aborta el arranque si FRONTEND_URL apunta a localhost', async () => {
    await expect(
      bootConfigModule({ ...buildProductionEnv(), FRONTEND_URL: 'http://localhost:3001' }),
    ).rejects.toThrow(/FRONTEND_URL no puede apuntar a localhost/);
  });

  it('arranca cuando ambas están presentes y no apuntan a localhost', async () => {
    await expect(bootConfigModule(buildProductionEnv())).resolves.toBeUndefined();
  });

  it('restaura NODE_ENV=test tras cada arranque simulado', () => {
    expect(process.env['NODE_ENV']).toBe('test');
  });
});

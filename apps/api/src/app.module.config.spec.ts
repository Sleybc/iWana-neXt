import { ConfigService } from '@nestjs/config';
import { createApiTypeOrmOptions, createAppConfigurationSchema } from './app.config';

describe('AppModule configuration', () => {
  it.each([
    ['EXECUTION_ORDER_IDEMPOTENCY_SECRET', {}],
    ['EXECUTION_ORDER_IDEMPOTENCY_SECRET', { EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'short' }],
    ['JWT_PRIVATE_KEY', { EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32) }],
    [
      'JWT_PUBLIC_KEY',
      { EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32), JWT_PRIVATE_KEY: 'not-a-real-key' },
    ],
    [
      'MFA_ENCRYPTION_KEY',
      {
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
        JWT_PRIVATE_KEY: 'not-a-real-key',
        JWT_PUBLIC_KEY: 'not-a-real-key',
      },
    ],
  ])('rechaza configuración inválida al arrancar: %s', (variable, environment) => {
    const validation = createAppConfigurationSchema().validate(environment, { abortEarly: false });

    expect(validation.error?.details.map(({ path }) => path.join('.'))).toContain(variable);
  });

  it.each([
    ['S3/MinIO credentials', 'S3_ACCESS_KEY_ID'],
    ['Typesense credentials', 'TYPESENSE_API_KEY'],
  ])('rechaza credenciales de servicios ausentes en producción: %s', (service, variable) => {
    const validation = createAppConfigurationSchema().validate(
      {
        NODE_ENV: 'production',
        DB_NAME: 'dbiw',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'placeholder',
        JWT_PRIVATE_KEY: 'not-a-real-key',
        JWT_PUBLIC_KEY: 'not-a-real-key',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
        MFA_ENCRYPTION_KEY: 'a'.repeat(64),
        ...(service === 'S3/MinIO credentials'
          ? { TYPESENSE_HOST: 'typesense', TYPESENSE_API_KEY: 'typesense-key' }
          : { S3_ACCESS_KEY_ID: 'minio-user', S3_SECRET_ACCESS_KEY: 'minio-secret' }),
      },
      { abortEarly: false },
    );

    expect(validation.error?.details.map(({ path }) => path.join('.'))).toContain(variable);
  });

  it('no asigna umbrales de lag por defecto', () => {
    const keys = createAppConfigurationSchema().describe().keys;

    expect(keys?.OUTBOX_RELAY_LAG_DEGRADED_SECONDS?.flags?.default).toBeUndefined();
    expect(keys?.OUTBOX_RELAY_LAG_STOPPED_SECONDS?.flags?.default).toBeUndefined();
  });

  it('rechaza el almacenamiento local en producción', () => {
    const validation = createAppConfigurationSchema().validate(
      {
        NODE_ENV: 'production',
        DB_NAME: 'dbiw',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'test-placeholder',
        JWT_PRIVATE_KEY: 'not-a-real-key',
        JWT_PUBLIC_KEY: 'not-a-real-key',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
        MFA_ENCRYPTION_KEY: 'a'.repeat(64),
        STORAGE_DRIVER: 'local',
        S3_ACCESS_KEY_ID: 'not-a-secret',
        S3_SECRET_ACCESS_KEY: 'not-a-secret',
        TYPESENSE_HOST: 'typesense',
        TYPESENSE_API_KEY: 'not-a-secret',
      },
      { abortEarly: false },
    );

    expect(validation.error?.details.map(({ path }) => path.join('.'))).toContain('STORAGE_DRIVER');
  });

  it('acepta MinIO como driver de almacenamiento en producción', () => {
    const validation = createAppConfigurationSchema().validate(
      {
        NODE_ENV: 'production',
        DB_NAME: 'dbiw',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'test-placeholder',
        JWT_PRIVATE_KEY: 'not-a-real-key',
        JWT_PUBLIC_KEY: 'not-a-real-key',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
        MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
        STORAGE_DRIVER: 'minio',
        S3_ACCESS_KEY_ID: 'not-a-secret',
        S3_SECRET_ACCESS_KEY: 'not-a-secret',
        TYPESENSE_HOST: 'typesense',
        TYPESENSE_API_KEY: 'not-a-secret',
        // Obligatorias en producción desde la Puerta 1 del plan PLAT-OPS-G7
        // (riesgos 1 y 2 de ADR-070). Cobertura propia en
        // app.config.production-urls.spec.ts.
        CORS_ORIGIN: 'https://app.ejemplo.example',
        FRONTEND_URL: 'https://app.ejemplo.example',
      },
      { abortEarly: false },
    );

    expect(validation.error).toBeUndefined();
    expect(validation.value.STORAGE_DRIVER).toBe('minio');
  });

  it('exige un driver de almacenamiento aprobado en producción', () => {
    const validation = createAppConfigurationSchema().validate(
      {
        NODE_ENV: 'production',
        DB_NAME: 'dbiw',
        DB_USER: 'iwana_app',
        DB_PASSWORD: 'test-placeholder',
        JWT_PRIVATE_KEY: 'not-a-real-key',
        JWT_PUBLIC_KEY: 'not-a-real-key',
        EXECUTION_ORDER_IDEMPOTENCY_SECRET: 'x'.repeat(32),
        MFA_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
        S3_ACCESS_KEY_ID: 'not-a-secret',
        S3_SECRET_ACCESS_KEY: 'not-a-secret',
        TYPESENSE_HOST: 'typesense',
        TYPESENSE_API_KEY: 'not-a-secret',
      },
      { abortEarly: false },
    );

    expect(validation.error?.details.map(({ path }) => path.join('.'))).toContain('STORAGE_DRIVER');
  });

  it('mantiene desactivado el DDL automático del runtime en producción', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });

    const options = createApiTypeOrmOptions(config, {
      entities: [],
      migrations: [],
      migrationsTableName: 'typeorm_migrations',
    });

    expect(options.migrationsRun).toBe(false);
    expect(options.synchronize).toBe(false);
  });
});

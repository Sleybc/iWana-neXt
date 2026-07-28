import { createAppConfigurationSchema } from './app.config';

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
});

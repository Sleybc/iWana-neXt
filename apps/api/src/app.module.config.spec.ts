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
});

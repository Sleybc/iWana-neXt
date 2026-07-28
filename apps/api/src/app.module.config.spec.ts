import * as Joi from 'joi';

const executionOrderIdempotencyConfigurationSchema = Joi.object({
  EXECUTION_ORDER_IDEMPOTENCY_SECRET: Joi.string().min(32).required(),
});

describe('AppModule configuration', () => {
  it('falla al arrancar la configuración si falta el secreto de idempotencia', () => {
    const previousSecret = process.env['EXECUTION_ORDER_IDEMPOTENCY_SECRET'];
    delete process.env['EXECUTION_ORDER_IDEMPOTENCY_SECRET'];

    try {
      const validation = executionOrderIdempotencyConfigurationSchema.validate({});

      expect(validation.error?.message).toMatch(/EXECUTION_ORDER_IDEMPOTENCY_SECRET/u);
    } finally {
      if (previousSecret === undefined) {
        delete process.env['EXECUTION_ORDER_IDEMPOTENCY_SECRET'];
      } else {
        process.env['EXECUTION_ORDER_IDEMPOTENCY_SECRET'] = previousSecret;
      }
    }
  });
});

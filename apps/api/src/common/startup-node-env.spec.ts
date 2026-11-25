import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('isExplicitDevelopment', () => {
  const original = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = original;
  });

  /** Arranca como la API: captura, ConfigModule con el esquema real y consulta. */
  async function boot(nodeEnv: string | undefined): Promise<{ allowed: boolean; env: unknown }> {
    if (nodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = nodeEnv;
    let allowed = true;
    await jest.isolateModulesAsync(async () => {
      const guard = await import('./startup-node-env');
      const { ConfigModule } = await import('@nestjs/config');
      const { createAppConfigurationSchema } = await import('../app.config');
      await ConfigModule.forRoot({
        ignoreEnvFile: true,
        validationSchema: createAppConfigurationSchema().fork(
          Object.keys(createAppConfigurationSchema().describe()['keys'] as object).filter(
            (key) => !/^(NODE_ENV|JWT_\w+_EXPIRATION|SESSION_MAX_\w+)$/u.test(key),
          ),
          () => require('joi').any(),
        ),
      });
      allowed = guard.isExplicitDevelopment();
    });
    return { allowed, env: process.env['NODE_ENV'] };
  }

  it('sin NODE_ENV queda cerrado aunque la configuración lo rellene', async () => {
    expect(await boot(undefined)).toEqual({ allowed: false, env: 'development' });
  });

  it.each([
    ['development', true],
    ['staging', false],
    ['production', false],
  ])('con %s → %s', async (nodeEnv, allowed) => {
    expect((await boot(nodeEnv)).allowed).toBe(allowed);
  });

  it.each(['main.ts', 'app.module.ts'])('%s lo importa antes que nada', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8');
    expect(source.startsWith("import './common/startup-node-env';")).toBe(true);
  });
});

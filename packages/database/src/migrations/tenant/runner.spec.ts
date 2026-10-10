import { DataSource, QueryFailedError } from 'typeorm';

import { SafeTypeOrmLogger } from '../../safe-typeorm.logger';
import { createTenantDataSource } from './runner';

describe('createTenantDataSource (R-LOG2)', () => {
  const sentinel = 'RLOG2_SYNTHETIC_PRIVATE_20261010_C4A1';

  function buildBaseDataSource(): DataSource {
    // Sin initialize: solo se lee `.options`; no abre conexiones ni toca Postgres.
    return new DataSource({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'rlog2_base_user',
      password: 'rlog2_base_password',
      database: 'rlog2_base_db',
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('conecta el DataSource de migraciones de tenant a SafeTypeOrmLogger', () => {
    const tenantDs = createTenantDataSource(buildBaseDataSource(), 'tenant_rlog2_unit');
    const opts = tenantDs.options as unknown as {
      logger?: unknown;
      logging?: unknown;
      synchronize?: unknown;
      schema?: unknown;
      extra?: { options?: unknown };
    };

    expect(opts.logger).toBeInstanceOf(SafeTypeOrmLogger);
    expect(opts.logging).toEqual(['error']);
    expect(opts.synchronize).toBe(false);
    expect(opts.schema).toBe('tenant_rlog2_unit');
    expect(opts.extra?.options).toContain('tenant_rlog2_unit');
  });

  it('una migracion que falla no vuelca parametros, mensaje crudo ni detalle y conserva SQLSTATE', () => {
    const tenantDs = createTenantDataSource(
      buildBaseDataSource(),
      'tenant_rlog2_unit',
      'rlog2-no-leak-conn',
    );
    const wired = tenantDs.options.logger as unknown as SafeTypeOrmLogger;
    expect(wired).toBeInstanceOf(SafeTypeOrmLogger);

    // El logger del runner usa el sink por defecto (consola): se espía sin emitir.
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      const query =
        `ALTER TABLE synthetic_rlog2_table ADD CONSTRAINT synthetic_rlog2_constraint ` +
        `UNIQUE (code) /* ${sentinel} */`;
      const rawMessage = `duplicate key value violates unique constraint ${sentinel}`;
      const driverError = Object.assign(new Error(rawMessage), {
        code: '23505',
        detail: `Key (code)=(${sentinel}) already exists.`,
        table: 'synthetic_rlog2_table',
        constraint: 'synthetic_rlog2_constraint',
      });
      const error = new QueryFailedError(query, [sentinel], driverError);

      // Ruta de consulta fallida + ruta de migración fallida de TypeORM.
      wired.logQueryError(error, query, [sentinel]);
      wired.logMigration(`Migration "SyntheticRlog2" failed, error: ${rawMessage}`);
      wired.logMigration('Migration SyntheticRlog2 completed');

      expect(errorSpy).toHaveBeenCalledWith('TYPEORM_QUERY_ERROR operation=ALTER sqlstate=23505');
      expect(infoSpy).toHaveBeenCalledWith('TYPEORM_MIGRATION status=FAILED');
      expect(infoSpy).toHaveBeenCalledWith('TYPEORM_MIGRATION status=EVENT');

      const dumped = JSON.stringify(errorSpy.mock.calls) + JSON.stringify(infoSpy.mock.calls);
      expect(dumped).not.toContain(sentinel);
      expect(dumped).not.toContain('synthetic_rlog2_table');
      expect(dumped).not.toContain('synthetic_rlog2_constraint');
      expect(dumped).not.toContain('already exists');
      expect(dumped).not.toContain('duplicate key value');
    } finally {
      errorSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });
});

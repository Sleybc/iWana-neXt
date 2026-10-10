import { QueryFailedError } from 'typeorm';
import { SafeTypeOrmLogger, type SafeTypeOrmLogSink } from './safe-typeorm.logger';

describe('SafeTypeOrmLogger', () => {
  const sentinel = 'RLOG_SYNTHETIC_PRIVATE_20261010_7F24';
  let sink: jest.Mocked<SafeTypeOrmLogSink>;
  let logger: SafeTypeOrmLogger;

  beforeEach(() => {
    sink = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
    logger = new SafeTypeOrmLogger(sink);
  });

  it('excluye consulta, parámetros y error crudo de QueryFailedError', () => {
    const query = `UPDATE synthetic_table SET value = '${sentinel}' WHERE id = $1`;
    const driverError = Object.assign(new Error(`invalid syntax ${sentinel}`), {
      code: '22P02',
      detail: sentinel,
      table: sentinel,
      constraint: sentinel,
    });
    const error = new QueryFailedError(query, [sentinel], driverError);

    logger.logQueryError(error, query, [sentinel]);

    expect(sink.error).toHaveBeenCalledWith('TYPEORM_QUERY_ERROR operation=UPDATE sqlstate=22P02');
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain(sentinel);
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('synthetic_table');
    expect(JSON.stringify(sink.error.mock.calls)).not.toContain('invalid syntax');
  });

  it('conserva SQLSTATE del driver como lo entrega PostgresQueryRunner', () => {
    logger.logQueryError(Object.assign(new Error(sentinel), { code: '23505' }), 'INSERT INTO t');
    expect(sink.error).toHaveBeenCalledWith('TYPEORM_QUERY_ERROR operation=INSERT sqlstate=23505');
  });

  it.each([undefined, sentinel, '22P02\nunsafe', 22000])(
    'rechaza un código SQLSTATE que no cumpla la forma: %s',
    (code) => {
      logger.logQueryError(Object.assign(new Error(sentinel), { code }), 'SELECT $1', [sentinel]);
      expect(sink.error).toHaveBeenCalledWith(
        'TYPEORM_QUERY_ERROR operation=SELECT sqlstate=UNKNOWN',
      );
    },
  );

  it('no intenta derivar SQLSTATE del mensaje ni de comentarios SQL', () => {
    logger.logQueryError(`22P02 ${sentinel}`, `/* ${sentinel} */ SELECT '${sentinel}'`);
    expect(sink.error).toHaveBeenCalledWith(
      'TYPEORM_QUERY_ERROR operation=UNKNOWN sqlstate=UNKNOWN',
    );
  });

  it('sanea también query normal, query lenta, schema, migración y eventos genéricos', () => {
    logger.logQuery(`SELECT '${sentinel}'`, [sentinel]);
    logger.logQuerySlow(10, `SELECT '${sentinel}'`, [sentinel]);
    logger.logSchemaBuild(`creating table ${sentinel}`);
    logger.logMigration(`Migration "Synthetic140" failed, error: ${sentinel}`);
    logger.logMigration(`completed ${sentinel}`);
    logger.log('log', sentinel);
    logger.log('info', { password: sentinel });
    logger.log('warn', new Error(sentinel));

    expect(sink.error).not.toHaveBeenCalled();
    expect(sink.warn).toHaveBeenCalledWith('TYPEORM_QUERY_SLOW operation=SELECT');
    expect(sink.info).toHaveBeenCalledWith('TYPEORM_MIGRATION status=FAILED');
    expect(sink.info).toHaveBeenCalledWith('TYPEORM_MIGRATION status=EVENT');
    expect(sink.info).toHaveBeenCalledWith('TYPEORM_SCHEMA_BUILD');
    const output = JSON.stringify([
      sink.error.mock.calls,
      sink.warn.mock.calls,
      sink.info.mock.calls,
    ]);
    expect(output).not.toContain(sentinel);
    expect(output).not.toContain('password');
  });
});

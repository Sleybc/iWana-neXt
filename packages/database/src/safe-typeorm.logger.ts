import type { Logger } from 'typeorm';

export interface SafeTypeOrmLogSink {
  error(message: string): void;
  warn(message: string): void;
  info(message: string): void;
}

const consoleSink: SafeTypeOrmLogSink = {
  error: (message) => console.error(message),
  warn: (message) => console.warn(message),
  info: (message) => console.info(message),
};

/** Solo devuelve etiquetas fijas: nunca una porción arbitraria de la consulta. */
function queryOperation(query: string): string {
  const operation =
    /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|TRUNCATE|BEGIN|COMMIT|ROLLBACK|SET|SHOW|EXPLAIN|GRANT|REVOKE)\b/iu.exec(
      query,
    );
  return operation?.[1]?.toUpperCase() ?? 'UNKNOWN';
}

function sqlState(error: string | Error): string {
  if (typeof error !== 'object' || error === null) {
    return 'UNKNOWN';
  }
  // QueryFailedError conserva el código en driverError; el driver se recibe
  // directamente en PostgresQueryRunner.logQueryError antes de crear ese wrapper.
  const source =
    'driverError' in error && typeof error.driverError === 'object' && error.driverError !== null
      ? error.driverError
      : error;
  const code = 'code' in source ? source.code : undefined;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/u.test(code) ? code : 'UNKNOWN';
}

/**
 * Diagnóstico TypeORM compartido conforme a D11. No delega al logger por
 * defecto: incluso las rutas de migración pueden recibir el mensaje crudo.
 */
export class SafeTypeOrmLogger implements Logger {
  constructor(private readonly sink: SafeTypeOrmLogSink = consoleSink) {}

  logQuery(_query: string, _parameters?: unknown[]): void {}

  logQueryError(error: string | Error, query: string, _parameters?: unknown[]): void {
    this.sink.error(
      `TYPEORM_QUERY_ERROR operation=${queryOperation(query)} sqlstate=${sqlState(error)}`,
    );
  }

  logQuerySlow(_time: number, query: string, _parameters?: unknown[]): void {
    this.sink.warn(`TYPEORM_QUERY_SLOW operation=${queryOperation(query)}`);
  }

  logSchemaBuild(_message: string): void {
    this.sink.info('TYPEORM_SCHEMA_BUILD');
  }

  logMigration(message: string): void {
    const failed = /^Migrations?\b.*\bfailed, error:/u.test(message);
    this.sink.info(`TYPEORM_MIGRATION status=${failed ? 'FAILED' : 'EVENT'}`);
  }

  log(level: 'log' | 'info' | 'warn', _message: unknown): void {
    if (level === 'warn') {
      this.sink.warn('TYPEORM_EVENT level=WARN');
      return;
    }
    this.sink.info('TYPEORM_EVENT level=INFO');
  }
}

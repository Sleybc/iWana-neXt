import { QueryFailedError } from 'typeorm';

type PostgresDriverError = {
  code?: string;
  constraint?: string;
};

export function isPostgresUniqueViolation(error: unknown, constraint?: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const driverError = error.driverError as PostgresDriverError | undefined;
  if (driverError?.code !== '23505') {
    return false;
  }

  if (constraint && driverError.constraint !== constraint) {
    return false;
  }

  return true;
}

export interface QueryableManager {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

/**
 * Serializa una sección crítica por clave lógica dentro de la transacción actual.
 * El lock es `xact`: PostgreSQL lo libera al hacer COMMIT o ROLLBACK.
 */
export async function acquireTransactionAdvisoryLock(
  manager: QueryableManager,
  lockKey: string,
): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [lockKey]);
}

export async function acquireIdempotencyTransactionLock(
  manager: QueryableManager,
  idempotencyKey: string,
): Promise<void> {
  await acquireTransactionAdvisoryLock(manager, idempotencyKey);
}

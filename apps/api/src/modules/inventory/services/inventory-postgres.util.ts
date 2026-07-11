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

export async function acquireIdempotencyTransactionLock(
  manager: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  idempotencyKey: string,
): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [idempotencyKey]);
}

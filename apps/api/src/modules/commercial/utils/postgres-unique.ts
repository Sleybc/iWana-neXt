import { QueryFailedError } from 'typeorm';

type PostgresDriverError = {
  code?: string;
};

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError = error.driverError as PostgresDriverError | undefined;
  return driverError?.code === '23505';
}

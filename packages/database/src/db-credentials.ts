/**
 * Credenciales PostgreSQL para migraciones / DDL (SEC-04).
 *
 * Preferencia: `DB_MIGRATOR_USER` + `DB_MIGRATOR_PASSWORD` cuando el usuario
 * migrator está definido. Si no, fallback a `DB_USER` / `DB_PASSWORD` para
 * compatibilidad con `pnpm dev` (bootstrap histórico).
 *
 * El runtime de API/worker TypeORM debe seguir usando `DB_USER` (rol app);
 * no reutilizar este helper en TypeOrmModule.forRootAsync.
 *
 * @see docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md
 */
export interface DbCredentials {
  username: string;
  password: string;
}

/**
 * Resuelve usuario/password para data-source CLI, migraciones public/tenant
 * y provisioning de schemas (worker).
 */
export function resolveMigrationDbCredentials(env: NodeJS.ProcessEnv = process.env): DbCredentials {
  const migratorUser = env['DB_MIGRATOR_USER']?.trim();

  if (migratorUser) {
    return {
      username: migratorUser,
      password: env['DB_MIGRATOR_PASSWORD'] ?? env['DB_PASSWORD'] ?? '',
    };
  }

  return {
    username: env['DB_USER'] ?? 'iwana',
    password: env['DB_PASSWORD'] ?? '',
  };
}

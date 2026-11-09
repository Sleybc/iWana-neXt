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

/** Error de configuración: el worker de producción no arranca sin rol de purga. */
export class MissingPurgeCredentialsError extends Error {
  constructor() {
    super(
      'R7 / ADR-108: falta DB_PURGER_USER. En producción la purga de tenants solo ' +
        'conecta con el rol iwana_purger; no hay respaldo a DB_USER.',
    );
    this.name = 'MissingPurgeCredentialsError';
  }
}

/**
 * Credenciales de la purga de tenants (R7, ADR-108): `DB_PURGER_USER` +
 * `DB_PURGER_PASSWORD`. El rol solo puede ejecutar las dos funciones
 * `SECURITY DEFINER` de la migración pública 029.
 *
 * Sin `DB_PURGER_USER`:
 * - en `NODE_ENV=production` lanza {@link MissingPurgeCredentialsError};
 * - en cualquier otro entorno devuelve `DB_USER` / `DB_PASSWORD` con
 *   `fallback: true`, para no romper `pnpm dev`. Con ese rol la purga fallará
 *   (sin `EXECUTE`), y el llamante debe avisarlo.
 */
export function resolvePurgeDbCredentials(
  env: NodeJS.ProcessEnv = process.env,
): DbCredentials & { fallback: boolean } {
  const purgerUser = env['DB_PURGER_USER']?.trim();

  if (purgerUser) {
    return {
      username: purgerUser,
      password: env['DB_PURGER_PASSWORD'] ?? '',
      fallback: false,
    };
  }

  if (env['NODE_ENV'] === 'production') {
    throw new MissingPurgeCredentialsError();
  }

  return {
    username: env['DB_USER'] ?? 'iwana',
    password: env['DB_PASSWORD'] ?? '',
    fallback: true,
  };
}

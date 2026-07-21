import { resolveMigrationDbCredentials } from './db-credentials';

/**
 * Cliente mínimo compatible con `pg.Pool` / `pg.Client` / QueryRunner.query.
 */
export interface SqlQueryable {
  query(queryText: string, values?: unknown[]): Promise<unknown>;
}

const PG_ROLE_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
/** Misma regla que `isValidSchemaName` en data-source (sin importar entidades TypeORM). */
const TENANT_SCHEMA_RE = /^tenant_[a-z][a-z0-9_]{0,54}$/;

/**
 * Rol runtime de la app (SEC-04): `DB_APP_USER` o, en su defecto, `DB_USER`.
 */
export function resolveAppDbRole(env: NodeJS.ProcessEnv = process.env): string {
  const role = (env['DB_APP_USER'] ?? env['DB_USER'] ?? 'iwana_app').trim();
  assertPgRoleName(role);
  return role;
}

export function assertPgRoleName(role: string): void {
  if (!PG_ROLE_RE.test(role)) {
    throw new Error(`Nombre de rol PostgreSQL inválido: "${role}"`);
  }
}

function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * SQL idempotente alineado al bloque DML + harden de audit en
 * `scripts/db/apply-least-privilege.sql`, acotado a un único schema tenant.
 *
 * - App: USAGE (sin CREATE); DML en tablas; USAGE/SELECT en secuencias.
 * - Migrator: USAGE, CREATE en schema; DEFAULT PRIVILEGES → app.
 * - `audit_logs`: app solo SELECT, INSERT.
 */
export function buildTenantSchemaAppGrantsSql(
  schemaName: string,
  appRole: string,
  migratorRole: string,
): string {
  if (!TENANT_SCHEMA_RE.test(schemaName)) {
    throw new Error(`Schema name inválido para grants: "${schemaName}"`);
  }
  assertPgRoleName(appRole);
  assertPgRoleName(migratorRole);

  return `
DO $grant$
DECLARE
  sch text := ${sqlStringLiteral(schemaName)};
  app text := ${sqlStringLiteral(appRole)};
  migrator text := ${sqlStringLiteral(migratorRole)};
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
    RAISE EXCEPTION 'rol app % ausente', app;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator) THEN
    RAISE EXCEPTION 'rol migrator % ausente', migrator;
  END IF;

  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', sch, app);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', sch, migrator);

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
    sch,
    app
  );
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I',
    sch,
    app
  );

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    migrator,
    sch,
    app
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I',
    migrator,
    sch,
    app
  );

  IF to_regclass(format('%I.%I', sch, 'audit_logs')) IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON TABLE %I.audit_logs FROM %I', sch, app);
    EXECUTE format(
      'GRANT SELECT, INSERT ON TABLE %I.audit_logs TO %I',
      sch,
      app
    );
  END IF;
END
$grant$;
`.trim();
}

export interface GrantTenantSchemaAppPrivilegesOptions {
  /** Rol app; por defecto {@link resolveAppDbRole}. */
  appRole?: string;
  /** Rol migrator; por defecto username de {@link resolveMigrationDbCredentials}. */
  migratorRole?: string;
}

/**
 * Otorga privilegios de runtime al rol app sobre un schema tenant ya migrado.
 * Debe ejecutarse como migrator (owner del schema) antes del seed.
 */
export async function grantTenantSchemaAppPrivileges(
  queryable: SqlQueryable,
  schemaName: string,
  options: GrantTenantSchemaAppPrivilegesOptions = {},
): Promise<void> {
  const appRole = options.appRole ?? resolveAppDbRole();
  const migratorRole = options.migratorRole ?? resolveMigrationDbCredentials().username;
  const sql = buildTenantSchemaAppGrantsSql(schemaName, appRole, migratorRole);
  await queryable.query(sql);
}

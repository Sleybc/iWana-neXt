#!/bin/bash
# SEC-04 — Crea roles iwana_app / iwana_migrator en el primer init del volumen.
# Solo corre cuando el datadir de Postgres está vacío (entrypoint oficial).
# Passwords: DB_APP_PASSWORD / DB_MIGRATOR_PASSWORD, o fallback POSTGRES_PASSWORD.
#
# GSEC-N1 — El bootstrap superuser (POSTGRES_USER, de DB_BOOTSTRAP_USER) debe ser
# DISTINTO de los roles de aplicación. Si coinciden, el entrypoint de Postgres ya
# creó ese rol como SUPERUSER antes de llegar aquí y toda la remediación SEC-04
# queda anulada en silencio. Este script falla en duro en ese caso, y además
# verifica rolsuper al final: la ausencia de error no puede depender de que el rol
# "ya existiera".
set -euo pipefail

APP_USER="${DB_APP_USER:-iwana_app}"
MIGRATOR_USER="${DB_MIGRATOR_USER:-iwana_migrator}"
APP_PASS="${DB_APP_PASSWORD:-${POSTGRES_PASSWORD}}"
MIGRATOR_PASS="${DB_MIGRATOR_PASSWORD:-${POSTGRES_PASSWORD}}"
# R7 / ADR-108: rol de purga de tenants (solo EXECUTE sobre dos funciones definer).
PURGER_USER="iwana_purger"
PURGER_PASS="${DB_PURGER_PASSWORD:-${POSTGRES_PASSWORD}}"
DB_NAME="${POSTGRES_DB}"
BOOTSTRAP_USER="${POSTGRES_USER}"

if [[ -z "${APP_PASS}" || -z "${MIGRATOR_PASS}" || -z "${PURGER_PASS}" || -z "${DB_NAME}" ]]; then
  echo "01-create-roles: faltan password o POSTGRES_DB" >&2
  exit 1
fi

if [[ "${BOOTSTRAP_USER}" == "${APP_USER}" || "${BOOTSTRAP_USER}" == "${MIGRATOR_USER}" ]]; then
  cat >&2 <<ERR
01-create-roles: FALLO DURO (GSEC-N1) — acople bootstrap/aplicacion.

  POSTGRES_USER    = ${BOOTSTRAP_USER}
  DB_APP_USER      = ${APP_USER}
  DB_MIGRATOR_USER = ${MIGRATOR_USER}

POSTGRES_USER es el superusuario de bootstrap que crea el entrypoint de Postgres
en un datadir vacio. Si coincide con el rol de aplicacion o el de migraciones,
ese rol queda SUPERUSER y anula SEC-04 (grants, ownership del trigger de
inmutabilidad del audit) sin emitir ningun error.

Corrige: en docker-compose.yml el bootstrap sale de DB_BOOTSTRAP_USER (default
'iwana'), NO de DB_USER. Define DB_BOOTSTRAP_USER con un valor distinto de
DB_APP_USER / DB_MIGRATOR_USER y vuelve a levantar sobre un datadir limpio.
Ver docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md.
ERR
  exit 1
fi

echo "01-create-roles: creando ${APP_USER}, ${MIGRATOR_USER} y ${PURGER_USER} (si no existen)"

# Variables psql (:'x') se interpolan fuera de dollar-quotes; usamos \gexec.
psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${DB_NAME}" \
  -v app_user="${APP_USER}" \
  -v migrator_user="${MIGRATOR_USER}" \
  -v app_pass="${APP_PASS}" \
  -v migrator_pass="${MIGRATOR_PASS}" \
  -v purger_user="${PURGER_USER}" \
  -v purger_pass="${PURGER_PASS}" \
  -v db_name="${DB_NAME}" <<'SQL'
SELECT :'app_user'::name IN (:'migrator_user'::name, :'purger_user'::name, 'iwana_migrator')
    OR :'migrator_user'::name IN (:'purger_user'::name, 'iwana_app')
    OR current_user IN ('iwana_app', 'iwana_migrator', :'app_user'::name, :'migrator_user'::name,
                        :'purger_user'::name)
    AS r7_roles_overlap
\gset
\if :r7_roles_overlap
DO $$ BEGIN
  RAISE EXCEPTION 'GSEC-N1 (R7): bootstrap, aplicación, migración y purga requieren roles distintos';
END $$;
\endif

BEGIN;

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT',
  :'app_user',
  :'app_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT',
  :'migrator_user',
  :'migrator_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_user')
\gexec

SELECT format(
  'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT',
  :'purger_user',
  :'purger_pass'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'purger_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'purger_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'purger_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'app_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'migrator_user')
\gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', :'db_name', :'migrator_user')
\gexec

-- H-1: el rol de la API no crea objetos (ni en la base, ni en public, ni TEMP).
SELECT format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', :'db_name')
\gexec
SELECT format('GRANT TEMPORARY ON DATABASE %I TO %I', :'db_name', :'migrator_user')
\gexec
SELECT format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I', :'db_name', :'app_user')
\gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user')
\gexec
SELECT format('REVOKE CREATE ON SCHEMA public FROM %I', :'app_user')
\gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migrator_user')
\gexec

-- Default privileges: tablas/secuencias futuras del bootstrap (p. ej. typeorm_migrations)
-- quedan con DML para migrator sin re-aplicar ALL TABLES.
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_user,
  :'migrator_user'
)
WHERE current_user IS DISTINCT FROM :'migrator_user'
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
  current_user,
  :'migrator_user'
)
WHERE current_user IS DISTINCT FROM :'migrator_user'
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
  current_user,
  :'app_user'
)
WHERE current_user IS DISTINCT FROM :'app_user'
\gexec
SELECT format(
  'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
  current_user,
  :'app_user'
)
WHERE current_user IS DISTINCT FROM :'app_user'
\gexec

-- GSEC-N1: verificar los roles preexistentes antes de confirmar los grants.
WITH roles AS (
  SELECT oid, rolname FROM pg_catalog.pg_roles
  WHERE rolname IN (
    'iwana_app', 'iwana_migrator', 'iwana_purger', :'app_user', :'migrator_user', :'purger_user'
  )
)
SELECT coalesce(string_agg(x, ', ' ORDER BY x), '') AS r7_elevated,
       count(*) > 0 AS r7_guard_failed
FROM (
  SELECT rolname AS x
  FROM pg_roles
  WHERE rolname IN (:'app_user', :'migrator_user', :'purger_user')
    AND (rolsuper OR rolcreaterole OR rolbypassrls)
  UNION ALL
  -- R7: el reloj de retencion usa membresia transitiva hacia iwana_migrator.
  SELECT m.rolname || ' miembro de ' || r.rolname || CASE
           WHEN m.rolname IN ('iwana_purger', :'purger_user')
             AND r.rolname IN ('iwana_migrator', :'migrator_user')
             AND pg_catalog.pg_has_role(m.oid, r.oid, 'USAGE') THEN ' (USAGE)'
           ELSE '' END
  FROM roles m CROSS JOIN roles r
  WHERE m.oid <> r.oid AND pg_catalog.pg_has_role(m.oid, r.oid, 'MEMBER')
  UNION ALL
  -- ADR-108: el purger tampoco puede asumir roles ajenos a la aplicación.
  SELECT DISTINCT m.rolname || ' miembro de ' || r.rolname
  FROM pg_catalog.pg_auth_members a
  JOIN roles m ON m.oid = a.member
  JOIN pg_catalog.pg_roles r ON r.oid = a.roleid
  WHERE m.rolname IN ('iwana_purger', :'purger_user')
    AND a.roleid NOT IN (SELECT oid FROM roles)
) hallazgos
\gset
\if :r7_guard_failed
\warn 'GSEC-N1 (R7): privilegio elevado o membresía entre roles:' :r7_elevated
DO $$ BEGIN
  RAISE EXCEPTION 'GSEC-N1 (R7): bootstrap abortado';
END $$;
\endif

COMMIT;
SQL

echo "01-create-roles: OK"

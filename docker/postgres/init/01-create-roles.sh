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
SQL

# GSEC-N1 — Verificacion de privilegio real, no de existencia.
# Las creaciones de arriba se saltan el rol si ya existe, y un rol preexistente NO
# es prueba de que sea correcto: ese supuesto es justo lo que hacia silencioso el
# acople. Aqui se consulta rolsuper/rolcreaterole/rolbypassrls y se aborta el init.
ELEVATED="$(
  psql -tAX \
    --username "${POSTGRES_USER}" \
    --dbname "${DB_NAME}" \
    -v app_user="${APP_USER}" \
    -v migrator_user="${MIGRATOR_USER}" \
    -v purger_user="${PURGER_USER}" <<'CHECK'
SELECT coalesce(string_agg(x, ', ' ORDER BY x), '')
FROM (
  SELECT rolname AS x
  FROM pg_roles
  WHERE rolname IN (:'app_user', :'migrator_user', :'purger_user')
    AND (rolsuper OR rolcreaterole OR rolbypassrls)
  UNION ALL
  -- R7: el reloj de retencion de public.tenants depende de que no haya
  -- membresias entre los roles de aplicacion.
  SELECT m.rolname || ' miembro de ' || r.rolname
  FROM pg_auth_members a
  JOIN pg_roles r ON r.oid = a.roleid
  JOIN pg_roles m ON m.oid = a.member
  WHERE r.rolname IN (:'app_user', :'migrator_user', :'purger_user')
    AND m.rolname IN (:'app_user', :'migrator_user', :'purger_user')
) hallazgos;
CHECK
)"

if [[ -n "${ELEVATED}" ]]; then
  cat >&2 <<ERR
01-create-roles: FALLO DURO (GSEC-N1) — rol de aplicacion con privilegio elevado.

  Rol(es) afectado(s): ${ELEVATED}
  (SUPERUSER / CREATEROLE / BYPASSRLS)

Con este privilegio el rol puede reasignar ownership y eliminar el trigger de
inmutabilidad del audit: SEC-04 queda anulado. Causa habitual: POSTGRES_USER
coincide con el rol de aplicacion y el entrypoint de Postgres lo creo como
superusuario de bootstrap antes de correr este script.

Revisa DB_BOOTSTRAP_USER en docker-compose.yml (debe diferir de DB_APP_USER y
DB_MIGRATOR_USER) y levanta sobre un datadir limpio.
Ver docs/runbooks/RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md.
ERR
  exit 1
fi

echo "01-create-roles: OK"

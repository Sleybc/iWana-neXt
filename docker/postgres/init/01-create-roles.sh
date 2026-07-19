#!/bin/bash
# SEC-04 — Crea roles iwana_app / iwana_migrator en el primer init del volumen.
# Solo corre cuando el datadir de Postgres está vacío (entrypoint oficial).
# Passwords: DB_APP_PASSWORD / DB_MIGRATOR_PASSWORD, o fallback POSTGRES_PASSWORD.
set -euo pipefail

APP_USER="${DB_APP_USER:-iwana_app}"
MIGRATOR_USER="${DB_MIGRATOR_USER:-iwana_migrator}"
APP_PASS="${DB_APP_PASSWORD:-${POSTGRES_PASSWORD}}"
MIGRATOR_PASS="${DB_MIGRATOR_PASSWORD:-${POSTGRES_PASSWORD}}"
DB_NAME="${POSTGRES_DB}"

if [[ -z "${APP_PASS}" || -z "${MIGRATOR_PASS}" || -z "${DB_NAME}" ]]; then
  echo "01-create-roles: faltan password o POSTGRES_DB" >&2
  exit 1
fi

echo "01-create-roles: creando ${APP_USER} y ${MIGRATOR_USER} (si no existen)"

# Variables psql (:'x') se interpolan fuera de dollar-quotes; usamos \gexec.
psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${DB_NAME}" \
  -v app_user="${APP_USER}" \
  -v migrator_user="${MIGRATOR_USER}" \
  -v app_pass="${APP_PASS}" \
  -v migrator_pass="${MIGRATOR_PASS}" \
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

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'app_user')
\gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'db_name', :'migrator_user')
\gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', :'db_name', :'app_user')
\gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', :'db_name', :'migrator_user')
\gexec

SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'app_user')
\gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migrator_user')
\gexec
SQL

echo "01-create-roles: OK"

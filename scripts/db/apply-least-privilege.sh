#!/usr/bin/env bash
# Aplica SEC-04 sobre un Postgres ya inicializado (wrapper portable).
#
# Modos:
#   Host (CI): LEAST_PRIVILEGE_MODE=host + DB_HOST. No requiere Docker.
#   Docker (lab, default): docker exec en POSTGRES_CONTAINER.
#   No usar solo DB_HOST para elegir modo: en lab suele estar en .env y
#   apuntaría al puerto publicado con la password de app, no bootstrap.
#
# Uso lab (Docker):
#   export DB_BOOTSTRAP_PASSWORD='...'   # o DB_PASSWORD (compat)
#   export DB_APP_PASSWORD='...'
#   export DB_MIGRATOR_PASSWORD='...'
#   bash scripts/db/apply-least-privilege.sh
#
# Uso CI (host psql):
#   LEAST_PRIVILEGE_MODE=host DB_HOST=localhost DB_PORT=5432 DB_NAME=test \
#   DB_BOOTSTRAP_USER=iwana DB_BOOTSTRAP_PASSWORD=... \
#   DB_APP_PASSWORD=... DB_MIGRATOR_PASSWORD=... \
#   bash scripts/db/apply-least-privilege.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
# GSEC-N1: el bootstrap superuser sale de DB_BOOTSTRAP_USER, nunca de DB_USER
DB_USER_BOOTSTRAP="${DB_BOOTSTRAP_USER:-iwana}"
DB_NAME_BOOTSTRAP="${DB_NAME:-${POSTGRES_DB:-dbiw}}"
DB_HOST_RESOLVED="${DB_HOST:-${PGHOST:-localhost}}"
DB_PORT_RESOLVED="${DB_PORT:-${PGPORT:-5432}}"
BOOTSTRAP_PASS="${DB_BOOTSTRAP_PASSWORD:-${DB_PASSWORD:-}}"
APP_PASS="${DB_APP_PASSWORD:-${DB_PASSWORD:-changeme-dev-only-app}}"
MIGRATOR_PASS="${DB_MIGRATOR_PASSWORD:-${DB_PASSWORD:-changeme-dev-only-migrator}}"
APP_USER="${DB_APP_USER:-iwana_app}"
MIGRATOR_USER="${DB_MIGRATOR_USER:-iwana_migrator}"
MODE="${LEAST_PRIVILEGE_MODE:-docker}"

if [[ "${DB_USER_BOOTSTRAP}" == "${APP_USER}" || "${DB_USER_BOOTSTRAP}" == "${MIGRATOR_USER}" ]]; then
  cat >&2 <<ERR
apply-least-privilege: FALLO DURO (GSEC-N1) — bootstrap igual a app/migrator.

  DB_BOOTSTRAP_USER  = ${DB_USER_BOOTSTRAP}
  DB_APP_USER        = ${APP_USER}
  DB_MIGRATOR_USER   = ${MIGRATOR_USER}

Corrige las variables y reintenta. Ver RUNBOOK-DB-LEAST-PRIVILEGE-v1.0.md.
ERR
  exit 1
fi

run_psql_host() {
  if [[ -z "${BOOTSTRAP_PASS}" ]]; then
    echo "apply-least-privilege: falta DB_BOOTSTRAP_PASSWORD (o DB_PASSWORD) en modo host." >&2
    exit 1
  fi
  PGPASSWORD="${BOOTSTRAP_PASS}" psql -v ON_ERROR_STOP=1 \
    -h "${DB_HOST_RESOLVED}" \
    -p "${DB_PORT_RESOLVED}" \
    -U "${DB_USER_BOOTSTRAP}" \
    -d "${DB_NAME_BOOTSTRAP}" \
    -v app_pass="${APP_PASS}" \
    -v migrator_pass="${MIGRATOR_PASS}" \
    -f "${ROOT}/scripts/db/apply-least-privilege.sql"
}

run_psql_docker() {
  if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
    echo "Contenedor ${CONTAINER} no está en ejecución." >&2
    exit 1
  fi
  docker exec -i \
    -e PGPASSWORD="${BOOTSTRAP_PASS}" \
    "${CONTAINER}" \
    psql -v ON_ERROR_STOP=1 \
      -U "${DB_USER_BOOTSTRAP}" \
      -d "${DB_NAME_BOOTSTRAP}" \
      -v app_pass="${APP_PASS}" \
      -v migrator_pass="${MIGRATOR_PASS}" \
    < "${ROOT}/scripts/db/apply-least-privilege.sql"
}

if [[ "${MODE}" == "host" ]]; then
  echo "apply-least-privilege: modo host (${DB_HOST_RESOLVED}:${DB_PORT_RESOLVED})"
  run_psql_host
else
  echo "apply-least-privilege: modo docker (${CONTAINER})"
  run_psql_docker
fi

echo "Listo. Verifica con: bash scripts/db/verify-app-cannot-drop-audit-trigger.sh"

#!/usr/bin/env bash
# Verificación SEC-04 — la app no puede DROP TRIGGER de audit.
# Exit 0 = PASS; exit ≠ 0 = FAIL (gate CI / lab).
#
# Modos: igual que apply-least-privilege.sh
#   LEAST_PRIVILEGE_MODE=host → psql al host; default → docker exec.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
# GSEC-N1: el bootstrap superuser sale de DB_BOOTSTRAP_USER, nunca de DB_USER
DB_USER_BOOTSTRAP="${DB_BOOTSTRAP_USER:-iwana}"
DB_NAME_BOOTSTRAP="${DB_NAME:-${POSTGRES_DB:-dbiw}}"
DB_HOST_RESOLVED="${DB_HOST:-${PGHOST:-localhost}}"
DB_PORT_RESOLVED="${DB_PORT:-${PGPORT:-5432}}"
BOOTSTRAP_PASS="${DB_BOOTSTRAP_PASSWORD:-${DB_PASSWORD:-}}"
APP_USER="${DB_APP_USER:-iwana_app}"
MIGRATOR_USER="${DB_MIGRATOR_USER:-iwana_migrator}"
MODE="${LEAST_PRIVILEGE_MODE:-docker}"

if [[ "${DB_USER_BOOTSTRAP}" == "${APP_USER}" || "${DB_USER_BOOTSTRAP}" == "${MIGRATOR_USER}" ]]; then
  cat >&2 <<ERR
verify-app-cannot-drop-audit-trigger: FALLO DURO (GSEC-N1) — bootstrap igual a app/migrator.
ERR
  exit 1
fi

run_psql_host() {
  if [[ -z "${BOOTSTRAP_PASS}" ]]; then
    echo "verify: falta DB_BOOTSTRAP_PASSWORD (o DB_PASSWORD) en modo host." >&2
    exit 1
  fi
  PGPASSWORD="${BOOTSTRAP_PASS}" psql -v ON_ERROR_STOP=1 \
    -h "${DB_HOST_RESOLVED}" \
    -p "${DB_PORT_RESOLVED}" \
    -U "${DB_USER_BOOTSTRAP}" \
    -d "${DB_NAME_BOOTSTRAP}" \
    -f "${ROOT}/scripts/db/verify-app-cannot-drop-audit-trigger.sql"
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
    < "${ROOT}/scripts/db/verify-app-cannot-drop-audit-trigger.sql"
}

if [[ "${MODE}" == "host" ]]; then
  echo "verify-app-cannot-drop-audit-trigger: modo host (${DB_HOST_RESOLVED}:${DB_PORT_RESOLVED})"
  run_psql_host
else
  echo "verify-app-cannot-drop-audit-trigger: modo docker (${CONTAINER})"
  run_psql_docker
fi

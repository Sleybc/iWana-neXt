#!/usr/bin/env bash
# Aplica SEC-04 sobre un Postgres ya inicializado (wrapper portable).
# Uso (desde la raíz del repo, con contenedor sano):
#   export DB_PASSWORD='...'           # password bootstrap
#   export DB_APP_PASSWORD="${DB_PASSWORD}"
#   export DB_MIGRATOR_PASSWORD="${DB_PASSWORD}"
#   bash scripts/db/apply-least-privilege.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
DB_USER_BOOTSTRAP="${DB_USER:-iwana}"
DB_NAME_BOOTSTRAP="${DB_NAME:-dbiw}"
APP_PASS="${DB_APP_PASSWORD:-${DB_PASSWORD:-changeme-dev-only-app}}"
MIGRATOR_PASS="${DB_MIGRATOR_PASSWORD:-${DB_PASSWORD:-changeme-dev-only-migrator}}"

if ! docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "Contenedor ${CONTAINER} no está en ejecución." >&2
  exit 1
fi

docker exec -i \
  -e PGPASSWORD="${DB_PASSWORD:-}" \
  "${CONTAINER}" \
  psql -v ON_ERROR_STOP=1 \
    -U "${DB_USER_BOOTSTRAP}" \
    -d "${DB_NAME_BOOTSTRAP}" \
    -v app_pass="${APP_PASS}" \
    -v migrator_pass="${MIGRATOR_PASS}" \
  < "${ROOT}/scripts/db/apply-least-privilege.sql"

echo "Listo. Verifica con: bash scripts/db/verify-app-cannot-drop-audit-trigger.sh"

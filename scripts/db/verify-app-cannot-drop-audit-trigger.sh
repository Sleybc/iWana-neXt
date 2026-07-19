#!/usr/bin/env bash
# Verificación SEC-04 — la app no puede DROP TRIGGER de audit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
DB_USER_BOOTSTRAP="${DB_USER:-iwana}"
DB_NAME_BOOTSTRAP="${DB_NAME:-dbiw}"

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
  < "${ROOT}/scripts/db/verify-app-cannot-drop-audit-trigger.sql"

#!/usr/bin/env bash
# Clona la base de integración ya preparada (migraciones públicas, least-privilege,
# tenant `test` y cadena tenant) en una base por worker de jest adicional.
#
# Spec: docs/specs/2026-11-09-plat-ops-ci-integracion-api-tiempo.md (opción A, G0 2026-11-09).
#
# Cada worker de `apps/api/jest.integration.config.js` corre sus suites en serie sobre
# su propia base. El worker 1 usa DB_NAME y los workers 2..N usan los clones que
# crea este script. CREATE DATABASE … TEMPLATE copia la base ya migrada byte a byte,
# así que cada suite sigue aplicando la cadena tenant real sobre su esquema propio.
# Lo único que TEMPLATE no copia son los privilegios a nivel de base, y por eso se
# reaplica least-privilege a cada clon.
#
# Nombre del clon k (misma regla que packages/database/test/integration-worker-db.js):
#   DB_NAME = iwana_it_g7_*   -> <DB_NAME>_w<k>
#   cualquier otro (CI: test) -> iwana_it_g7_<DB_NAME>_w<k>
# El prefijo iwana_it_g7_ lo exige la guarda de K2 (reencrypt-aes.integration-safety.ts).
#
# Uso CI (host psql):
#   LEAST_PRIVILEGE_MODE=host IWANA_IT_WORKERS=4 bash scripts/db/clone-integration-dbs.sh
# Uso local (Docker, contenedor POSTGRES_CONTAINER):
#   IWANA_IT_WORKERS=4 DB_NAME=iwana_it_g7_x bash scripts/db/clone-integration-dbs.sh
#
# Falla cerrado si max_locks_per_transaction < 256: con el valor por defecto (64),
# varios DROP SCHEMA … CASCADE concurrentes de esquemas tenant completos agotan la
# memoria de locks (53200), medido el 2026-11-09.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKERS="${IWANA_IT_WORKERS:-1}"
BASE_DB="${DB_NAME:-}"
MODE="${LEAST_PRIVILEGE_MODE:-docker}"
CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
BOOTSTRAP_USER="${DB_BOOTSTRAP_USER:-iwana}"
BOOTSTRAP_PASS="${DB_BOOTSTRAP_PASSWORD:-${DB_PASSWORD:-}}"
DB_HOST_RESOLVED="${DB_HOST:-${PGHOST:-localhost}}"
DB_PORT_RESOLVED="${DB_PORT:-${PGPORT:-5432}}"
MIN_LOCKS=256
SAFE_NAME='^iwana_it_g7_[a-z0-9_]+$'

fail() {
  echo "clone-integration-dbs: $*" >&2
  exit 1
}

[[ "${WORKERS}" =~ ^[1-9][0-9]*$ ]] || fail "IWANA_IT_WORKERS debe ser un entero >= 1 (recibido: ${WORKERS})."
[[ -n "${BASE_DB}" ]] || fail "falta DB_NAME (la base preparada que se clona)."
[[ "${BASE_DB}" =~ ^[a-z0-9_]+$ ]] || fail "DB_NAME con caracteres no admitidos: ${BASE_DB}."

if (( WORKERS == 1 )); then
  echo "clone-integration-dbs: IWANA_IT_WORKERS=1, no se clona nada."
  exit 0
fi

clone_name() {
  local k="$1"
  if [[ "${BASE_DB}" == iwana_it_g7_* ]]; then
    echo "${BASE_DB}_w${k}"
  else
    echo "iwana_it_g7_${BASE_DB}_w${k}"
  fi
}

psql_admin() {
  # Conecta a la base de mantenimiento `postgres`: CREATE DATABASE … TEMPLATE exige
  # que nadie esté conectado a la base plantilla, tampoco este mismo psql.
  if [[ "${MODE}" == "host" ]]; then
    [[ -n "${BOOTSTRAP_PASS}" ]] || fail "falta DB_BOOTSTRAP_PASSWORD en modo host."
    PGPASSWORD="${BOOTSTRAP_PASS}" psql -v ON_ERROR_STOP=1 -X -q -tA \
      -h "${DB_HOST_RESOLVED}" -p "${DB_PORT_RESOLVED}" -U "${BOOTSTRAP_USER}" -d postgres "$@"
  else
    docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}" \
      || fail "contenedor ${CONTAINER} no está en ejecución."
    docker exec -i -e PGPASSWORD="${BOOTSTRAP_PASS}" "${CONTAINER}" \
      psql -v ON_ERROR_STOP=1 -X -q -tA -U "${BOOTSTRAP_USER}" -d postgres "$@"
  fi
}

locks="$(psql_admin -c 'SHOW max_locks_per_transaction' | tr -d '[:space:]')"
if [[ ! "${locks}" =~ ^[0-9]+$ ]] || (( locks < MIN_LOCKS )); then
  fail "max_locks_per_transaction=${locks}; con ${WORKERS} workers hace falta >= ${MIN_LOCKS} (ALTER SYSTEM y reinicio del servidor)."
fi

for (( k = 2; k <= WORKERS; k++ )); do
  clone="$(clone_name "${k}")"
  [[ "${clone}" =~ ${SAFE_NAME} ]] || fail "nombre de clon no desechable: ${clone}."
  [[ "${clone}" != "${BASE_DB}" ]] || fail "el clon coincide con la base original: ${clone}."
  (( ${#clone} <= 63 )) || fail "nombre de clon de más de 63 caracteres: ${clone}."

  t0=$(date +%s)
  # Solo se borran nombres iwana_it_g7_* (comprobado arriba): son bases desechables.
  psql_admin -c "DROP DATABASE IF EXISTS \"${clone}\" WITH (FORCE)"
  psql_admin -c "CREATE DATABASE \"${clone}\" TEMPLATE \"${BASE_DB}\""
  # Los clones son bases de prueba: iwana_app conserva DDL en ellas como en `test`.
  DB_NAME="${clone}" DB_APP_DDL=on bash "${ROOT}/scripts/db/apply-least-privilege.sh" >/dev/null
  echo "clone-integration-dbs: ${clone} listo en $(( $(date +%s) - t0 )) s (plantilla ${BASE_DB})."
done

#!/usr/bin/env bash
# Respaldo del entorno estable en la LAN (H9, plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §3.1). Lo lanzan los
# timers iwana-backup-db (cada hora) e iwana-backup-media (diario).
#
#   backup.sh db      pg_dump -Fc global (pnpm db:backup) y purga por retención
#   backup.sh media   copia espejo del bucket S3_BUCKET con `mc mirror`
#
# Variables (las fija /etc/iwana/lan.conf, que instala install-systemd.sh):
#   IWANA_REPO        raíz del repositorio
#   IWANA_ENV_FILE    .env del entorno estable (DB_*, MINIO_ROOT_*, S3_BUCKET)
#   IWANA_BACKUP_DIR  carpeta local de respaldos; db/ y media/ cuelgan de ella
#   IWANA_OFFSITE_CMD comando opcional que recibe IWANA_BACKUP_DIR como $1 y
#                     copia cifrado fuera del host (offsite-restic.sh). Sin
#                     él, el respaldo NO cuenta como fuera del host y el
#                     script lo avisa en el journal.
# Retención de dumps: los 48 más recientes y nada mayor de 14 días.
set -euo pipefail
# Los respaldos contienen PII cifrada y metadatos: solo el operador los lee.
umask 077

: "${IWANA_REPO:?}" "${IWANA_ENV_FILE:?}" "${IWANA_BACKUP_DIR:?}"
COMPOSE=(docker compose -f "$IWANA_REPO/docker-compose.yml" -f "$IWANA_REPO/docker-compose.prod.yml"
  --profile production --env-file "$IWANA_ENV_FILE")

# Lee una sola clave del .env sin evaluarlo como shell.
env_get() {
  local line
  line=$(grep -E "^$1=" "$IWANA_ENV_FILE" | tail -n 1) || return 1
  line=${line#*=}
  line=${line#[\"\']}; line=${line%[\"\']}
  printf '%s' "$line"
}

offsite() {
  if [ -n "${IWANA_OFFSITE_CMD:-}" ]; then
    $IWANA_OFFSITE_CMD "$IWANA_BACKUP_DIR"
  else
    echo "AVISO: sin IWANA_OFFSITE_CMD; el respaldo solo existe en este host." >&2
  fi
}

case "${1:-}" in
  db)
    mkdir -p "$IWANA_BACKUP_DIR/db"
    cd "$IWANA_REPO"
    DB_BOOTSTRAP_USER=$(env_get DB_BOOTSTRAP_USER) DB_PASSWORD=$(env_get DB_PASSWORD) \
      DB_NAME=$(env_get DB_NAME || echo dbiw) POSTGRES_CONTAINER=iwana_postgres_prod \
      BACKUP_DIR="$IWANA_BACKUP_DIR/db" node scripts/db/backup.mjs
    BACKUP_DIR="$IWANA_BACKUP_DIR/db" node scripts/db/purge-backups.mjs --keep-count=48 --keep-days=14 --execute
    offsite
    ;;
  media)
    mkdir -p "$IWANA_BACKUP_DIR/media"
    # Corre como el uid del operador para que los archivos queden suyos; mc
    # escribe su configuración en /tmp (mismo criterio que minio-init).
    "${COMPOSE[@]}" run --rm --no-deps --user "$(id -u):$(id -g)" \
      -v "$IWANA_BACKUP_DIR/media:/backup" --entrypoint /bin/sh minio-init -c \
      'mc alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite --remove --quiet "src/$S3_BUCKET" /backup'
    offsite
    ;;
  *) echo "uso: $0 {db|media}" >&2; exit 2 ;;
esac

#!/usr/bin/env bash
# Copia cifrada fuera del host (plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §3.1). backup.sh lo
# invoca por IWANA_OFFSITE_CMD tras cada respaldo. restic cifra antes de enviar
# y viaja por SSH. La clave SSH solo debe poder ejecutar en el destino
# `rclone serve restic --stdio --append-only <carpeta>` (runbook §1.3): este
# host añade copias y no puede borrar las existentes.
#
#   offsite-restic.sh <carpeta>   copia la carpeta
#   offsite-restic.sh init        crea el repositorio (una sola vez)
#   offsite-restic.sh snapshots   lista las copias
#   offsite-restic.sh check       verifica la integridad
#
# Variables (/etc/iwana/lan.conf; son rutas, no secretos):
#   IWANA_OFFSITE_SSH          usuario@equipo
#   IWANA_OFFSITE_KEY          clave SSH dedicada
#   IWANA_OFFSITE_KNOWN_HOSTS  huella del equipo, verificada a mano
#   RESTIC_PASSWORD_FILE       contraseña del repositorio
set -euo pipefail

: "${IWANA_OFFSITE_SSH:?}" "${IWANA_OFFSITE_KEY:?}" "${IWANA_OFFSITE_KNOWN_HOSTS:?}" "${RESTIC_PASSWORD_FILE:?}"
export RESTIC_PASSWORD_FILE

# restic divide rclone.program por espacios: sin esto, un valor inyectaría opciones a ssh.
[[ $IWANA_OFFSITE_SSH =~ ^[a-z_][a-z0-9_-]*@[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo "IWANA_OFFSITE_SSH inválido" >&2; exit 2; }
for f in "$IWANA_OFFSITE_KEY" "$IWANA_OFFSITE_KNOWN_HOSTS"; do
  [[ $f =~ ^/[A-Za-z0-9._/-]+$ ]] || { echo "ruta inválida: $f" >&2; exit 2; }
done
for f in "$IWANA_OFFSITE_KEY" "$RESTIC_PASSWORD_FILE"; do
  case $(stat -c %a "$f") in 400 | 600) ;; *) echo "$f debe tener permisos 600" >&2; exit 2 ;; esac
done

SSH="ssh -i $IWANA_OFFSITE_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes"
SSH+=" -o UserKnownHostsFile=$IWANA_OFFSITE_KNOWN_HOSTS -o ConnectTimeout=15 -o ServerAliveInterval=15"
RESTIC=(restic -r rclone:iwana -o "rclone.program=$SSH $IWANA_OFFSITE_SSH")

case "${1:-}" in
  init | snapshots | check) "${RESTIC[@]}" "$1" ;;
  /*) [ -d "$1" ] || { echo "no existe la carpeta $1" >&2; exit 2; }
    "${RESTIC[@]}" backup --quiet --tag iwana-stable "$1" ;;
  *) echo "uso: $0 {/carpeta|init|snapshots|check}" >&2; exit 2 ;;
esac

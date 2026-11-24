#!/usr/bin/env bash
# Instala las unidades systemd del entorno estable en la LAN (plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §1.3, §3.1 y §3.3).
#
#   sudo scripts/lan/install-systemd.sh <usuario-operador>
#
# Renderiza scripts/lan/systemd/* con la ruta del repo, el usuario y su PATH (node
# y pnpm suelen vivir en ~/.local/bin), las copia a /etc/systemd/system y crea
# /etc/iwana/lan.conf si no existe. No habilita nada: el operador revisa
# lan.conf y habilita las unidades con los comandos que imprime al final.
set -euo pipefail

OPERATOR=${1:?uso: sudo $0 <usuario-operador>}
[ "$(id -u)" -eq 0 ] || { echo "requiere root" >&2; exit 1; }
id "$OPERATOR" >/dev/null
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HOME_DIR=$(getent passwd "$OPERATOR" | cut -d: -f6)
OPATH="$HOME_DIR/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

render() { sed -e "s#@REPO@#$REPO#g" -e "s#@USER@#$OPERATOR#g" -e "s#@PATH@#$OPATH#g" "$1"; }

for unit in "$REPO"/scripts/lan/systemd/*.service "$REPO"/scripts/lan/systemd/*.timer; do
  render "$unit" > "/etc/systemd/system/$(basename "$unit")"
  chmod 644 "/etc/systemd/system/$(basename "$unit")"
done
install -d -m 755 /etc/iwana
[ -e /etc/iwana/lan.conf ] || { render "$REPO/scripts/lan/systemd/lan.conf.example" > /etc/iwana/lan.conf; chmod 644 /etc/iwana/lan.conf; }
install -d -m 750 -o "$OPERATOR" -g "$OPERATOR" /var/backups/iwana
systemctl daemon-reload

cat <<EOF
Unidades instaladas. Revisa /etc/iwana/lan.conf y después:
  sudo systemctl enable --now iwana-lan-firewall.service
  sudo systemctl enable --now iwana-backup-db.timer iwana-backup-media.timer iwana-healthwatch.timer
EOF

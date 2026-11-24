#!/usr/bin/env bash
# Reglas de la cadena DOCKER-USER del entorno estable en la LAN (H5, plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §1.3).
#
# Docker Engine publica puertos con DNAT y salta las reglas de ufw: el filtro de
# los puertos publicados va en DOCKER-USER. Decisión del CTO (2026-11-24): 80 y
# 443 hacia la IP del servidor abiertos a toda la 10.0.0.0/24; cualquier otra
# conexión nueva que entre por la interfaz LAN hacia un contenedor se descarta.
# Las respuestas a conexiones que abren los contenedores (npm, apt, SMTP) pasan
# por la regla ESTABLISHED,RELATED.
#
# Uso (como root):
#   docker-user-firewall.sh apply   [--iface eno1] [--server-ip 10.0.0.254] [--allow 10.0.0.0/24]
#   docker-user-firewall.sh remove
#   docker-user-firewall.sh print   (no toca nada: imprime las reglas que aplicaría)
#
# Alta inicial con base vacía: `apply --allow <IP-del-operador>/32` y, creada la
# cuenta, `apply` de nuevo con el valor por defecto. `apply` es idempotente:
# vacía y rellena su propia cadena IWANA-LAN y deja una sola regla de salto.
# Solo IPv4: el bind del proxy es una IPv4 (PROXY_BIND_IP) y Docker no habilita
# IPv6 por defecto.
set -euo pipefail

CHAIN=IWANA-LAN
ACTION=${1:-}
[ $# -gt 0 ] && shift
IFACE=${IWANA_LAN_IFACE:-eno1}
SERVER_IP=${IWANA_LAN_SERVER_IP:-10.0.0.254}
ALLOW=${IWANA_LAN_ALLOW:-10.0.0.0/24}
IPT=${IPTABLES:-iptables}

while [ $# -gt 0 ]; do
  case "$1" in
    --iface) IFACE=$2; shift 2 ;;
    --server-ip) SERVER_IP=$2; shift 2 ;;
    --allow) ALLOW=$2; shift 2 ;;
    *) echo "argumento no reconocido: $1" >&2; exit 2 ;;
  esac
done

valid_ipv4() { [[ $1 =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; }
valid_cidr() { [[ $1 =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/([0-9]|[12][0-9]|3[0-2])$ ]]; }
valid_ipv4 "$SERVER_IP" || { echo "--server-ip inválida: $SERVER_IP" >&2; exit 2; }
valid_cidr "$ALLOW" || { echo "--allow debe ser un CIDR IPv4: $ALLOW" >&2; exit 2; }
[[ $IFACE =~ ^[A-Za-z0-9_.-]{1,15}$ ]] || { echo "--iface inválida: $IFACE" >&2; exit 2; }

rules() {
  echo "-A $CHAIN -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
  for port in 80 443; do
    echo "-A $CHAIN -i $IFACE -p tcp -s $ALLOW -m conntrack --ctorigdst $SERVER_IP --ctorigdstport $port -j RETURN"
  done
  echo "-A $CHAIN -i $IFACE -j DROP"
}

case "$ACTION" in
  print)
    echo "-N $CHAIN"
    rules
    echo "-I DOCKER-USER 1 -j $CHAIN"
    ;;
  apply)
    $IPT -n -L DOCKER-USER >/dev/null 2>&1 || { echo "falta la cadena DOCKER-USER: ¿Docker Engine está arriba?" >&2; exit 1; }
    $IPT -N "$CHAIN" 2>/dev/null || $IPT -F "$CHAIN"
    rules | while read -r -a rule; do $IPT "${rule[@]}"; done
    $IPT -C DOCKER-USER -j "$CHAIN" 2>/dev/null || $IPT -I DOCKER-USER 1 -j "$CHAIN"
    echo "DOCKER-USER: 80/443 hacia $SERVER_IP desde $ALLOW por $IFACE; el resto se descarta."
    ;;
  remove)
    while $IPT -D DOCKER-USER -j "$CHAIN" 2>/dev/null; do :; done
    $IPT -F "$CHAIN" 2>/dev/null || true
    $IPT -X "$CHAIN" 2>/dev/null || true
    echo "Cadena $CHAIN retirada."
    ;;
  *)
    echo "uso: $0 {apply|remove|print} [--iface IF] [--server-ip IP] [--allow CIDR]" >&2
    exit 2
    ;;
esac

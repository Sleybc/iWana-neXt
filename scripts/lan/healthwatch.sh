#!/usr/bin/env bash
# Monitoreo mínimo del entorno estable en la LAN (plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §3.3). Lo lanza el timer
# iwana-healthwatch cada 5 minutos. Cada fallo sale por stderr con prioridad
# `err` en el journal y el script termina en 1, de modo que
# `systemctl --failed` y `journalctl -p err -u iwana-healthwatch` lo muestran.
# Sin SMTP (H10) no hay correo: el canal de aviso se conecta cuando exista.
#
# Variables: IWANA_HEALTH_URL (default https://10.0.0.254/api/v1/health),
# IWANA_TLS_DIR (fullchain.pem a vigilar), IWANA_DISK_PATHS (default "/"),
# IWANA_CA_FILE (raíz para validar el certificado; sin ella se usa -k).
set -uo pipefail

URL=${IWANA_HEALTH_URL:-https://10.0.0.254/api/v1/health}
DISKS=${IWANA_DISK_PATHS:-/}
fail=0
alert() { echo "<3>ALERTA: $*" >&2; fail=1; }

if [ -n "${IWANA_CA_FILE:-}" ]; then tls=(--cacert "$IWANA_CA_FILE"); else tls=(-k); fi
curl -fsS -m 10 "${tls[@]}" -o /dev/null "$URL" || alert "$URL no responde"

unhealthy=$(docker ps --filter health=unhealthy --format '{{.Names}}')
[ -z "$unhealthy" ] || alert "contenedores unhealthy: $(echo "$unhealthy" | tr '\n' ' ')"
for name in iwana_nginx_prod iwana_api_prod iwana_web_prod iwana_worker_prod iwana_postgres_prod; do
  [ "$(docker inspect -f '{{.State.Running}}' "$name" 2>/dev/null)" = true ] || alert "$name no está corriendo"
done

for path in $DISKS; do
  use=$(df --output=pcent "$path" | tail -n 1 | tr -dc '0-9')
  [ "${use:-0}" -lt 80 ] || alert "disco $path al ${use} %"
done

if [ -n "${IWANA_TLS_DIR:-}" ]; then
  openssl x509 -checkend $((30 * 86400)) -noout -in "$IWANA_TLS_DIR/fullchain.pem" >/dev/null \
    || alert "el certificado de $IWANA_TLS_DIR vence en menos de 30 días"
fi

[ "$fail" -eq 0 ] && echo "ok: salud, contenedores, disco y certificado"
exit "$fail"

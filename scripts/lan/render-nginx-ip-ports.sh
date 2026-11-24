#!/usr/bin/env bash
# Configuración de nginx para pruebas por IP (plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md): deriva de
# nginx/nginx.prod.conf y sirve el portal en 8443 y los archivos en 9443, sin
# nombres. El Host conserva el puerto: lo exigen la firma de los enlaces de
# archivos y la comprobación de origen de Next.js.
#   render-nginx-ip-ports.sh > <destino>   (PROXY_NGINX_CONFIG del .env)
set -euo pipefail
src="$(dirname "$0")/../../nginx/nginx.prod.conf"
out=$(perl -0pe '
  s/listen 443 ssl;(\n    http2 on;\n    server_name )portal\.REPLACE_ME_PRODUCTION_DOMAIN;/listen 8443 ssl;$1_;/;
  s/listen 443 ssl;(\n    http2 on;\n    server_name )archivos\.REPLACE_ME_PRODUCTION_DOMAIN;/listen 9443 ssl;$1_;/;
  my $i = index($_, "listen 8443 ssl;");
  if ($i > 0) { my $t = substr($_, $i); $t =~ s/Host \$host;/Host \$http_host;/g; $_ = substr($_, 0, $i) . $t; }
' "$src")
for p in 8443 9443; do
  grep -q "listen $p ssl;" <<<"$out" || { echo "nginx.prod.conf cambió: no se pudo derivar $p" >&2; exit 1; }
done
printf '%s\n' "$out"

#!/usr/bin/env bash
# CA interna del entorno estable en la LAN (H7, plan
# docs/plans/2026-11-24-piloto-lan-a-entorno-estable.md §2.2).
#
#   issue-internal-ca.sh ca     <dir-ca>                    raíz nueva (10 años)
#   issue-internal-ca.sh server <dir-ca> <dir-tls> <SAN...> certificado de servidor (397 días)
#
# La raíz lleva `nameConstraints` críticas: solo puede firmar certificados para
# las IP y nombres permitidos (por defecto IP:10.0.0.254). Si la clave se filtra,
# no sirve para suplantar otros sitios en los equipos que confían en ella.
# La clave de la raíz se cifra con AES-256 y una frase de paso; <dir-ca> debe
# estar FUERA del servidor (memoria USB cifrada o equipo del operador). En el
# servidor solo viven fullchain.pem y privkey.pem del certificado de servidor.
#
# Variables:
#   IWANA_CA_CONSTRAINTS  lista para permitted, p. ej.
#                         "IP:10.0.0.254/255.255.255.255,DNS:.iwana.lan"
#   IWANA_CA_PASSFILE     archivo con la frase de paso (si falta, openssl la pide)
#   IWANA_CA_NAME         CN de la raíz (default «iWana LAN Root CA <año>»)
# SAN del servidor: IP:10.0.0.254 y, si se adopta, DNS:consola.iwana.lan.
set -euo pipefail
umask 077

MODE=${1:-}
CA_DIR=${2:-}
CONSTRAINTS=${IWANA_CA_CONSTRAINTS:-IP:10.0.0.254/255.255.255.255}
# RFC 5280: un tipo de nombre sin subárbol permitido queda SIN restricción. Si no
# se permite ningún DNS, se permite solo `iwana.invalid` (TLD reservado) para que
# la raíz no pueda firmar ningún dominio real.
case ",$CONSTRAINTS" in *,DNS:*) ;; *) CONSTRAINTS="$CONSTRAINTS,DNS:iwana.invalid" ;; esac
case ",$CONSTRAINTS" in *,IP:*) ;; *) CONSTRAINTS="$CONSTRAINTS,IP:0.0.0.0/255.255.255.255" ;; esac
CA_NAME=${IWANA_CA_NAME:-iWana LAN Root CA $(date +%Y)}
if [ -n "${IWANA_CA_PASSFILE:-}" ]; then PASS=(-pass "file:$IWANA_CA_PASSFILE"); PASSIN=(-passin "file:$IWANA_CA_PASSFILE"); else PASS=(); PASSIN=(); fi

usage() { echo "uso: $0 ca <dir-ca> | server <dir-ca> <dir-tls> <SAN> [SAN...]" >&2; exit 2; }
[ -n "$CA_DIR" ] || usage

case "$MODE" in
  ca)
    mkdir -p "$CA_DIR"
    [ ! -e "$CA_DIR/root-ca.key" ] || { echo "ya existe $CA_DIR/root-ca.key: no se sobrescribe" >&2; exit 1; }
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -aes-256-cbc "${PASS[@]}" -out "$CA_DIR/root-ca.key"
    openssl req -x509 -new -key "$CA_DIR/root-ca.key" "${PASSIN[@]}" -sha256 -days 3650 \
      -subj "/O=iWana/CN=$CA_NAME" \
      -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
      -addext "keyUsage=critical,keyCertSign,cRLSign" \
      -addext "subjectKeyIdentifier=hash" \
      -addext "nameConstraints=critical,$(echo "$CONSTRAINTS" | sed 's/\(^\|,\)/\1permitted;/g')" \
      -out "$CA_DIR/root-ca.crt"
    chmod 644 "$CA_DIR/root-ca.crt"
    openssl x509 -in "$CA_DIR/root-ca.crt" -noout -subject -enddate -fingerprint -sha256
    ;;
  server)
    TLS_DIR=${3:-}; [ -n "$TLS_DIR" ] && [ $# -ge 4 ] || usage
    shift 3
    SAN=$(IFS=,; echo "$*")
    [ -f "$CA_DIR/root-ca.key" ] && [ -f "$CA_DIR/root-ca.crt" ] || { echo "falta la raíz en $CA_DIR" >&2; exit 1; }
    mkdir -p "$TLS_DIR"
    WORK=$(mktemp -d); trap 'rm -rf -- "$WORK"' EXIT
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$WORK/privkey.pem"
    openssl req -new -key "$WORK/privkey.pem" -subj "/O=iWana/OU=Consola LAN" -out "$WORK/server.csr"
    printf '%s\n' "basicConstraints=critical,CA:FALSE" "keyUsage=critical,digitalSignature" \
      "extendedKeyUsage=serverAuth" "subjectAltName=$SAN" "authorityKeyIdentifier=keyid" > "$WORK/ext.cnf"
    openssl x509 -req -in "$WORK/server.csr" -CA "$CA_DIR/root-ca.crt" -CAkey "$CA_DIR/root-ca.key" "${PASSIN[@]}" \
      -CAcreateserial -CAserial "$CA_DIR/root-ca.srl" -days 397 -sha256 -extfile "$WORK/ext.cnf" -out "$WORK/server.crt"
    # Se verifica contra la raíz (incluidas sus nameConstraints) antes de tocar <dir-tls>.
    openssl verify -CAfile "$CA_DIR/root-ca.crt" "$WORK/server.crt"
    cat "$WORK/server.crt" "$CA_DIR/root-ca.crt" > "$TLS_DIR/fullchain.pem"
    install -m 600 "$WORK/privkey.pem" "$TLS_DIR/privkey.pem"
    chmod 644 "$TLS_DIR/fullchain.pem"
    openssl x509 -in "$WORK/server.crt" -noout -subject -enddate -ext subjectAltName
    ;;
  *) usage ;;
esac

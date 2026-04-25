#!/usr/bin/env bash
# generate-secrets.sh — Genera par RSA JWT y clave de cifrado AES-256-GCM
#
# ADVERTENCIAS DE SEGURIDAD:
#   - NUNCA ejecutar en produccion con los mismos valores que en desarrollo
#   - NUNCA commitear los archivos .pem generados (están en .gitignore)
#   - Los archivos generados son: secrets/jwt-private.pem, secrets/jwt-public.pem
#   - La ENCRYPTION_KEY se agrega a .env.local (no versionado)
#
# Uso: bash scripts/generate-secrets.sh
# Requiere: openssl instalado en el sistema

set -e

SECRETS_DIR="$(dirname "$0")/../secrets"

echo "==> Generando par de claves RSA 2048-bit para JWT RS256..."
openssl genrsa -out "${SECRETS_DIR}/jwt-private.pem" 2048
openssl rsa -in "${SECRETS_DIR}/jwt-private.pem" -pubout -out "${SECRETS_DIR}/jwt-public.pem"
echo "    ✓ secrets/jwt-private.pem generado"
echo "    ✓ secrets/jwt-public.pem generado"

echo "==> Generando ENCRYPTION_KEY AES-256-GCM (32 bytes hex)..."
ENCRYPTION_KEY=$(openssl rand -hex 32)
ENV_LOCAL="$(dirname "$0")/../.env.local"
echo "ENCRYPTION_KEY=${ENCRYPTION_KEY}" >> "${ENV_LOCAL}"
echo "    ✓ ENCRYPTION_KEY agregada a .env.local"

echo ""
echo "==> Listo. Recuerda:"
echo "    - NUNCA commitear secrets/*.pem ni .env.local"
echo "    - En produccion, rotar las claves periodicamente"

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

echo "==> Generando MFA_ENCRYPTION_KEY AES-256-GCM (32 bytes hex)..."
MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)
ENV_LOCAL="$(dirname "$0")/../.env.local"
# No escribir si ya hay una clave (evita pisar rotaciones locales).
if grep -q '^MFA_ENCRYPTION_KEY=.\+' "${ENV_LOCAL}" 2>/dev/null; then
  echo "    · MFA_ENCRYPTION_KEY ya presente en .env.local — no se sobrescribe"
  echo "    · Para rotar: docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md"
else
  {
    echo ""
    echo "# Generada por scripts/generate-secrets.sh — NUNCA 64 ceros (SEC-02)"
    echo "MFA_ENCRYPTION_KEY=${MFA_ENCRYPTION_KEY}"
    echo "# MFA_ENCRYPTION_KEY_PREVIOUS="
  } >> "${ENV_LOCAL}"
  echo "    ✓ MFA_ENCRYPTION_KEY agregada a .env.local"
fi

echo ""
echo "==> Listo. Recuerda:"
echo "    - NUNCA commitear secrets/*.pem ni .env.local / .env*"
echo "    - Rotación: docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md"
echo "    - En produccion, rotar solo con go CTO (ADR-058)"


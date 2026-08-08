#!/usr/bin/env bash
# generate-secrets.sh — Genera secretos locales para API y worker
#
# ADVERTENCIAS DE SEGURIDAD:
#   - NUNCA ejecutar en produccion con los mismos valores que en desarrollo
#   - NUNCA imprime, versiona ni sobrescribe secretos existentes
#   - API, worker y los CLI cargan .env.development.local antes de los defaults
#   - No crea PEM persistentes bajo secrets/: JWT se escribe en las variables que
#     ya consume Auth, con saltos de línea literales
#
# Uso: bash scripts/generate-secrets.sh
# Requiere: openssl instalado en el sistema

set -euo pipefail
umask 077

ROOT_DIR="${IWANA_SECRETS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_LOCAL="${ROOT_DIR}/.env.development.local"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

touch "${ENV_LOCAL}"
chmod 600 "${ENV_LOCAL}" 2>/dev/null || true

has_value() { grep -q "^${1}=.\+" "${ENV_LOCAL}" 2>/dev/null; }
append_value() { printf '\n# Generado localmente por scripts/generate-secrets.sh — no versionar\n%s=%s\n' "$1" "$2" >> "${ENV_LOCAL}"; }

if has_value JWT_PRIVATE_KEY || has_value JWT_PUBLIC_KEY; then
  echo "    · JWT_* ya existe en .env.development.local — no se sobrescribe"
else
  echo "==> Generando par JWT RS256 local..."
  openssl genrsa -out "${TEMP_DIR}/jwt-private.pem" 2048
  openssl rsa -in "${TEMP_DIR}/jwt-private.pem" -pubout -out "${TEMP_DIR}/jwt-public.pem"
  private_key="$(awk 'BEGIN { ORS="\\\\n" } { print }' "${TEMP_DIR}/jwt-private.pem")"
  public_key="$(awk 'BEGIN { ORS="\\\\n" } { print }' "${TEMP_DIR}/jwt-public.pem")"
  append_value JWT_PRIVATE_KEY "'${private_key}'"
  append_value JWT_PUBLIC_KEY "'${public_key}'"
  echo "    ✓ JWT_* agregadas a .env.development.local"
fi

for name in MFA_ENCRYPTION_KEY PII_HASH_KEY; do
  if has_value "${name}"; then
    echo "    · ${name} ya existe en .env.development.local — no se sobrescribe"
  else
    append_value "${name}" "$(openssl rand -hex 32)"
    echo "    ✓ ${name} agregada a .env.development.local"
  fi
done

echo ""
echo "==> Listo. Recuerda:"
echo "    - NUNCA commitear .env.development.local ni copiar sus valores a .env.example"
echo "    - Rotación: docs/runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md"
echo "    - En produccion, rotar solo con go CTO (ADR-058)"

#!/usr/bin/env bash
# ==============================================================================
# bootstrap-minio.sh — Inicializa el bucket iwana-media en MinIO dev
#
# Requiere: mc (MinIO Client) instalado o accesible en PATH.
# Instalar mc: https://min.io/docs/minio/linux/reference/minio-mc.html
#
# Uso:
#   bash scripts/bootstrap-minio.sh
#
# Variables de entorno (se leen de .env.development si existen):
#   MINIO_ENDPOINT   — Default: http://localhost:9002
#   MINIO_ROOT_USER  — Default: minioadmin
#   MINIO_ROOT_PASS  — Default: minioadmin123
#   MINIO_BUCKET     — Default: iwana-media
#
# ADR-033 — Storage MinIO + StoragePort
# ==============================================================================
set -euo pipefail

MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://localhost:9002}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASS="${MINIO_ROOT_PASS:-minioadmin123}"
MINIO_BUCKET="${MINIO_BUCKET:-iwana-media}"
MC_ALIAS="iwana-local"

echo "==> Configurando alias MinIO: ${MC_ALIAS} → ${MINIO_ENDPOINT}"
mc alias set "${MC_ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASS}"

echo "==> Verificando/creando bucket: ${MINIO_BUCKET}"
if mc ls "${MC_ALIAS}/${MINIO_BUCKET}" > /dev/null 2>&1; then
  echo "    Bucket '${MINIO_BUCKET}' ya existe — omitiendo creación."
else
  mc mb "${MC_ALIAS}/${MINIO_BUCKET}"
  echo "    Bucket '${MINIO_BUCKET}' creado."
fi

# Política de acceso: private (las URLs se generan como signed URLs)
# Cambiar a 'download' si se desea acceso público sin signed URL.
echo "==> Aplicando política: private"
mc anonymous set private "${MC_ALIAS}/${MINIO_BUCKET}"

echo ""
echo "✓ MinIO bootstrap completado."
echo "  Bucket  : ${MINIO_BUCKET}"
echo "  Endpoint: ${MINIO_ENDPOINT}"
echo "  Consola : http://localhost:9003 (usuario: ${MINIO_ROOT_USER})"
echo ""
echo "  Para subir archivos manualmente:"
echo "  mc cp /ruta/archivo.png ${MC_ALIAS}/${MINIO_BUCKET}/platform/logo/test.png"

#!/usr/bin/env bash
# Realinea el tenant `test` de la base LOCAL de integración `test` con su schema
# `tenant_test` (P-11, informe MOD05-MOD14 facturación ficha).
#
# CI crea la fila public.tenants (slug `test`) y migra `tenant_test` en el mismo job,
# así que el tenant_id sembrado por las migraciones tenant (plantillas 118/131/163,
# permisos, transiciones…) coincide con public.tenants.id. En local la fila puede
# recrearse con otro id y el schema conserva las semillas del id anterior: las suites
# que leen por tenant_id (p. ej. execution-orders.close-by-result) no ven la plantilla
# INSTALACION_ESTANDAR v3 y fallan.
#
# Sin argumentos solo informa. Con --apply devuelve a la fila `test` el id con el que se
# sembró `tenant_test`: un UPDATE de una sola fila, sin borrar nada. Idempotente.
# Solo opera sobre la base `test`; ninguna FK apunta a public.tenants (verificado
# 2026-11-14).
#
# Uso: bash scripts/db/realign-local-integration-tenant.sh [--apply]
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-iwana_postgres_dev}"
APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

docker ps --format '{{.Names}}' | grep -qx "${CONTAINER}" \
  || { echo "contenedor ${CONTAINER} no está en ejecución." >&2; exit 1; }

docker exec -i "${CONTAINER}" sh -c 'psql -U "$POSTGRES_USER" -d test -X -q -v ON_ERROR_STOP=1 -v apply='"${APPLY}" <<'SQL'
\o /dev/null
SELECT set_config('iwana.apply', :'apply', false);
\o
DO $$
DECLARE seed_ids uuid[]; row_id uuid;
BEGIN
  IF current_database() <> 'test' THEN RAISE EXCEPTION 'solo opera sobre la base test'; END IF;
  SELECT id INTO row_id FROM public.tenants WHERE slug = 'test' AND status = 'ACTIVE';
  IF row_id IS NULL THEN RAISE EXCEPTION 'falta el tenant ACTIVE test: créelo como el paso «Run tenant migrations» de ci.yml'; END IF;
  SELECT array_agg(DISTINCT tenant_id) INTO seed_ids
    FROM tenant_test.execution_order_templates WHERE key = 'INSTALACION_ESTANDAR';
  IF coalesce(array_length(seed_ids, 1), 0) <> 1 THEN
    RAISE EXCEPTION 'tenant_test sin semilla única de INSTALACION_ESTANDAR (%): migre la cadena tenant', seed_ids;
  END IF;
  IF row_id = seed_ids[1] THEN RAISE NOTICE 'alineado: tenant test = %', row_id; RETURN; END IF;
  IF current_setting('iwana.apply') <> 'true' THEN
    RAISE NOTICE 'DESALINEADO: public.tenants.id=% y tenant_test sembrado con %. Reejecute con --apply.', row_id, seed_ids[1];
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = seed_ids[1]) THEN
    RAISE EXCEPTION 'el id % ya lo usa otro tenant', seed_ids[1];
  END IF;
  UPDATE public.tenants SET id = seed_ids[1] WHERE slug = 'test' AND id = row_id;
  RAISE NOTICE 'realineado: % -> % (para revertir, UPDATE inverso)', row_id, seed_ids[1];
END $$;
SQL

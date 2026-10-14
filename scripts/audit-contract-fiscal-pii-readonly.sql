-- T12 · Inventario histórico de claves fiscales en auditoría de contratos.
-- SOLO LECTURA. Ejecutar únicamente mediante la conexión `postgres-dev`
-- configurada con el rol `iwana_readonly`. Nunca contiene DML ni DDL.
-- Salida: tenant/schema, conteo de filas y rango de created_at; ningún valor JSON.

\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

SELECT current_user = 'iwana_readonly'
   AND current_setting('transaction_read_only') = 'on' AS safe_readonly_context
\gset

\if :safe_readonly_context
\else
  \echo 'ABORTADO: se requiere postgres-dev con el rol iwana_readonly y transacción READ ONLY.'
  \quit
\endif

-- Genera un SELECT agregado y acotado por cada schema de tenant registrado.
-- %I cita cada identificador dinámico; el patrón valida el nombre antes de usarlo.
SELECT format(
  CASE
    WHEN to_regclass(format('%I.audit_logs', tenant.schema_name)) IS NULL THEN
      $empty$
        SELECT %L::text AS tenant_id,
               %L::text AS tenant_schema,
               false AS audit_table_present,
               0::bigint AS matching_rows,
               NULL::timestamptz AS first_created_at,
               NULL::timestamptz AS last_created_at
      $empty$
    ELSE
      $scan$
        SELECT %L::text AS tenant_id,
               %L::text AS tenant_schema,
               true AS audit_table_present,
               COUNT(*) FILTER (WHERE matched.has_target_key)::bigint AS matching_rows,
               MIN(matched.created_at) FILTER (WHERE matched.has_target_key) AS first_created_at,
               MAX(matched.created_at) FILTER (WHERE matched.has_target_key) AS last_created_at
        FROM (
          SELECT audit.created_at,
                 scan.has_target_key
          FROM %I.audit_logs AS audit
          CROSS JOIN LATERAL (
            WITH RECURSIVE json_nodes(value) AS (
              SELECT documents.value
              FROM (VALUES (audit.old_value), (audit.new_value)) AS documents(value)
              WHERE documents.value IS NOT NULL
              UNION ALL
              SELECT child.value
              FROM json_nodes AS node
              CROSS JOIN LATERAL (
                SELECT object_entry.value
                FROM jsonb_each(
                  CASE WHEN jsonb_typeof(node.value) = 'object'
                       THEN node.value ELSE '{}'::jsonb END
                ) AS object_entry(key, value)
                UNION ALL
                SELECT array_entry.value
                FROM jsonb_array_elements(
                  CASE WHEN jsonb_typeof(node.value) = 'array'
                       THEN node.value ELSE '[]'::jsonb END
                ) AS array_entry(value)
              ) AS child(value)
              WHERE jsonb_typeof(node.value) IN ('object', 'array')
            )
            SELECT EXISTS (
              SELECT 1
              FROM json_nodes AS node
              CROSS JOIN LATERAL jsonb_each(
                CASE WHEN jsonb_typeof(node.value) = 'object'
                     THEN node.value ELSE '{}'::jsonb END
              ) AS entry(key, value)
              WHERE entry.key = ANY (
                ARRAY[
                  'fiscalDocument', 'fiscal_document',
                  'fiscalName', 'fiscal_name'
                ]::text[]
              )
                AND entry.value <> 'null'::jsonb
            ) AS has_target_key
          ) AS scan
          WHERE audit.entity_type = ANY (
            ARRAY[
              'Contracts', 'Contract',
              'ContractServicePoint', 'ContractStratumEvidence',
              'STRATUM_EVIDENCE_ACCESS'
            ]::text[]
          )
        ) AS matched
      $scan$
  END,
  tenant.id::text,
  tenant.schema_name,
  tenant.schema_name
)
FROM public.tenants AS tenant
WHERE tenant.schema_name ~ '^tenant_[a-z][a-z0-9_]{0,54}$'
ORDER BY tenant.schema_name
\gexec

COMMIT;

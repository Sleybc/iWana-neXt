-- Snapshot DDL contrato users (post/pre migración 083). Sin PII.
SELECT
  t.schema_name,
  MAX(CASE WHEN col.column_name = 'email' THEN col.character_maximum_length END) AS email_len,
  MAX(CASE WHEN col.column_name = 'first_name' THEN col.character_maximum_length END) AS first_len,
  MAX(CASE WHEN col.column_name = 'last_name' THEN col.character_maximum_length END) AS last_len,
  MAX(CASE WHEN col.column_name = 'document_number' THEN col.character_maximum_length END) AS doc_len,
  BOOL_OR(
    EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname = t.schema_name
        AND rel.relname = 'users'
        AND con.conname = 'uq_users_email'
        AND con.contype = 'u'
    )
  ) AS has_uq_users_email,
  BOOL_OR(to_regclass(format('%I.idx_users_first_name', t.schema_name)) IS NOT NULL) AS has_idx_first_name,
  BOOL_OR(to_regclass(format('%I.idx_users_last_name', t.schema_name)) IS NOT NULL) AS has_idx_last_name
FROM public.tenants t
JOIN information_schema.columns col
  ON col.table_schema = t.schema_name
 AND col.table_name = 'users'
 AND col.column_name IN ('email', 'first_name', 'last_name', 'document_number')
WHERE t.status = 'ACTIVE'
GROUP BY t.schema_name
ORDER BY t.schema_name;

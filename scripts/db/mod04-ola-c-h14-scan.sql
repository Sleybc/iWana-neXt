-- H-14: residuales cifrados (iv:tag:ciphertext) en users.
-- Alcance: todos los schemas `tenant_*` + filas de public.tenants.
-- Solo conteos por schema — sin PII.
-- Gemelo: scripts/mod04-h14-legacy-scan.sql

DO $$
DECLARE
  r RECORD;
  email_enc bigint;
  first_enc bigint;
  last_enc bigint;
  doc_enc bigint;
  total_u bigint;
  has_doc boolean;
  residual bigint;
  cipher_re text := '^[0-9a-fA-F]{24}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$';
  schemas_scanned int := 0;
  schemas_with_residual int := 0;
BEGIN
  RAISE NOTICE 'H-14 residual cipher scan (ALL tenant schemas)';
  FOR r IN
    SELECT DISTINCT s.schema_name
    FROM (
      SELECT nspname AS schema_name
        FROM pg_namespace
       WHERE nspname LIKE 'tenant_%'
      UNION
      SELECT schema_name FROM public.tenants
    ) s
    ORDER BY 1
  LOOP
    IF to_regclass(format('%I.users', r.schema_name)) IS NULL THEN
      RAISE NOTICE 'schema=% SKIP no users table', r.schema_name;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = r.schema_name
         AND table_name = 'users'
         AND column_name = 'document_number'
    )
    INTO has_doc;

    IF has_doc THEN
      EXECUTE format(
        'SELECT
           COUNT(*) FILTER (WHERE email ~ %L),
           COUNT(*) FILTER (WHERE first_name ~ %L),
           COUNT(*) FILTER (WHERE last_name ~ %L),
           COUNT(*) FILTER (WHERE document_number ~ %L),
           COUNT(*)
         FROM %I.users',
        cipher_re,
        cipher_re,
        cipher_re,
        cipher_re,
        r.schema_name
      )
      INTO email_enc, first_enc, last_enc, doc_enc, total_u;
    ELSE
      EXECUTE format(
        'SELECT
           COUNT(*) FILTER (WHERE email ~ %L),
           COUNT(*) FILTER (WHERE coalesce(first_name, '''') ~ %L),
           COUNT(*) FILTER (WHERE coalesce(last_name, '''') ~ %L),
           0::bigint,
           COUNT(*)
         FROM %I.users',
        cipher_re,
        cipher_re,
        cipher_re,
        r.schema_name
      )
      INTO email_enc, first_enc, last_enc, doc_enc, total_u;
      RAISE NOTICE
        'schema=% NOTE incomplete users DDL (sin document_number)',
        r.schema_name;
    END IF;

    residual := email_enc + first_enc + last_enc + doc_enc;
    schemas_scanned := schemas_scanned + 1;
    IF residual > 0 THEN
      schemas_with_residual := schemas_with_residual + 1;
    END IF;

    RAISE NOTICE
      'schema=% total=% email_enc=% first_enc=% last_enc=% doc_enc=% residual=%',
      r.schema_name,
      total_u,
      email_enc,
      first_enc,
      last_enc,
      doc_enc,
      residual;
  END LOOP;

  RAISE NOTICE
    'H-14 SUMMARY schemas_scanned=% schemas_with_residual=%',
    schemas_scanned,
    schemas_with_residual;
END
$$;

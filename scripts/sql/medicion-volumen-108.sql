-- =============================================================================
-- Medicion de volumen v2 (metodo D-3 corregido) para la migracion tenant 108
-- =============================================================================
-- Origen: INFORME-SEC-P1-HASH-HMAC-Y-PII-AUDITORIA-v1.0.md, seccion
--         «Evidencia Punto 2 — lock 108» / «Correccion de metodo D-3».
--         Regenerado desde esa descripcion canonica; el scratchpad donde vivia
--         el SQL v2 original ya no existe.
--
-- Proposito: estimar el volumen real de las tres tablas que la 108 toca
-- (users, subscribers, expediente_records) ANTES de aplicar el expand/contract,
-- para sostener (o descartar) el veredicto KEEP `transactional = true`.
--
-- Por que este metodo y no relpages/reltuples a secas (D-3):
--   pg_class.reltuples/relpages solo se refrescan con ANALYZE o VACUUM. Una
--   tabla poblada y nunca analizada presenta reltuples = -1, relpages = 0,
--   indistinguible de una vacia. Descartar celdas por relpages = 0 es una
--   inferencia invalida.
--
-- Por que se verifica la post-condicion del ANALYZE:
--   ANALYZE exige ownership o MAINTAIN. Bajo un rol de aplicacion (least
--   privilege, SEC-04) Postgres NO lanza error: emite
--   `WARNING: permission denied to analyze ... skipping it` y continua. Un
--   ANALYZE que no corrio puede pasar por corrido. Por eso el script compara
--   pg_stat_all_tables.last_analyze antes/despues y cae a COUNT(*) exacto
--   cuando no hubo efecto (o cuando reltuples < 0, o relpages = 0).
--
-- Universo: UN schema de tenant por ejecucion (el runbook lo usa por schema,
--   incluido un tenant no-ACTIVE antes de reactivarlo). Sin PII: solo conteos
--   y nombres de schema/tabla.
--
-- Umbral (informe): KEEP si peak < 50 k · ZONA GRIS 50 k-100 k (consultar al
-- orquestador) · SWITCH si peak >= 100 k.
--
-- Uso:
--   docker exec -i iwana_postgres_dev psql -U iwana_migrator -d dbiw ^
--     -v schema=tenant_secp1_a < scripts/sql/medicion-volumen-108.sql
--   (si no se pasa -v schema=..., se usa la constante por defecto mas abajo)
-- =============================================================================

\set ON_ERROR_STOP on

-- Schema objetivo: sustituir con `-v schema=...` o editar el default aqui.
\if :{?schema}
\else
  \set schema tenant_secp1_a
\endif

\echo
\echo '== Medicion de volumen v2 (metodo D-3) — schema:'
\echo :schema
\echo '=='

-- El bloque DO usa dollar-quotes, donde psql NO interpola variables; el schema
-- se pasa por un GUC de sesion (SET interpola :'schema').
SET iwana.medicion_schema = :'schema';

-- Tabla de trabajo con el detalle por celda (tabla x schema).
DROP TABLE IF EXISTS med_resultado;
CREATE TEMP TABLE med_resultado (
  tabla      text NOT NULL,
  reltuples  double precision NOT NULL,
  relpages   integer NOT NULL,
  filas      bigint NOT NULL,
  metodo     text NOT NULL -- 'analyze' | 'count'
);

DO $do$
DECLARE
  v_schema     text := current_setting('iwana.medicion_schema', true);
  v_tabla      text;
  v_antes      timestamptz;
  v_despues    timestamptz;
  v_reltuples  double precision;
  v_relpages   integer;
  v_filas      bigint;
  v_count_ex   boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_schema) THEN
    RAISE EXCEPTION 'Schema "%" no existe; verificar -v schema=...', v_schema;
  END IF;

  FOR v_tabla IN
    SELECT t.tabla FROM (VALUES ('users'), ('subscribers'), ('expediente_records')) AS t(tabla)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = v_schema AND c.relname = v_tabla AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'Tabla %.% no existe; se omite', v_schema, v_tabla;
      CONTINUE;
    END IF;

    SELECT s.last_analyze INTO v_antes
    FROM pg_stat_all_tables s
    WHERE s.schemaname = v_schema AND s.relname = v_tabla;

    EXECUTE format('ANALYZE %I.%I', v_schema, v_tabla);

    SELECT s.last_analyze INTO v_despues
    FROM pg_stat_all_tables s
    WHERE s.schemaname = v_schema AND s.relname = v_tabla;

    SELECT c.reltuples, c.relpages INTO v_reltuples, v_relpages
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = v_schema AND c.relname = v_tabla;

    -- Post-condicion del ANALYZE: si no refresco last_analyze, el ANALYZE fue
    -- denegado (WARNING silencioso) o no tuvo efecto. Igual que con
    -- reltuples < 0 o relpages = 0, la celda se resuelve con COUNT(*) exacto.
    v_count_ex :=
      v_despues IS NULL
      OR v_despues <= v_antes
      OR v_reltuples < 0
      OR v_relpages = 0;

    IF v_count_ex THEN
      EXECUTE format('SELECT count(*) FROM %I.%I', v_schema, v_tabla) INTO v_filas;
    ELSE
      v_filas := GREATEST(v_reltuples::bigint, 0);
    END IF;

    INSERT INTO med_resultado (tabla, reltuples, relpages, filas, metodo)
    VALUES (v_tabla, v_reltuples, v_relpages, v_filas,
            CASE WHEN v_count_ex THEN 'count' ELSE 'analyze' END);
  END LOOP;
END
$do$;

\echo
\echo '== Detalle por celda (conteos, nunca valores) =='
SELECT :'schema' AS schema, tabla, reltuples, relpages, filas, metodo
FROM med_resultado
ORDER BY tabla;

\echo
\echo '== Resumen =='
SELECT
  :'schema' AS schema,
  CASE
    WHEN peak >= 100000 THEN 'SWITCH'
    WHEN peak >= 50000  THEN 'ZONA GRIS'
    ELSE 'KEEP'
  END AS veredicto,
  peak AS peak_filas,
  total AS celdas,
  celdas_sobre_50k,
  celdas_pobladas_con_relpages_0,
  celdas_por_count_exacto
FROM (
  SELECT
    count(*) AS total,
    max(filas) AS peak,
    count(*) FILTER (WHERE filas >= 50000) AS celdas_sobre_50k,
    count(*) FILTER (WHERE filas > 0 AND relpages = 0) AS celdas_pobladas_con_relpages_0,
    count(*) FILTER (WHERE metodo = 'count') AS celdas_por_count_exacto
  FROM med_resultado
) s;

\echo
\echo 'Nota: si celdas_por_count_exacto = celdas, el ANALYZE fue denegado por'
\echo 'privilegio (o todas las celdas estaban vacias/sin analizar); el resultado'
\echo 'sigue siendo valido, solo mas costoso. No confundir con un fallo.'

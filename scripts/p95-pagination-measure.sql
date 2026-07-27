-- =============================================================================
-- p95-pagination-measure.sql — Medición de p95 para paginación numérica
-- =============================================================================
-- Propósito: Medir el p95 de cada consulta de listado paginado en un tenant con
-- volumen representativo. La medición alimenta dos decisiones:
--   1. randomAccess: true/false por recurso (directorio vs feed)
--   2. sortableFields: qué columnas ofrecen orden estable en <200ms p95
--
-- Estrategia: 50 ejecuciones por consulta (count, page_1, page_5), capturando
-- el tiempo de ejecución vía clock_timestamp(). El p95 se calcula sobre las 50
-- iteraciones de cada consulta.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- INSTRUCCIONES DE USO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Variables de conexión requeridas (entorno o .pgpass):
--   PGHOST      - Host de PostgreSQL
--   PGPORT      - Puerto (default: 5432)
--   PGDATABASE  - Nombre de la base de datos
--   PGUSER      - Usuario de PostgreSQL
--   PGPASSWORD  - Contraseña (o usar .pgpass)
--
-- Ejecución directa con psql:
--   psql -v tenant_schema='tenant_demo' -f scripts/p95-pagination-measure.sql
--
-- Ejecución con el wrapper PowerShell (recomendado):
--   .\scripts\run-p95-measure.ps1 -TenantSchema 'tenant_demo'
--
-- El wrapper lee las variables de entorno, las valida y ejecuta psql.
--
-- Salida esperada:
--   - NOTICE por cada recurso medido con su p95
--   - Tabla final _p95_measure_results con todas las mediciones
--   - Clasificación automática: <50ms directorio | <200ms aceptable |
--     200-500ms degradado | >500ms feed
--
-- ⚠️  Sin PII en resultados: solo tiempos y nombres de tablas.
-- ⚠️  Ejecutar en staging con dump anonimizado de volumen representativo.
-- =============================================================================

-- Tabla temporal para almacenar resultados de medición
DROP TABLE IF EXISTS _p95_measure_results;
CREATE TEMP TABLE _p95_measure_results (
  resource_name   text NOT NULL,
  order_offered   text NOT NULL,
  query_type      text NOT NULL, -- 'count' | 'page_1' | 'page_5'
  runtime_ms      numeric(10,3),
  created_at      timestamptz DEFAULT now()
);

-- =============================================================================
-- Función helper: mide un recurso con 50 iteraciones y almacena el p95
-- =============================================================================
CREATE OR REPLACE FUNCTION _p95_measure_one(
  p_resource      text,   -- Nombre lógico del recurso (ej: 'inventory_items')
  p_table         text,   -- Nombre real de la tabla (ej: 'inventory_items')
  p_order_clause  text,   -- ORDER BY (ej: 'created_at DESC, id DESC')
  p_query_type    text,   -- 'count' | 'page_1' | 'page_5'
  p_where         text DEFAULT NULL,  -- WHERE clause opcional
  p_limit         int DEFAULT 100     -- Límite de filas para page queries
) RETURNS void AS $$
DECLARE
  v_start   timestamptz;
  v_elapsed numeric;
  v_iter    integer;
  v_times   numeric[];
  v_p95     numeric;
  v_sql     text;
  v_offset  int;
BEGIN
  -- Verificar que la tabla existe en el schema actual
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema() AND tablename = p_table
  ) THEN
    RAISE NOTICE '[P95] SKIP: tabla %.% no existe', current_schema(), p_table;
    RETURN;
  END IF;

  -- Construir SQL según tipo de consulta
  IF p_query_type = 'count' THEN
    v_sql := format('SELECT count(*) FROM %I', p_table);
    IF p_where IS NOT NULL AND p_where <> '' THEN
      v_sql := v_sql || ' WHERE ' || p_where;
    END IF;
  ELSE
    -- page_1: offset 0; page_5: offset = (5-1) * limit = 400
    v_offset := CASE WHEN p_query_type = 'page_1' THEN 0 ELSE (p_limit * 4) END;
    v_sql := format('SELECT * FROM %I', p_table);
    IF p_where IS NOT NULL AND p_where <> '' THEN
      v_sql := v_sql || ' WHERE ' || p_where;
    END IF;
    v_sql := v_sql || ' ORDER BY ' || p_order_clause;
    v_sql := v_sql || format(' LIMIT %s OFFSET %s', p_limit, v_offset);
  END IF;

  -- 50 iteraciones
  v_times := ARRAY[]::numeric[];
  FOR v_iter IN 1..50 LOOP
    v_start := clock_timestamp();
    EXECUTE v_sql;
    v_elapsed := round(
      (EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000)::numeric, 3
    );
    v_times := array_append(v_times, v_elapsed);
  END LOOP;

  -- Calcular p95
  SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY t)
  INTO v_p95 FROM unnest(v_times) t;

  -- Almacenar resultado
  INSERT INTO _p95_measure_results (resource_name, order_offered, query_type, runtime_ms)
  VALUES (p_resource, p_order_clause, p_query_type, v_p95);

  RAISE NOTICE '[P95] % | % | % → p95 = % ms',
    p_resource, p_query_type, p_order_clause, round(v_p95, 1);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Bloque principal de medición
-- =============================================================================
DO $$
DECLARE
  v_schema text;
BEGIN
  -- Leer schema desde variable psql (-v tenant_schema='nombre')
  v_schema := :'tenant_schema';
  IF v_schema IS NULL OR v_schema = '' THEN
    RAISE EXCEPTION 'ERROR: variable tenant_schema requerida.'
      ' Uso: psql -v tenant_schema=''tenant_demo'' -f scripts/p95-pagination-measure.sql';
  END IF;

  EXECUTE format('SET LOCAL search_path TO %I', v_schema);
  RAISE NOTICE '[P95] ═══════════════════════════════════════════════════';
  RAISE NOTICE '[P95] Iniciando medición en schema: %', v_schema;
  RAISE NOTICE '[P95] Parámetros: limit=100, page_1 offset=0, page_5 offset=400, 50 iteraciones';
  RAISE NOTICE '[P95] ═══════════════════════════════════════════════════';

  -- =========================================================================
  -- GRUPO 1: Recursos con índice 089_pagination_ordering_indexes (16 tablas)
  -- =========================================================================

  -- 1. inventory_items
  PERFORM _p95_measure_one('inventory_items', 'inventory_items',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('inventory_items', 'inventory_items',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('inventory_items', 'inventory_items',
    'created_at DESC, id DESC', 'page_5');

  -- 2. stock_balances
  PERFORM _p95_measure_one('stock_balances', 'stock_balances',
    'updated_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('stock_balances', 'stock_balances',
    'updated_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('stock_balances', 'stock_balances',
    'updated_at DESC, id DESC', 'page_5');

  -- 3. serialized_assets
  PERFORM _p95_measure_one('serialized_assets', 'serialized_assets',
    'updated_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('serialized_assets', 'serialized_assets',
    'updated_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('serialized_assets', 'serialized_assets',
    'updated_at DESC, id DESC', 'page_5');

  -- 4. stock_locations
  PERFORM _p95_measure_one('stock_locations', 'stock_locations',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('stock_locations', 'stock_locations',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('stock_locations', 'stock_locations',
    'created_at DESC, id DESC', 'page_5');

  -- 5. purchase_requests
  PERFORM _p95_measure_one('purchase_requests', 'purchase_requests',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('purchase_requests', 'purchase_requests',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('purchase_requests', 'purchase_requests',
    'created_at DESC, id DESC', 'page_5');

  -- 6. subscribers — columna DB: created_at (no "createdAt")
  PERFORM _p95_measure_one('subscribers', 'subscribers',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('subscribers', 'subscribers',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('subscribers', 'subscribers',
    'created_at DESC, id DESC', 'page_5');

  -- 7. supplier_profiles
  PERFORM _p95_measure_one('supplier_profiles', 'supplier_profiles',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('supplier_profiles', 'supplier_profiles',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('supplier_profiles', 'supplier_profiles',
    'created_at DESC, id DESC', 'page_5');

  -- 8. inventory_write_offs
  PERFORM _p95_measure_one('inventory_write_offs', 'inventory_write_offs',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('inventory_write_offs', 'inventory_write_offs',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('inventory_write_offs', 'inventory_write_offs',
    'created_at DESC, id DESC', 'page_5');

  -- 9. asset_loan_assignments
  PERFORM _p95_measure_one('asset_loan_assignments', 'asset_loan_assignments',
    'installed_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('asset_loan_assignments', 'asset_loan_assignments',
    'installed_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('asset_loan_assignments', 'asset_loan_assignments',
    'installed_at DESC, id DESC', 'page_5');

  -- 10. catalog_items (RECENTLY_UPDATED — con soft-delete)
  PERFORM _p95_measure_one('catalog_items (RECENTLY_UPDATED)', 'catalog_items',
    'updated_at DESC, id DESC', 'count', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('catalog_items (RECENTLY_UPDATED)', 'catalog_items',
    'updated_at DESC, id DESC', 'page_1', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('catalog_items (RECENTLY_UPDATED)', 'catalog_items',
    'updated_at DESC, id DESC', 'page_5', 'deleted_at IS NULL');

  -- 11. catalog_items (ACTIVE_NAME — con soft-delete)
  PERFORM _p95_measure_one('catalog_items (ACTIVE_NAME)', 'catalog_items',
    'is_active DESC, name ASC, id ASC', 'count', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('catalog_items (ACTIVE_NAME)', 'catalog_items',
    'is_active DESC, name ASC, id ASC', 'page_1', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('catalog_items (ACTIVE_NAME)', 'catalog_items',
    'is_active DESC, name ASC, id ASC', 'page_5', 'deleted_at IS NULL');

  -- 12. audit_logs (alto volumen esperado)
  PERFORM _p95_measure_one('audit_logs', 'audit_logs',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('audit_logs', 'audit_logs',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('audit_logs', 'audit_logs',
    'created_at DESC, id DESC', 'page_5');

  -- 13. stock_issues
  PERFORM _p95_measure_one('stock_issues', 'stock_issues',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('stock_issues', 'stock_issues',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('stock_issues', 'stock_issues',
    'created_at DESC, id DESC', 'page_5');

  -- 14. stock_counts
  PERFORM _p95_measure_one('stock_counts', 'stock_counts',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('stock_counts', 'stock_counts',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('stock_counts', 'stock_counts',
    'created_at DESC, id DESC', 'page_5');

  -- 15. visit_requests — orden cronológico (feed candidate)
  PERFORM _p95_measure_one('visit_requests', 'visit_requests',
    'created_at DESC, id ASC', 'count');
  PERFORM _p95_measure_one('visit_requests', 'visit_requests',
    'created_at DESC, id ASC', 'page_1');
  PERFORM _p95_measure_one('visit_requests', 'visit_requests',
    'created_at DESC, id ASC', 'page_5');

  -- 16. support_tickets
  PERFORM _p95_measure_one('support_tickets', 'support_tickets',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('support_tickets', 'support_tickets',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('support_tickets', 'support_tickets',
    'created_at DESC, id DESC', 'page_5');

  -- 17. stock_movements (alto volumen esperado — kárdex)
  PERFORM _p95_measure_one('stock_movements', 'stock_movements',
    'created_at DESC, movement_number DESC', 'count');
  PERFORM _p95_measure_one('stock_movements', 'stock_movements',
    'created_at DESC, movement_number DESC', 'page_1');
  PERFORM _p95_measure_one('stock_movements', 'stock_movements',
    'created_at DESC, movement_number DESC', 'page_5');

  -- =========================================================================
  -- GRUPO 2: Recursos sin índice 089 (8 tablas)
  -- =========================================================================

  -- 18. expediente_records — CRM: expedientes
  PERFORM _p95_measure_one('expediente_records', 'expediente_records',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('expediente_records', 'expediente_records',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('expediente_records', 'expediente_records',
    'created_at DESC, id DESC', 'page_5');

  -- 19. parties — con soft-delete (deleted_at IS NULL)
  PERFORM _p95_measure_one('parties', 'parties',
    'created_at DESC, id DESC', 'count', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('parties', 'parties',
    'created_at DESC, id DESC', 'page_1', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('parties', 'parties',
    'created_at DESC, id DESC', 'page_5', 'deleted_at IS NULL');

  -- 20. operational_tasks — tareas operativas
  PERFORM _p95_measure_one('operational_tasks', 'operational_tasks',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('operational_tasks', 'operational_tasks',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('operational_tasks', 'operational_tasks',
    'created_at DESC, id DESC', 'page_5');

  -- 21. contracts — CRM: contratos
  PERFORM _p95_measure_one('contracts', 'contracts',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('contracts', 'contracts',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('contracts', 'contracts',
    'created_at DESC, id DESC', 'page_5');

  -- 22. quotes — CRM: cotizaciones
  PERFORM _p95_measure_one('quotes', 'quotes',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('quotes', 'quotes',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('quotes', 'quotes',
    'created_at DESC, id DESC', 'page_5');

  -- 23. opportunities — CRM: oportunidades
  PERFORM _p95_measure_one('opportunities', 'opportunities',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('opportunities', 'opportunities',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('opportunities', 'opportunities',
    'created_at DESC, id DESC', 'page_5');

  -- 24. potential_leads — CRM: leads / potenciales
  PERFORM _p95_measure_one('potential_leads', 'potential_leads',
    'created_at DESC, id DESC', 'count');
  PERFORM _p95_measure_one('potential_leads', 'potential_leads',
    'created_at DESC, id DESC', 'page_1');
  PERFORM _p95_measure_one('potential_leads', 'potential_leads',
    'created_at DESC, id DESC', 'page_5');

  -- 25. work_orders — WFM: órdenes de trabajo (con soft-delete)
  PERFORM _p95_measure_one('work_orders', 'work_orders',
    'created_at DESC, id DESC', 'count', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('work_orders', 'work_orders',
    'created_at DESC, id DESC', 'page_1', 'deleted_at IS NULL');
  PERFORM _p95_measure_one('work_orders', 'work_orders',
    'created_at DESC, id DESC', 'page_5', 'deleted_at IS NULL');

  RAISE NOTICE '[P95] ═══════════════════════════════════════════════════';
  RAISE NOTICE '[P95] Medición completada. Resultados en _p95_measure_results';
  RAISE NOTICE '[P95] ═══════════════════════════════════════════════════';
END $$;

-- =============================================================================
-- Reporte final: detalle por recurso con clasificación automática
-- =============================================================================
SELECT
  resource_name AS "Recurso",
  order_offered AS "Orden ofrecido",
  query_type AS "Tipo consulta",
  runtime_ms AS "p95 (ms)",
  CASE
    WHEN runtime_ms < 50   THEN 'directorio (<50ms)'
    WHEN runtime_ms < 200  THEN 'aceptable (<200ms)'
    WHEN runtime_ms < 500  THEN 'degradado (200-500ms)'
    ELSE                        'feed (>500ms)'
  END AS "Clasificación"
FROM _p95_measure_results
ORDER BY resource_name, query_type;

-- =============================================================================
-- Resumen agregado: p95 global sobre todas las mediciones
-- =============================================================================
SELECT
  'TOTAL' AS "Recurso",
  '' AS "Orden ofrecido",
  '' AS "Tipo consulta",
  percentile_cont(0.95) WITHIN GROUP (ORDER BY runtime_ms) AS "p95 global (ms)"
FROM _p95_measure_results;

-- =============================================================================
-- Resumen por tipo de consulta (count, page_1, page_5)
-- =============================================================================
SELECT
  query_type AS "Tipo consulta",
  count(*) AS "Mediciones",
  round(min(runtime_ms), 1) AS "Min (ms)",
  round(percentile_cont(0.50) WITHIN GROUP (ORDER BY runtime_ms), 1) AS "p50 (ms)",
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY runtime_ms), 1) AS "p95 (ms)",
  round(max(runtime_ms), 1) AS "Max (ms)"
FROM _p95_measure_results
GROUP BY query_type
ORDER BY query_type;

-- =============================================================================
-- Clasificación agregada: cuántos recursos caen en cada categoría
-- =============================================================================
SELECT
  CASE
    WHEN runtime_ms < 50   THEN 'directorio (<50ms)'
    WHEN runtime_ms < 200  THEN 'aceptable (<200ms)'
    WHEN runtime_ms < 500  THEN 'degradado (200-500ms)'
    ELSE                        'feed (>500ms)'
  END AS "Clasificación",
  count(*) AS "Consultas"
FROM _p95_measure_results
GROUP BY 1
ORDER BY
  CASE
    WHEN MIN(runtime_ms) < 50   THEN 1
    WHEN MIN(runtime_ms) < 200  THEN 2
    WHEN MIN(runtime_ms) < 500  THEN 3
    ELSE                             4
  END;

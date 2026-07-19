-- EV-1: verificar migración 072 en schema tenant (sin PII).
-- Flujo: baseline → re-ejecutar UP ×2 (idempotencia) → DOWN → UP → comparar baseline.

SET search_path TO tenant_iwana;

\echo '=== EV1 baseline ==='
SELECT COUNT(*) AS bal_total,
       COUNT(*) FILTER (WHERE quantity_reserved > 0) AS bal_with_reserved,
       COALESCE(SUM(quantity_reserved), 0) AS sum_reserved
FROM stock_balances;

CREATE TEMP TABLE ev1_reserved_before AS
SELECT id, quantity_on_hand, quantity_reserved FROM stock_balances;

\echo '=== EV1 re-ejecutar UP #1 ==='
DO $$
DECLARE
  capped_count integer;
BEGIN
  WITH calculated AS (
    SELECT
      sil.tenant_id,
      sil.item_id,
      si.source_location_id AS location_id,
      sil.lot_id,
      sil.condition,
      COALESCE(SUM(sil.requested_qty), 0)::numeric(12,2) AS reserved_qty
    FROM stock_issue_lines sil
    INNER JOIN stock_issues si
      ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
    GROUP BY sil.tenant_id, sil.item_id, si.source_location_id, sil.lot_id, sil.condition
  ),
  updated AS (
    UPDATE stock_balances sb
    SET quantity_reserved = LEAST(sb.quantity_on_hand, COALESCE(c.reserved_qty, 0))
    FROM calculated c
    WHERE sb.tenant_id = c.tenant_id
      AND sb.item_id = c.item_id
      AND sb.location_id = c.location_id
      AND sb.condition = c.condition
      AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
    RETURNING sb.id, sb.quantity_on_hand, c.reserved_qty AS calculated_reserved
  )
  SELECT COUNT(*)::integer INTO capped_count FROM updated WHERE calculated_reserved > quantity_on_hand;

  UPDATE stock_balances sb
  SET quantity_reserved = 0
  WHERE NOT EXISTS (
    SELECT 1
    FROM stock_issue_lines sil
    INNER JOIN stock_issues si ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
      AND sil.tenant_id = sb.tenant_id
      AND sil.item_id = sb.item_id
      AND si.source_location_id = sb.location_id
      AND sil.condition = sb.condition
      AND sil.lot_id IS NOT DISTINCT FROM sb.lot_id
  );
END $$;

\echo '=== EV1 re-ejecutar UP #2 (idempotencia) ==='
DO $$
DECLARE
  capped_count integer;
BEGIN
  WITH calculated AS (
    SELECT
      sil.tenant_id,
      sil.item_id,
      si.source_location_id AS location_id,
      sil.lot_id,
      sil.condition,
      COALESCE(SUM(sil.requested_qty), 0)::numeric(12,2) AS reserved_qty
    FROM stock_issue_lines sil
    INNER JOIN stock_issues si
      ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
    GROUP BY sil.tenant_id, sil.item_id, si.source_location_id, sil.lot_id, sil.condition
  ),
  updated AS (
    UPDATE stock_balances sb
    SET quantity_reserved = LEAST(sb.quantity_on_hand, COALESCE(c.reserved_qty, 0))
    FROM calculated c
    WHERE sb.tenant_id = c.tenant_id
      AND sb.item_id = c.item_id
      AND sb.location_id = c.location_id
      AND sb.condition = c.condition
      AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
    RETURNING sb.id
  )
  SELECT COUNT(*)::integer INTO capped_count FROM updated;

  UPDATE stock_balances sb
  SET quantity_reserved = 0
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_issue_lines sil
    INNER JOIN stock_issues si ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
      AND sil.tenant_id = sb.tenant_id AND sil.item_id = sb.item_id
      AND si.source_location_id = sb.location_id AND sil.condition = sb.condition
      AND sil.lot_id IS NOT DISTINCT FROM sb.lot_id
  );
END $$;

SELECT COUNT(*) AS drift_after_double_up
FROM stock_balances sb
JOIN ev1_reserved_before b ON b.id = sb.id
WHERE sb.quantity_reserved IS DISTINCT FROM b.quantity_reserved;

\echo '=== EV1 DOWN ==='
UPDATE stock_balances SET quantity_reserved = 0;
SELECT COUNT(*) FILTER (WHERE quantity_reserved <> 0) AS remaining_after_down FROM stock_balances;

\echo '=== EV1 re-aplicar UP post-down ==='
DO $$
DECLARE capped_count integer;
BEGIN
  WITH calculated AS (
    SELECT sil.tenant_id, sil.item_id, si.source_location_id AS location_id, sil.lot_id, sil.condition,
           COALESCE(SUM(sil.requested_qty), 0)::numeric(12,2) AS reserved_qty
    FROM stock_issue_lines sil
    INNER JOIN stock_issues si ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
    GROUP BY sil.tenant_id, sil.item_id, si.source_location_id, sil.lot_id, sil.condition
  ),
  updated AS (
    UPDATE stock_balances sb
    SET quantity_reserved = LEAST(sb.quantity_on_hand, COALESCE(c.reserved_qty, 0))
    FROM calculated c
    WHERE sb.tenant_id = c.tenant_id AND sb.item_id = c.item_id
      AND sb.location_id = c.location_id AND sb.condition = c.condition
      AND sb.lot_id IS NOT DISTINCT FROM c.lot_id
    RETURNING sb.id
  )
  SELECT COUNT(*)::integer INTO capped_count FROM updated;

  UPDATE stock_balances sb SET quantity_reserved = 0
  WHERE NOT EXISTS (
    SELECT 1 FROM stock_issue_lines sil
    INNER JOIN stock_issues si ON si.id = sil.issue_id AND si.tenant_id = sil.tenant_id
    WHERE si.status NOT IN ('DISPATCHED', 'RECEIVED', 'CANCELLED')
      AND sil.tenant_id = sb.tenant_id AND sil.item_id = sb.item_id
      AND si.source_location_id = sb.location_id AND sil.condition = sb.condition
      AND sil.lot_id IS NOT DISTINCT FROM sb.lot_id
  );
END $$;

SELECT COUNT(*) AS mismatches_vs_baseline
FROM stock_balances sb
JOIN ev1_reserved_before b ON b.id = sb.id
WHERE sb.quantity_reserved IS DISTINCT FROM b.quantity_reserved;

SELECT 'EV1_MIG_OK' AS status;

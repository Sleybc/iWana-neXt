-- Reconciliación de la espejo issue_status (MOD12 S2.1 · B1/B2).
--
-- Contexto: stock_issue_line_serials.issue_status replica el estado de la
-- cabecera stock_issues para habilitar el índice único parcial
-- uq_stock_issue_line_serials_active_asset (PostgreSQL no admite predicados
-- inter-tabla). La aplicación la sincroniza en la misma transacción
-- (syncSerialMirrorStatus en despacho/cancelación; reinsert con estado actual
-- en update). Este script es la red del operador: detecta divergencias y las
-- repara. Solo lectura salvo el UPDATE final, que va comentado por defecto.
--
-- Uso: psql conectado al schema del tenant (search_path fijado por sesión):
--   SET search_path TO tenant_xxx;
--   \i docs/quality/2026-09-06-mod12-s2.1-espejo-reconciliacion.sql
--
-- 1) Detección: filas hijas con espejo divergente de su cabecera (esperado: 0).
SELECT s.id AS hija_id,
       s.tenant_id,
       s.issue_id,
       s.issue_status AS espejo,
       i.status AS cabecera
FROM stock_issue_line_serials s
JOIN stock_issues i ON i.id = s.issue_id
WHERE s.issue_status <> i.status
ORDER BY s.issue_id, s.line_id;

-- 2) Cobertura: líneas con singular sin réplica en la hija (esperado: 0).
SELECT l.id AS linea_id,
       l.tenant_id,
       l.issue_id,
       l.serialized_asset_id
FROM stock_issue_lines l
JOIN stock_issues i ON i.id = l.issue_id
WHERE l.serialized_asset_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM stock_issue_line_serials s
    WHERE s.line_id = l.id AND s.serialized_asset_id = l.serialized_asset_id
  )
ORDER BY l.issue_id, l.id;

-- 3) Reparación (descomentar para aplicar): alinea la espejo con la cabecera.
-- UPDATE stock_issue_line_serials s
-- SET issue_status = i.status, updated_at = NOW()
-- FROM stock_issues i
-- WHERE i.id = s.issue_id
--   AND s.issue_status <> i.status;

-- Diagnóstico de coherencia del maestro itemKind ↔ trackingMode
-- (MOD12 Fase S2 · Track A, entregable A4).
--
-- Contexto: `item_kind` y `tracking_mode` son columnas independientes de
-- `inventory_items`. `item_kind` solo alimenta el segmento del SKU compuesto
-- ('SER' para SERIALIZED); `tracking_mode` gobierna todo el comportamiento
-- (recepción, salida, ajustes y el selector de serial). Hasta la Fase S2 nada
-- impedía guardar la contradicción: un producto podía anunciarse "Con serial"
-- y ser tratado como consumible. La validación cruzada A1
-- (`refineInventoryItemMaster`) ya la rechaza en alta y edición.
--
-- Para qué sirve este script: A1 valida el documento completo en cada edición,
-- así que un ítem que YA está en el estado contradictorio queda bloqueado para
-- cualquier cambio hasta corregir la pareja. Antes de activar la regla en un
-- tenant con catálogo real hay que saber a cuántos productos afecta. Esa es la
-- pregunta que responde la consulta 1.
--
-- Solo lectura. La corrección NO se automatiza: reclasificar cambia cómo se
-- despacha el producto y exige decidir con el inventario físico delante
-- (ver la nota de decisión al final).
--
-- Uso: psql conectado al schema del tenant (search_path fijado por sesión):
--   SET search_path TO tenant_xxx;
--   \i docs/quality/2026-09-05-mod12-s2-a4-diagnostico-coherencia-maestro.sql

-- 1) Ítems con la pareja contradictoria, en ambos sentidos (esperado: 0).
--    Sentido A: "Con serial" con control consumible — el caso que originó S2.
--    Sentido B: control serializado o activo fijo sin tipo "Con serial".
SELECT i.id,
       i.sku,
       i.name,
       i.item_kind,
       i.tracking_mode,
       i.asset_controlled,
       i.status,
       CASE
         WHEN i.item_kind = 'SERIALIZED' AND i.tracking_mode = 'CONSUMABLE'
           THEN 'A: tipo Con serial con control Consumible'
         ELSE 'B: control serializado sin tipo Con serial'
       END AS sentido
FROM inventory_items i
WHERE (i.item_kind = 'SERIALIZED' AND i.tracking_mode = 'CONSUMABLE')
   OR (i.tracking_mode IN ('SERIALIZED', 'FIXED_ASSET') AND i.item_kind <> 'SERIALIZED')
ORDER BY i.sku;

-- 2) Impacto de la corrección: saldo y activos de cada ítem contradictorio.
--    Determina la vía de regularización. Un ítem con saldo > 0 NO puede
--    cambiar de control de material directamente: A3
--    (`assertTrackingModeChangeAllowed`) lo rechaza, por diseño.
SELECT i.sku,
       i.name,
       i.item_kind,
       i.tracking_mode,
       COALESCE(SUM(b.quantity_on_hand), 0) AS saldo_total,
       COALESCE(SUM(b.quantity_reserved), 0) AS reservado_total,
       (SELECT COUNT(*) FROM serialized_assets a WHERE a.inventory_item_id = i.id) AS activos
FROM inventory_items i
LEFT JOIN stock_balances b ON b.item_id = i.id
WHERE (i.item_kind = 'SERIALIZED' AND i.tracking_mode = 'CONSUMABLE')
   OR (i.tracking_mode IN ('SERIALIZED', 'FIXED_ASSET') AND i.item_kind <> 'SERIALIZED')
GROUP BY i.id, i.sku, i.name, i.item_kind, i.tracking_mode
ORDER BY saldo_total DESC, i.sku;

-- 3) Vía de corrección según el resultado de (2) — decisión del operador,
--    nunca automática:
--
--    a) saldo_total = 0 y activos = 0
--       Corregir la pareja desde el maestro (portal → Catálogo → editar). La
--       guía proactiva A2 ajusta el campo contrario en el mismo cambio.
--
--    b) saldo_total > 0 y el producto SÍ se rastrea por serial en la operación
--       El saldo entró como consumible, así que no existen los seriales.
--       Regularizar: dar salida o ajuste negativo del saldo actual, corregir la
--       pareja en el maestro, y volver a dar entrada capturando el serial real
--       de cada unidad. Sin los seriales físicos a la vista, el producto queda
--       indespachable: la validación exigirá seriales que no existen.
--
--    c) saldo_total > 0 y el producto NO se rastrea por serial en la operación
--       El control consumible es el correcto y quien miente es el tipo de
--       producto. Cambiar `item_kind` a STOCK o CONSUMABLE desde el maestro.
--       El SKU ya emitido conserva su segmento 'SER': no se regenera (el
--       generador solo corre en el alta), y reemitirlo cambiaría un
--       identificador ya impreso en etiquetas. Queda como desalineación
--       cosmética conocida.

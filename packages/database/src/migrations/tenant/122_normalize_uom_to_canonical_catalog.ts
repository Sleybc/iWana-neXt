import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 122 — Normalización de unidades de medida al catálogo canónico (F5a, ADR-085 D4).
 *
 * Mapea los valores legacy de `inventory_items.unit_of_measure` y
 * `inventory_items.purchase_unit_of_measure` a los códigos canónicos por
 * equivalencia EXACTA (mapa del prompt F5a §3.3 + ADR-085 D4):
 *
 *   'unidad', 'UND', 'und', 'UNIDAD' → UNIT
 *   'metro', 'm', 'M', 'METRO'       → METER
 *   'caja', 'CAJA'                   → BOX
 *
 * Los códigos ya canónicos ('UNIT', 'METER', 'BOX') se aceptan por identidad
 * para que la migración sea idempotente; la identidad no es normalización
 * difusa: sigue siendo comparación por igualdad exacta.
 *
 * Reglas que esta migración honra:
 * - Prohibida la normalización difusa: sin LOWER(), sin TRIM(), sin similitud,
 *   sin heurísticas. La comparación es `=` / `IN` sobre el literal tal cual.
 * - Todo valor fuera del conjunto cerrado DETIENE la migración con RAISE,
 *   reportando valor, conteo y schema. La transacción del runner hace rollback,
 *   así que el tenant queda intacto y los demás tenants no se bloquean
 *   (el runner continúa por tenant y resume los fallos al final).
 * - NO recalcula saldos ni movimientos históricos (D4, Regla 6): solo toca las
 *   dos columnas de unidad de `inventory_items`. No escribe
 *   `purchase_to_base_uom_factor` (eso es F5b) ni `stock_movements` /
 *   `stock_balances`.
 * - Aditiva y reversible: `up` solo añade la tabla de provenance
 *   `uom_normalization_122_provenance` y actualiza literales; `down` restaura
 *   los literales previos exactos desde provenance y elimina la tabla.
 * - Corre por tenant sobre `search_path` (patrón 120/121): valida
 *   `current_schema()` y el tenant canónico en `public.tenants`.
 */
export class NormalizeUomToCanonicalCatalog12200000000000 implements MigrationInterface {
  name = 'NormalizeUomToCanonicalCatalog12200000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS uom_normalization_122_provenance (
        item_id                          UUID NOT NULL,
        tenant_id                        UUID NOT NULL,
        previous_unit_of_measure         VARCHAR(32) NOT NULL,
        previous_purchase_unit_of_measure VARCHAR(32),
        CONSTRAINT pk_uom_normalization_122_provenance PRIMARY KEY (item_id)
      )
    `);

    await queryRunner.query(`
      DO $migration$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
        tenant_count        INTEGER;
        offending_value     TEXT;
        offending_count     INTEGER;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 122 solo puede ejecutarse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);

        SELECT COUNT(*) INTO tenant_count FROM public.tenants WHERE schema_name = tenant_schema;
        IF tenant_count <> 1 THEN
          RAISE EXCEPTION 'Se esperaba exactamente un tenant canónico para el schema %, encontrados: %', tenant_schema, tenant_count;
        END IF;

        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        -- Parada 1: unidad base sin equivalencia exacta (CA-F5A-03).
        SELECT u.unit_of_measure, COUNT(*) INTO offending_value, offending_count
        FROM inventory_items AS u
        WHERE u.tenant_id = canonical_tenant_id
          AND u.unit_of_measure NOT IN (
            'unidad', 'UND', 'und', 'UNIDAD',
            'metro', 'm', 'M', 'METRO',
            'caja', 'CAJA',
            'UNIT', 'METER', 'BOX'
          )
        GROUP BY u.unit_of_measure
        ORDER BY COUNT(*) DESC
        LIMIT 1;

        IF FOUND THEN
          RAISE EXCEPTION 'La migración 122 se detiene: unit_of_measure sin equivalencia exacta en el catálogo canónico. Valor: "%". Artículos: %. Schema: %. Requiere decisión humana (ADR-085 D4).', offending_value, offending_count, tenant_schema;
        END IF;

        -- Parada 2: unidad de compra sin equivalencia exacta. NULL = sin
        -- unidad de compra: no participa.
        SELECT u.purchase_unit_of_measure, COUNT(*) INTO offending_value, offending_count
        FROM inventory_items AS u
        WHERE u.tenant_id = canonical_tenant_id
          AND u.purchase_unit_of_measure IS NOT NULL
          AND u.purchase_unit_of_measure NOT IN (
            'unidad', 'UND', 'und', 'UNIDAD',
            'metro', 'm', 'M', 'METRO',
            'caja', 'CAJA',
            'UNIT', 'METER', 'BOX'
          )
        GROUP BY u.purchase_unit_of_measure
        ORDER BY COUNT(*) DESC
        LIMIT 1;

        IF FOUND THEN
          RAISE EXCEPTION 'La migración 122 se detiene: purchase_unit_of_measure sin equivalencia exacta en el catálogo canónico. Valor: "%". Artículos: %. Schema: %. Requiere decisión humana (ADR-085 D4).', offending_value, offending_count, tenant_schema;
        END IF;

        -- Provenance de las filas que cambian: permite un down() sin pérdida
        -- (CA-F5A-05). Las filas ya canónicas no se registran.
        INSERT INTO uom_normalization_122_provenance (
          item_id, tenant_id, previous_unit_of_measure, previous_purchase_unit_of_measure
        )
        SELECT id, tenant_id, unit_of_measure, purchase_unit_of_measure
        FROM inventory_items
        WHERE tenant_id = canonical_tenant_id
          AND (
            unit_of_measure IN (
              'unidad', 'UND', 'und', 'UNIDAD',
              'metro', 'm', 'M', 'METRO',
              'caja', 'CAJA'
            )
            OR (
              purchase_unit_of_measure IS NOT NULL
              AND purchase_unit_of_measure IN (
                'unidad', 'UND', 'und', 'UNIDAD',
                'metro', 'm', 'M', 'METRO',
                'caja', 'CAJA'
              )
            )
          )
        ON CONFLICT (item_id) DO NOTHING;

        -- Normalización por igualdad exacta (CASE/WHEN simple, sin funciones).
        UPDATE inventory_items
        SET unit_of_measure = CASE unit_of_measure
            WHEN 'unidad' THEN 'UNIT'
            WHEN 'UND' THEN 'UNIT'
            WHEN 'und' THEN 'UNIT'
            WHEN 'UNIDAD' THEN 'UNIT'
            WHEN 'metro' THEN 'METER'
            WHEN 'm' THEN 'METER'
            WHEN 'M' THEN 'METER'
            WHEN 'METRO' THEN 'METER'
            WHEN 'caja' THEN 'BOX'
            WHEN 'CAJA' THEN 'BOX'
            ELSE unit_of_measure
          END,
          purchase_unit_of_measure = CASE purchase_unit_of_measure
            WHEN 'unidad' THEN 'UNIT'
            WHEN 'UND' THEN 'UNIT'
            WHEN 'und' THEN 'UNIT'
            WHEN 'UNIDAD' THEN 'UNIT'
            WHEN 'metro' THEN 'METER'
            WHEN 'm' THEN 'METER'
            WHEN 'M' THEN 'METER'
            WHEN 'METRO' THEN 'METER'
            WHEN 'caja' THEN 'BOX'
            WHEN 'CAJA' THEN 'BOX'
            ELSE purchase_unit_of_measure
          END
        WHERE tenant_id = canonical_tenant_id;
      END
      $migration$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $rollback$
      DECLARE
        tenant_schema       TEXT := current_schema();
        canonical_tenant_id UUID;
      BEGIN
        IF tenant_schema IS NULL OR tenant_schema !~ '^tenant_[a-z][a-z0-9_]{0,54}$' THEN
          RAISE EXCEPTION 'La migración 122 solo puede revertirse sobre un schema tenant válido; schema actual: %', tenant_schema;
        END IF;

        PERFORM set_config('search_path', quote_ident(tenant_schema), true);
        SELECT id INTO canonical_tenant_id FROM public.tenants WHERE schema_name = tenant_schema;

        IF to_regclass('uom_normalization_122_provenance') IS NOT NULL THEN
          UPDATE inventory_items AS item
          SET unit_of_measure = p.previous_unit_of_measure,
              purchase_unit_of_measure = p.previous_purchase_unit_of_measure
          FROM uom_normalization_122_provenance AS p
          WHERE item.id = p.item_id
            AND item.tenant_id = canonical_tenant_id
            AND p.tenant_id = canonical_tenant_id;

          DELETE FROM uom_normalization_122_provenance WHERE tenant_id = canonical_tenant_id;
        END IF;
      END
      $rollback$
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS uom_normalization_122_provenance`);
  }
}

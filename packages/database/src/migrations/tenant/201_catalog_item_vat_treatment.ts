import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/** Mismo patrón que `CATALOG_ITEM_VAT_LEGAL_BASIS_PATTERN` de @iwana/shared. */
const LEGAL_BASIS_PATTERN = '^[A-Z0-9][A-Z0-9_.-]{1,39}$';

/** Instante ISO-8601 en UTC con milisegundos, como `Date.prototype.toISOString()`. */
const ISO_NOW = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** El titular anonimizado deja sus filas de CRM en solo lectura (trigger de la 169/178). */
const NOT_ANONYMIZED = `NOT EXISTS (
  SELECT 1 FROM subscribers s
   WHERE s.id = c.subscriber_id
     AND (s.anonymized_at IS NOT NULL OR s.anonymized_request_id IS NOT NULL))`;

/**
 * Migración 201 — IVA por ítem del catálogo (spec MOD14 2026-11-12 «IVA por concepto y
 * cortesías», D1, D2, R1, R2).
 *
 * - `catalog_items.vat_treatment` y `vat_legal_basis`: tratamiento de productos y servicios
 *   (`STANDARD` 19 %, `EXEMPT`, `EXCLUDED`) y su base legal como código (sin texto libre). Un
 *   plan los deja en NULL: su internet sigue la regla del estrato (ADR-093). Un producto o
 *   servicio con NULL se cobra a STANDARD 19 % (D2); los existentes se rellenan con STANDARD y
 *   `ET_468`.
 * - `plan_details.installation_vat_treatment` e `installation_vat_legal_basis`: tratamiento propio
 *   del cargo de instalación del plan (el valor vive en `catalog_price_history.installation_fee`);
 *   por defecto STANDARD y `ET_468`. Sustituye a D-F1 (la instalación copiaba el IVA del internet).
 * - `contracts.installation_vat_snapshot` y `additional_vat_snapshot`: el contrato congela el
 *   tratamiento de la instalación y de cada adicional, como congela `installation_fee`.
 *   Relleno: instalación de los contratos con cargo congelado desde el plan; adicionales desde su
 *   ítem (o STANDARD si el identificador no está en el catálogo), con `source = 'BACKFILL'`. Los
 *   contratos de titulares anonimizados no se tocan (solo lectura); el cobro aplica STANDARD.
 *
 * `down()` retira columnas y restricciones. Si algún contrato tiene tratamiento congelado o algún
 * ítem tiene un tratamiento distinto de STANDARD/ET_468 lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: lo congelado no se reconstruye.
 */
export class CatalogItemVatTreatment2010000000201 implements MigrationInterface {
  name = 'CatalogItemVatTreatment2010000000201';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE catalog_items
        ADD COLUMN vat_treatment varchar(10) NULL,
        ADD COLUMN vat_legal_basis varchar(40) NULL
    `);
    await queryRunner.query(`
      UPDATE catalog_items
         SET vat_treatment = 'STANDARD', vat_legal_basis = 'ET_468'
       WHERE type <> 'PLAN'
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_items
        ADD CONSTRAINT chk_catalog_items_vat_treatment
          CHECK (vat_treatment IS NULL OR vat_treatment IN ('STANDARD', 'EXEMPT', 'EXCLUDED')),
        ADD CONSTRAINT chk_catalog_items_vat_legal_basis
          CHECK (vat_legal_basis IS NULL OR vat_legal_basis ~ '${LEGAL_BASIS_PATTERN}'),
        ADD CONSTRAINT chk_catalog_items_vat_pair
          CHECK ((vat_treatment IS NULL) = (vat_legal_basis IS NULL)),
        ADD CONSTRAINT chk_catalog_items_plan_vat
          CHECK (type <> 'PLAN' OR vat_treatment IS NULL)
    `);

    await queryRunner.query(`
      ALTER TABLE plan_details
        ADD COLUMN installation_vat_treatment varchar(10) NOT NULL DEFAULT 'STANDARD'
          CONSTRAINT chk_plan_details_installation_vat_treatment
          CHECK (installation_vat_treatment IN ('STANDARD', 'EXEMPT', 'EXCLUDED')),
        ADD COLUMN installation_vat_legal_basis varchar(40) NOT NULL DEFAULT 'ET_468'
          CONSTRAINT chk_plan_details_installation_vat_legal_basis
          CHECK (installation_vat_legal_basis ~ '${LEGAL_BASIS_PATTERN}')
    `);

    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN installation_vat_snapshot jsonb NULL,
        ADD COLUMN additional_vat_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD CONSTRAINT chk_contracts_installation_vat_snapshot
          CHECK (installation_vat_snapshot IS NULL
                 OR jsonb_typeof(installation_vat_snapshot) = 'object'),
        ADD CONSTRAINT chk_contracts_additional_vat_snapshot
          CHECK (jsonb_typeof(additional_vat_snapshot) = 'array')
    `);

    const installation = (await queryRunner.query(`
      WITH updated AS (
        UPDATE contracts c
           SET installation_vat_snapshot = jsonb_build_object(
                 'treatment', COALESCE(pd.installation_vat_treatment, 'STANDARD'),
                 'legalBasis', COALESCE(pd.installation_vat_legal_basis, 'ET_468'),
                 'ratePercent',
                   CASE WHEN COALESCE(pd.installation_vat_treatment, 'STANDARD') = 'STANDARD'
                        THEN 19 ELSE 0 END,
                 'source', 'BACKFILL',
                 'frozenAt', ${ISO_NOW})
          FROM contracts c0
          LEFT JOIN plan_details pd ON pd.item_id::text = c0.plan_id
         WHERE c0.id = c.id
           AND c.installation_fee IS NOT NULL
           AND c.installation_vat_snapshot IS NULL
           AND ${NOT_ANONYMIZED}
        RETURNING c.id
      ) SELECT COUNT(*)::int AS total FROM updated
    `)) as Array<{ total: number }>;

    const additionals = (await queryRunner.query(`
      WITH entries AS (
        SELECT DISTINCT c.id AS contract_id, e.item_type, e.item_id
          FROM contracts c
          CROSS JOIN LATERAL (
            SELECT 'PRODUCT' AS item_type, left(p.value, 120) AS item_id
              FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(c.additional_product_ids) = 'array'
                          THEN c.additional_product_ids ELSE '[]'::jsonb END) AS p(value)
            UNION ALL
            SELECT 'SERVICE', left(s.value, 120)
              FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(c.additional_service_ids) = 'array'
                          THEN c.additional_service_ids ELSE '[]'::jsonb END) AS s(value)
          ) e
         WHERE length(e.item_id) > 0
           AND ${NOT_ANONYMIZED}
      ),
      snapshots AS (
        SELECT en.contract_id,
               jsonb_agg(jsonb_build_object(
                 'itemId', en.item_id,
                 'itemType', en.item_type,
                 'treatment', COALESCE(ci.vat_treatment, 'STANDARD'),
                 'legalBasis', COALESCE(ci.vat_legal_basis, 'ET_468'),
                 'ratePercent',
                   CASE WHEN COALESCE(ci.vat_treatment, 'STANDARD') = 'STANDARD'
                        THEN 19 ELSE 0 END,
                 'source', 'BACKFILL',
                 'frozenAt', ${ISO_NOW})
                 ORDER BY en.item_type, en.item_id) AS snapshot
          FROM entries en
          JOIN contracts c ON c.id = en.contract_id
          LEFT JOIN catalog_items ci
            ON ci.id::text = en.item_id
           AND ci.tenant_id = c.tenant_id
           AND ci.type = en.item_type
         GROUP BY en.contract_id
      ),
      updated AS (
        UPDATE contracts c
           SET additional_vat_snapshot = sn.snapshot
          FROM snapshots sn
         WHERE sn.contract_id = c.id
        RETURNING c.id
      ) SELECT COUNT(*)::int AS total FROM updated
    `)) as Array<{ total: number }>;

    console.log(
      `[201] Contratos con IVA de instalación congelado=${installation[0]?.total ?? 0}; ` +
        `con IVA de adicionales congelado=${additionals[0]?.total ?? 0}.`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = (await queryRunner.query(`
        SELECT
          (SELECT COUNT(*)::int FROM contracts
            WHERE installation_vat_snapshot IS NOT NULL
               OR additional_vat_snapshot <> '[]'::jsonb) AS contracts,
          (SELECT COUNT(*)::int FROM catalog_items
            WHERE vat_treatment IS DISTINCT FROM 'STANDARD' AND vat_treatment IS NOT NULL
               OR vat_legal_basis IS DISTINCT FROM 'ET_468' AND vat_legal_basis IS NOT NULL)
            + (SELECT COUNT(*)::int FROM plan_details
                WHERE installation_vat_treatment <> 'STANDARD'
                   OR installation_vat_legal_basis <> 'ET_468') AS items
      `)) as Array<{ contracts: number; items: number }>;
      const contracts = rows[0]?.contracts ?? 0;
      const items = rows[0]?.items ?? 0;
      if (contracts > 0 || items > 0) {
        throw new Error(
          `Rollback de CatalogItemVatTreatment bloqueado: ${contracts} contrato(s) con IVA ` +
            `congelado y ${items} ítem(s) con tratamiento propio. Para continuar de forma ` +
            `destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP CONSTRAINT IF EXISTS chk_contracts_additional_vat_snapshot,
        DROP CONSTRAINT IF EXISTS chk_contracts_installation_vat_snapshot,
        DROP COLUMN IF EXISTS additional_vat_snapshot,
        DROP COLUMN IF EXISTS installation_vat_snapshot
    `);
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT IF EXISTS chk_plan_details_installation_vat_legal_basis,
        DROP CONSTRAINT IF EXISTS chk_plan_details_installation_vat_treatment,
        DROP COLUMN IF EXISTS installation_vat_legal_basis,
        DROP COLUMN IF EXISTS installation_vat_treatment
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_items
        DROP CONSTRAINT IF EXISTS chk_catalog_items_plan_vat,
        DROP CONSTRAINT IF EXISTS chk_catalog_items_vat_pair,
        DROP CONSTRAINT IF EXISTS chk_catalog_items_vat_legal_basis,
        DROP CONSTRAINT IF EXISTS chk_catalog_items_vat_treatment,
        DROP COLUMN IF EXISTS vat_legal_basis,
        DROP COLUMN IF EXISTS vat_treatment
    `);
  }
}

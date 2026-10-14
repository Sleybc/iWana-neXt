import { MigrationInterface, QueryRunner } from 'typeorm';

interface ContractBackfillCounts {
  residential_candidates: number;
  residential_with_stratum: number;
  residential_without_stratum: number;
  non_residential_other: number;
  total_contracts: number;
}

interface CatalogItemCounts {
  item_type: string;
  total: number;
}

interface MissingConceptCounts {
  item_type: string;
  total: number;
}

/**
 * Migración 144 — tratamiento de IVA por punto de servicio y concepto.
 * El backfill residencial solo confía en persona NATURAL + segmento RESIDENTIAL.
 */
export class VatServicePoint1440000000000 implements MigrationInterface {
  name = 'VatServicePoint1440000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const contractCounts = (await queryRunner.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE sub.person_type = 'NATURAL'
            AND sub.customer_segment = 'RESIDENTIAL'
        )::int AS residential_candidates,
        COUNT(*) FILTER (
          WHERE sub.person_type = 'NATURAL'
            AND sub.customer_segment = 'RESIDENTIAL'
            AND sub.stratum IS NOT NULL
        )::int AS residential_with_stratum,
        COUNT(*) FILTER (
          WHERE sub.person_type = 'NATURAL'
            AND sub.customer_segment = 'RESIDENTIAL'
            AND sub.stratum IS NULL
        )::int AS residential_without_stratum,
        COUNT(*) FILTER (
          WHERE sub.id IS NULL
             OR sub.person_type IS DISTINCT FROM 'NATURAL'
             OR sub.customer_segment IS DISTINCT FROM 'RESIDENTIAL'
        )::int AS non_residential_other,
        COUNT(*)::int AS total_contracts
      FROM contracts contract
      LEFT JOIN subscribers sub ON sub.id = contract.subscriber_id
    `)) as ContractBackfillCounts[];
    const [contractReport] = contractCounts;

    if (!contractReport) {
      throw new Error('Migración 144 abortada: no fue posible obtener el preflight de contratos.');
    }

    const catalogCounts = (await queryRunner.query(`
      SELECT type AS item_type, COUNT(*)::int AS total
      FROM catalog_items
      GROUP BY type
      ORDER BY type
    `)) as CatalogItemCounts[];

    console.log(
      `[144] Preflight contratos: RESIDENTIAL=${contractReport.residential_candidates}; ` +
        `estrato copiable=${contractReport.residential_with_stratum}; ` +
        `RESIDENTIAL sin estrato=${contractReport.residential_without_stratum}; ` +
        `NON_RESIDENTIAL por otra regla=${contractReport.non_residential_other}; ` +
        `total=${contractReport.total_contracts}.`,
    );
    console.log(
      `[144] Preflight catálogo por tipo: ${
        catalogCounts.map(({ item_type, total }) => `${item_type}=${total}`).join('; ') ||
        'sin ítems'
      }.`,
    );

    if (contractReport.residential_without_stratum > 0) {
      throw new Error(
        `Migración 144 abortada: ${contractReport.residential_without_stratum} contrato(s) ` +
          'califican como RESIDENTIAL pero el suscriptor no tiene estrato; resolver los datos antes del DDL.',
      );
    }

    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN service_usage varchar(20) NULL
          CONSTRAINT chk_contract_service_usage
          CHECK (service_usage IN ('RESIDENTIAL', 'NON_RESIDENTIAL')),
        ADD COLUMN installation_stratum smallint NULL
          CONSTRAINT chk_contract_installation_stratum
          CHECK (installation_stratum BETWEEN 1 AND 6),
        ADD COLUMN stratum_evidence_media_id uuid NULL,
        ADD COLUMN vat_snapshot jsonb NULL,
        ADD CONSTRAINT chk_contract_residential_stratum
          CHECK (service_usage IS DISTINCT FROM 'RESIDENTIAL' OR installation_stratum IS NOT NULL)
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_items
        ADD COLUMN vat_concept varchar(30) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE plan_details
        ADD COLUMN network_type varchar(10) NOT NULL DEFAULT 'FIXED'
          CONSTRAINT chk_plan_details_network_type
          CHECK (network_type IN ('FIXED', 'MOBILE'))
    `);

    await queryRunner.query(`
      UPDATE contracts contract
      SET service_usage = CASE
            WHEN sub.person_type = 'NATURAL'
             AND sub.customer_segment = 'RESIDENTIAL'
              THEN 'RESIDENTIAL'
            ELSE 'NON_RESIDENTIAL'
          END,
          installation_stratum = CASE
            WHEN sub.person_type = 'NATURAL'
             AND sub.customer_segment = 'RESIDENTIAL'
              THEN sub.stratum::smallint
            ELSE NULL
          END,
          stratum_evidence_media_id = NULL,
          vat_snapshot = NULL
      FROM subscribers sub
      WHERE sub.id = contract.subscriber_id
    `);

    // Contratos sin suscriptor asociado también se clasifican de forma conservadora.
    await queryRunner.query(`
      UPDATE contracts contract
      SET service_usage = 'NON_RESIDENTIAL',
          installation_stratum = NULL,
          stratum_evidence_media_id = NULL,
          vat_snapshot = NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM subscribers sub WHERE sub.id = contract.subscriber_id
      )
    `);

    await queryRunner.query(`
      UPDATE catalog_items
      SET vat_concept = 'INTERNET_ACCESS'
      WHERE type = 'PLAN'
    `);

    const missingConceptCounts = (await queryRunner.query(`
      SELECT type AS item_type, COUNT(*)::int AS total
      FROM catalog_items
      WHERE vat_concept IS NULL
      GROUP BY type
      ORDER BY type
    `)) as MissingConceptCounts[];
    console.log(
      `[144] Ítems sin concepto fiscal (requieren clasificación del operador): ${
        missingConceptCounts.map(({ item_type, total }) => `${item_type}=${total}`).join('; ') ||
        '0'
      }.`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP CONSTRAINT chk_contract_residential_stratum,
        DROP CONSTRAINT chk_contract_installation_stratum,
        DROP CONSTRAINT chk_contract_service_usage,
        DROP COLUMN vat_snapshot,
        DROP COLUMN stratum_evidence_media_id,
        DROP COLUMN installation_stratum,
        DROP COLUMN service_usage
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_items
        DROP COLUMN vat_concept
    `);
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT chk_plan_details_network_type,
        DROP COLUMN network_type
    `);
  }
}

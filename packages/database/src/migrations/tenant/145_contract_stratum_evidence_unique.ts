import { MigrationInterface, QueryRunner } from 'typeorm';

const INDEX_NAME = 'uq_contracts_stratum_evidence';

/** Duplicados detallados en el mensaje de aborto; el total siempre se informa. */
const MAX_REPORTED_DUPLICATES = 20;

interface StratumEvidenceDuplicate {
  media_id: string;
  contract_ids: string[];
}

/**
 * Migración 145 — un asset de soporte de estrato no puede respaldar dos contratos.
 *
 * ADR-093 D5 y C-DDL-3 v1.0 (PROMPT-MOD05-IVA-PDF-v1.0). Depende de la 144, que crea
 * `contracts.stratum_evidence_media_id`.
 *
 * - Preflight: si un mismo `stratum_evidence_media_id` aparece en más de un contrato,
 *   aborta antes de cualquier DDL e informa los duplicados (ids de asset y de contrato,
 *   sin datos personales). No resuelve duplicados por su cuenta.
 * - Índice único parcial: los contratos sin soporte (NULL) no compiten entre sí.
 *
 * Schema: tenant (la aplica el runner de TENANT_MIGRATIONS)
 * Reversible: sí. down() solo elimina el índice; no toca datos.
 */
export class ContractStratumEvidenceUnique1450000000000 implements MigrationInterface {
  name = 'ContractStratumEvidenceUnique1450000000000';

  private async assertStratumEvidenceColumnExists(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'contracts'
           AND column_name = 'stratum_evidence_media_id'
       ) AS present`,
    )) as Array<{ present: boolean }>;

    if (rows[0]?.present !== true) {
      throw new Error(
        'Migración 145 abortada: contracts.stratum_evidence_media_id no existe. ' +
          'Aplique primero la migración 144_vat_service_point.',
      );
    }
  }

  private async findDuplicates(queryRunner: QueryRunner): Promise<StratumEvidenceDuplicate[]> {
    return (await queryRunner.query(`
      SELECT stratum_evidence_media_id::text AS media_id,
             array_agg(id::text ORDER BY id::text) AS contract_ids
      FROM contracts
      WHERE stratum_evidence_media_id IS NOT NULL
      GROUP BY stratum_evidence_media_id
      HAVING COUNT(*) > 1
      ORDER BY stratum_evidence_media_id
    `)) as StratumEvidenceDuplicate[];
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertStratumEvidenceColumnExists(queryRunner);

    const duplicates = await this.findDuplicates(queryRunner);
    if (duplicates.length > 0) {
      const detail = duplicates
        .slice(0, MAX_REPORTED_DUPLICATES)
        .map((row) => `asset ${row.media_id}: contratos ${row.contract_ids.join(', ')}`)
        .join('; ');
      const omitted = duplicates.length - MAX_REPORTED_DUPLICATES;

      throw new Error(
        `Migración 145 abortada: ${duplicates.length} asset(s) de soporte de estrato respaldan ` +
          `más de un contrato (${detail}${omitted > 0 ? `; y ${omitted} más` : ''}). ` +
          `Resuelva los duplicados antes de crear ${INDEX_NAME}.`,
      );
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX ${INDEX_NAME}
        ON contracts (stratum_evidence_media_id)
        WHERE stratum_evidence_media_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ${INDEX_NAME}`);
  }
}

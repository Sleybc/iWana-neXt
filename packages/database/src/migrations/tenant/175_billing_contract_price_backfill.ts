import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración tenant 175: backfill de plan_snapshot_json.monthlyPrice en contratos (D-BIL-7 (b), HLD §3.3).
 * Completa el precio mensual vigente en los contratos convertidos desde expediente
 * que carecen de monthlyPrice en su snapshot.
 *
 * (v1.1, RS-2): Excluye explícitamente los contratos de suscriptores anonimizados
 * (subscribers.anonymized_at IS NOT NULL), dado que el trigger de la migración 169
 * rechaza cualquier mutación sobre ellos.
 */
export class BillingContractPriceBackfill1750000000175 implements MigrationInterface {
  name = 'BillingContractPriceBackfill1750000000175';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const excludedRows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM contracts c
      INNER JOIN subscribers s ON s.id = c.subscriber_id
      INNER JOIN catalog_price_history cph
        ON cph.item_id::text = c.plan_id
       AND cph.customer_segment::text = s.customer_segment::text
       AND cph.is_current = true
      WHERE (c.plan_snapshot_json->'monthlyPrice') IS NULL
        AND c.plan_snapshot_json->>'source' = 'expediente'
        AND s.anonymized_at IS NOT NULL
    `)) as Array<{ count: number }>;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_contract_price_backup_175 (
        contract_id uuid PRIMARY KEY,
        plan_snapshot_json jsonb NOT NULL
      );

      -- Respaldo de snapshot anterior para contratos elegibles no anonimizados.
      INSERT INTO crm_contract_price_backup_175 (contract_id, plan_snapshot_json)
      SELECT c.id, c.plan_snapshot_json
      FROM contracts c
      INNER JOIN subscribers s ON s.id = c.subscriber_id
      INNER JOIN catalog_price_history cph
        ON cph.item_id::text = c.plan_id
       AND cph.customer_segment::text = s.customer_segment::text
       AND cph.is_current = true
      WHERE (c.plan_snapshot_json->'monthlyPrice') IS NULL
        AND c.plan_snapshot_json->>'source' = 'expediente'
        AND s.anonymized_at IS NULL
      ON CONFLICT (contract_id) DO NOTHING;
    `);

    const updatedRows = (await queryRunner.query(`
      WITH updated AS (
        UPDATE contracts c
        SET plan_snapshot_json = jsonb_set(
              c.plan_snapshot_json,
              '{monthlyPrice}',
              to_jsonb(cph.base_price::numeric)
            ),
            updated_at = now()
        FROM subscribers s, catalog_price_history cph
        WHERE s.id = c.subscriber_id
          AND cph.item_id::text = c.plan_id
          AND cph.customer_segment::text = s.customer_segment::text
          AND cph.is_current = true
          AND (c.plan_snapshot_json->'monthlyPrice') IS NULL
          AND c.plan_snapshot_json->>'source' = 'expediente'
          AND s.anonymized_at IS NULL
        RETURNING c.id
      )
      SELECT COUNT(*)::int AS count FROM updated
    `)) as Array<{ count: number }>;

    console.log(
      `[175] billing price backfill excluded_anonymized=${excludedRows[0]?.count ?? 0} updated=${updatedRows[0]?.count ?? 0}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const anonymizedRows = (await queryRunner.query(`
      SELECT COUNT(*)::int AS count
      FROM crm_contract_price_backup_175 b
      INNER JOIN contracts c ON c.id = b.contract_id
      INNER JOIN subscribers s ON s.id = c.subscriber_id
      WHERE s.anonymized_at IS NOT NULL
    `)) as Array<{ count: number }>;
    const restoredRows = (await queryRunner.query(`
      WITH restored AS (
        UPDATE contracts c
        SET plan_snapshot_json = b.plan_snapshot_json,
            updated_at = now()
        FROM crm_contract_price_backup_175 b, subscribers s
        WHERE c.id = b.contract_id
          AND s.id = c.subscriber_id
          AND s.anonymized_at IS NULL
        RETURNING c.id
      )
      SELECT COUNT(*)::int AS count FROM restored
    `)) as Array<{ count: number }>;

    // Nunca se atraviesa el trigger de solo lectura de titulares anonimizados.
    // La fila de respaldo se elimina al revertir, sin reintroducir su snapshot.
    await queryRunner.query('DROP TABLE IF EXISTS crm_contract_price_backup_175');
    console.log(
      `[175] billing price rollback restored=${restoredRows[0]?.count ?? 0} skipped_anonymized=${anonymizedRows[0]?.count ?? 0}`,
    );
  }
}

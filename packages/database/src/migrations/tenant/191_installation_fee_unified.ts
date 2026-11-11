import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 191 — cargo de instalación unificado (cierre de venta fase 2, bloques C+E; D1, CA-6, CA-7).
 *
 * El cargo oficial es `catalog_price_history.installation_fee` (MOD06, por plan y segmento, vigente).
 *
 * - MOD05 `contracts.installation_fee`: valor congelado al crear el contrato. Los contratos en
 *   borrador existentes se rellenan con el `installation_fee` vigente del plan para el segmento
 *   del contrato (o del suscriptor; RESIDENTIAL por defecto); los demás quedan en NULL (su primer
 *   cobro ya ocurrió).
 * - MOD06 `plan_details.connection_fee` se retira. Antes, cada valor distinto de 0 se copia a
 *   `plan_connection_fee_retirements` con `matches_installation_fee` = false cuando ningún
 *   `installation_fee` vigente del plan coincide (registro de valores que difieren).
 *   La oferta de permanencia conserva su forma; el tope «valor ≤ cargo» pasa al servicio, que lo
 *   valida contra el `installation_fee` vigente. La restricción recreada exige meses y valor no
 *   nulos con oferta (la de la 183 los dejaba pasar en NULL por la lógica de tres valores).
 *
 * `down()` restaura `connection_fee` desde el respaldo (subido al valor descontado si hiciera
 * falta para cumplir la restricción original) y retira la columna del contrato y el respaldo.
 * Si algún contrato tiene `installation_fee` o hay filas en el respaldo lo bloquea salvo
 * `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: ese valor congelado no se reconstruye.
 */
export class InstallationFeeUnified1910000000191 implements MigrationInterface {
  name = 'InstallationFeeUnified1910000000191';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS installation_fee numeric(14,2) NULL
    `);
    await queryRunner.query(
      `ALTER TABLE contracts DROP CONSTRAINT IF EXISTS chk_contracts_installation_fee`,
    );
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD CONSTRAINT chk_contracts_installation_fee
          CHECK (installation_fee IS NULL OR installation_fee >= 0)
    `);
    await queryRunner.query(`
      UPDATE contracts c
         SET installation_fee = ph.installation_fee
        FROM catalog_price_history ph
       WHERE c.installation_fee IS NULL
         AND c.status = 'DRAFT'
         AND c.deleted_at IS NULL
         AND c.plan_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND ph.item_id = c.plan_id::uuid
         AND ph.tenant_id = c.tenant_id
         AND ph.is_current = true
         AND ph.customer_segment = COALESCE(
               c.customer_segment::text,
               (SELECT s.customer_segment::text FROM subscribers s WHERE s.id = c.subscriber_id),
               'RESIDENTIAL')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plan_connection_fee_retirements (
        item_id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        connection_fee numeric(14,2) NOT NULL,
        matches_installation_fee boolean NOT NULL,
        retired_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const hasColumn = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'plan_details' AND column_name = 'connection_fee'
      ) AS present
    `)) as Array<{ present: boolean }>;
    if (hasColumn[0]?.present === true) {
      await queryRunner.query(`
        INSERT INTO plan_connection_fee_retirements
          (item_id, tenant_id, connection_fee, matches_installation_fee)
        SELECT pd.item_id, ci.tenant_id, pd.connection_fee,
               EXISTS (
                 SELECT 1 FROM catalog_price_history ph
                  WHERE ph.item_id = pd.item_id AND ph.is_current = true
                    AND ph.installation_fee = pd.connection_fee
               )
          FROM plan_details pd
          JOIN catalog_items ci ON ci.id = pd.item_id
         WHERE pd.connection_fee <> 0
        ON CONFLICT (item_id) DO NOTHING
      `);
    }
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT IF EXISTS chk_plan_details_permanence_offer,
        DROP CONSTRAINT IF EXISTS chk_plan_details_connection_fee,
        DROP COLUMN IF EXISTS connection_fee
    `);
    await queryRunner.query(`
      ALTER TABLE plan_details
        ADD CONSTRAINT chk_plan_details_permanence_offer CHECK (
          (offers_permanence = false
             AND permanence_months IS NULL
             AND permanence_discounted_amount IS NULL)
          OR (offers_permanence = true
             AND permanence_months IS NOT NULL
             AND permanence_discounted_amount IS NOT NULL
             AND permanence_months BETWEEN 1 AND 12
             AND permanence_discounted_amount > 0)
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const rows = (await queryRunner.query(`
        SELECT (SELECT COUNT(*)::int FROM contracts WHERE installation_fee IS NOT NULL) AS contracts,
               (SELECT COUNT(*)::int FROM plan_connection_fee_retirements) AS retirements
      `)) as Array<{ contracts: number; retirements: number }>;
      const contracts = rows[0]?.contracts ?? 0;
      const retirements = rows[0]?.retirements ?? 0;
      if (contracts > 0 || retirements > 0) {
        throw new Error(
          `Rollback de InstallationFeeUnified bloqueado: ${contracts} contrato(s) con cargo de ` +
            `instalación congelado y ${retirements} cargo(s) retirado(s) en respaldo. Para ` +
            `continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT IF EXISTS chk_plan_details_permanence_offer,
        ADD COLUMN IF NOT EXISTS connection_fee numeric(14,2) NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE plan_details pd
         SET connection_fee = GREATEST(
               COALESCE(
                 (SELECT r.connection_fee FROM plan_connection_fee_retirements r
                   WHERE r.item_id = pd.item_id),
                 0),
               COALESCE(pd.permanence_discounted_amount, 0))
    `);
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT IF EXISTS chk_plan_details_connection_fee,
        ADD CONSTRAINT chk_plan_details_connection_fee CHECK (connection_fee >= 0),
        ADD CONSTRAINT chk_plan_details_permanence_offer CHECK (
          (offers_permanence = false
             AND permanence_months IS NULL
             AND permanence_discounted_amount IS NULL)
          OR (offers_permanence = true
             AND permanence_months BETWEEN 1 AND 12
             AND permanence_discounted_amount > 0
             AND permanence_discounted_amount <= connection_fee)
        )
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS plan_connection_fee_retirements`);
    await queryRunner.query(
      `ALTER TABLE contracts DROP CONSTRAINT IF EXISTS chk_contracts_installation_fee`,
    );
    await queryRunner.query(`ALTER TABLE contracts DROP COLUMN IF EXISTS installation_fee`);
  }
}

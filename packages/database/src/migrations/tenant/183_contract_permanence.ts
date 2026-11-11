import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 183 — permanencia mínima (cierre de venta, bloque H; CA-13).
 *
 * - MOD06 `plan_details`: cargo por conexión y oferta de permanencia del plan
 *   (sin oferta: meses y valor en NULL; con oferta: 1..12 meses y 0 < valor ≤ cargo).
 * - MOD05 `contract_permanence`: aceptación del cliente por contrato (1:1). Sin aceptar,
 *   todos los datos van en NULL (la opción sin permanencia siempre existe). La tabla
 *   mes 1..N no se persiste: se calcula del valor y los meses.
 *
 * `down()` retira la tabla y las columnas; los datos de permanencia se pierden.
 */
export class ContractPermanence1830000000183 implements MigrationInterface {
  name = 'ContractPermanence1830000000183';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE plan_details
        ADD COLUMN connection_fee numeric(14,2) NOT NULL DEFAULT 0,
        ADD COLUMN offers_permanence boolean NOT NULL DEFAULT false,
        ADD COLUMN permanence_months smallint NULL,
        ADD COLUMN permanence_discounted_amount numeric(14,2) NULL,
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

    await queryRunner.query(`
      CREATE TABLE contract_permanence (
        contract_id uuid PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE,
        tenant_id uuid NOT NULL,
        accepted boolean NOT NULL,
        months smallint NULL,
        connection_fee numeric(14,2) NULL,
        discounted_amount numeric(14,2) NULL,
        start_date date NULL,
        end_date date NULL,
        voluntary_suspension_days integer NOT NULL DEFAULT 0,
        created_by uuid NOT NULL,
        updated_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_contract_permanence_suspension_days CHECK (voluntary_suspension_days >= 0),
        CONSTRAINT chk_contract_permanence_shape CHECK (
          (accepted = false
             AND months IS NULL AND connection_fee IS NULL AND discounted_amount IS NULL
             AND start_date IS NULL AND end_date IS NULL)
          OR (accepted = true
             AND months BETWEEN 1 AND 12
             AND connection_fee >= 0
             AND discounted_amount > 0
             AND discounted_amount <= connection_fee
             AND (start_date IS NULL) = (end_date IS NULL)
             AND (end_date IS NULL OR end_date > start_date))
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_contract_permanence_tenant ON contract_permanence (tenant_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contract_permanence`);
    await queryRunner.query(`
      ALTER TABLE plan_details
        DROP CONSTRAINT IF EXISTS chk_plan_details_permanence_offer,
        DROP CONSTRAINT IF EXISTS chk_plan_details_connection_fee,
        DROP COLUMN IF EXISTS permanence_discounted_amount,
        DROP COLUMN IF EXISTS permanence_months,
        DROP COLUMN IF EXISTS offers_permanence,
        DROP COLUMN IF EXISTS connection_fee
    `);
  }
}

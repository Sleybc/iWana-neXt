import { MigrationInterface, QueryRunner } from 'typeorm';

/** Migración tenant 167 de ADR-102: ciclos de facturación tipados por servicio. */
export class CreateCrmBillingCycles1670000000000 implements MigrationInterface {
  name = 'CreateCrmBillingCycles1670000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE crm_billing_cycles (
        cycle_day smallint PRIMARY KEY,
        cutoff_day smallint NOT NULL,
        active boolean NOT NULL DEFAULT true,
        updated_by uuid NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_crm_billing_cycles_cycle_day CHECK (cycle_day BETWEEN 1 AND 28),
        CONSTRAINT ck_crm_billing_cycles_cutoff_day CHECK (cutoff_day BETWEEN 1 AND 31),
        CONSTRAINT ck_crm_billing_cycles_cutoff_after_cycle CHECK (cutoff_day > cycle_day)
      )
    `);
    await queryRunner.query(`
      INSERT INTO crm_billing_cycles (cycle_day, cutoff_day)
      VALUES (1, 15), (15, 30)
    `);
    await queryRunner.query(`
      ALTER TABLE contracts
      ADD COLUMN billing_cycle_day smallint NULL,
      ADD CONSTRAINT fk_contracts_billing_cycle_day
        FOREIGN KEY (billing_cycle_day) REFERENCES crm_billing_cycles (cycle_day)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_contracts_status_billing_cycle_day
      ON contracts (status, billing_cycle_day)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_contracts_status_billing_cycle_day');
    await queryRunner.query(
      'ALTER TABLE contracts DROP CONSTRAINT IF EXISTS fk_contracts_billing_cycle_day',
    );
    await queryRunner.query('ALTER TABLE contracts DROP COLUMN IF EXISTS billing_cycle_day');
    await queryRunner.query('DROP TABLE IF EXISTS crm_billing_cycles');
  }
}

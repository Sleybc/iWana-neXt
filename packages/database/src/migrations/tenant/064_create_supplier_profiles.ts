import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion 064: tabla supplier_profiles para MOD12 Proveedores Fase 05 (ADR-052 D1).
 */
export class CreateSupplierProfiles0640000000000 implements MigrationInterface {
  name = 'CreateSupplierProfiles0640000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE supplier_profile_status AS ENUM (
        'ACTIVE',
        'INACTIVE',
        'BLOCKED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE supplier_profiles (
        id                        UUID                        NOT NULL DEFAULT gen_random_uuid(),
        tenant_id                 UUID                        NOT NULL,
        party_ref_id              UUID                        NOT NULL,
        party_role_id             UUID                        NOT NULL,
        supplier_code             VARCHAR(20)                 NOT NULL,
        payment_terms_days        INTEGER,
        currency                  CHAR(3),
        incoterm                  VARCHAR(10),
        default_lead_time_days    INTEGER,
        purchasing_contact_name   VARCHAR(200),
        purchasing_contact_email  VARCHAR(255),
        purchasing_contact_phone  VARCHAR(32),
        status                    supplier_profile_status     NOT NULL DEFAULT 'ACTIVE',
        notes                     TEXT,
        created_by_user_id        UUID,
        created_at                TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_supplier_profiles PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_supplier_profiles_tenant_party_ref
        ON supplier_profiles (tenant_id, party_ref_id)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_supplier_profiles_tenant_supplier_code
        ON supplier_profiles (tenant_id, supplier_code)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_supplier_profiles_tenant_status
        ON supplier_profiles (tenant_id, status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS supplier_profiles`);
    await queryRunner.query(`DROP TYPE IF EXISTS supplier_profile_status`);
  }
}

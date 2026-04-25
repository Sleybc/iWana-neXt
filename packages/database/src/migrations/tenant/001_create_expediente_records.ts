import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExpedienteRecords1700000000001 implements MigrationInterface {
  name = 'CreateExpedienteRecords1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expediente_records (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'NUEVO_POTENCIAL',
        previous_status VARCHAR(40),
        status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        discard_reason VARCHAR(255),
        assigned_to UUID,
        current_responsible_user_id UUID,
        current_responsible_assigned_at TIMESTAMPTZ,
        data_consent_revoked BOOLEAN NOT NULL DEFAULT FALSE,
        full_name VARCHAR(160) NOT NULL,
        document_type VARCHAR(20),
        document_number_encrypted VARCHAR(255),
        gender VARCHAR(20),
        birth_date DATE,
        person_type VARCHAR(20),
        company_name VARCHAR(200),
        first_name VARCHAR(160),
        last_name VARCHAR(160),
        primary_contact_name VARCHAR(160),
        primary_contact_role VARCHAR(120),
        phone_primary_encrypted VARCHAR(255),
        phone_secondary_encrypted VARCHAR(255),
        email_primary_encrypted VARCHAR(255),
        email_secondary VARCHAR(255),
        alt_contact_name VARCHAR(160),
        alt_contact_phone_encrypted VARCHAR(255),
        contact_preference VARCHAR(30),
        best_contact_time VARCHAR(60),
        address VARCHAR(255),
        municipality VARCHAR(120),
        department VARCHAR(120),
        postal_code VARCHAR(12),
        stratum SMALLINT,
        neighborhood VARCHAR(120),
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        coordinates_source VARCHAR(20),
        coordinates_confidence VARCHAR(20),
        access_references TEXT,
        zone_type VARCHAR(20),
        source VARCHAR(120) NOT NULL DEFAULT 'OTRO',
        acquisition_channel VARCHAR(30) NOT NULL DEFAULT 'OTRO',
        source_detail VARCHAR(255),
        interested_plan_id VARCHAR(120),
        additional_product_ids JSONB,
        additional_service_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        campaign VARCHAR(120),
        case_priority VARCHAR(20),
        estimated_budget NUMERIC(14,2),
        commercial_notes TEXT,
        coverage_result VARCHAR(30),
        available_technology VARCHAR(60),
        estimated_distance_m INTEGER,
        feasibility VARCHAR(30),
        candidate_technologies JSONB,
        technical_confidence VARCHAR(20),
        evaluation_source VARCHAR(30),
        technical_observations TEXT,
        estimated_equipment TEXT,
        identity_verified VARCHAR(20),
        legal_compliance_status VARCHAR(30),
        document_supports JSONB,
        payment_method VARCHAR(60),
        billing_cycle VARCHAR(30),
        fiscal_name VARCHAR(200),
        fiscal_document VARCHAR(30),
        fiscal_address VARCHAR(255),
        rut_reference VARCHAR(120),
        installation_address VARCHAR(255),
        availability_window VARCHAR(120),
        site_contact_name VARCHAR(160),
        site_contact_phone_encrypted VARCHAR(255),
        special_access_notes TEXT,
        required_materials TEXT,
        ticket_id VARCHAR(160),
        work_order_id VARCHAR(160),
        inventory_assignment_ref VARCHAR(160),
        expansion_request_id VARCHAR(160),
        execution_policy_ref VARCHAR(160),
        checklist_completed BOOLEAN NOT NULL DEFAULT FALSE,
        evidence_mode VARCHAR(64),
        conformity_evidence_ref VARCHAR(255),
        last_reschedule_reason VARCHAR(64),
        last_reschedule_notes TEXT,
        completeness_commercial SMALLINT,
        completeness_legal SMALLINT,
        completeness_technical SMALLINT,
        completeness_operational SMALLINT,
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_expediente_records PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_tenant_status
      ON expediente_records (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_tenant_created
      ON expediente_records (tenant_id, created_at)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_tenant_municipality
      ON expediente_records (tenant_id, municipality)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expediente_deleted_at
      ON expediente_records (deleted_at)
      WHERE deleted_at IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS status_changes (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        expediente_id UUID NOT NULL,
        from_status VARCHAR(30) NOT NULL,
        to_status VARCHAR(30) NOT NULL,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        changed_by UUID NOT NULL,
        actor_name VARCHAR(160),
        reason VARCHAR(255),
        metadata_json JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_status_changes PRIMARY KEY (id),
        CONSTRAINT fk_status_changes_expediente FOREIGN KEY (expediente_id)
          REFERENCES expediente_records (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_status_changes_expediente
      ON status_changes (tenant_id, expediente_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_status_changes_changed_at
      ON status_changes (tenant_id, changed_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_attempts (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        expediente_id UUID NOT NULL,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        channel VARCHAR(30) NOT NULL,
        result VARCHAR(30) NOT NULL,
        duration_minutes SMALLINT,
        notes TEXT,
        advisor_id UUID NOT NULL,
        actor_name VARCHAR(160),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_contact_attempts PRIMARY KEY (id),
        CONSTRAINT fk_contact_attempts_expediente FOREIGN KEY (expediente_id)
          REFERENCES expediente_records (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_attempts_expediente
      ON contact_attempts (tenant_id, expediente_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS coverage_checks (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        expediente_id UUID NOT NULL,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        latitude NUMERIC(10,7),
        longitude NUMERIC(10,7),
        address_used VARCHAR(255),
        result VARCHAR(30) NOT NULL,
        technology_available VARCHAR(60),
        distance_m INTEGER,
        snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
        checked_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_coverage_checks PRIMARY KEY (id),
        CONSTRAINT fk_coverage_checks_expediente FOREIGN KEY (expediente_id)
          REFERENCES expediente_records (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_coverage_checks_expediente
      ON coverage_checks (tenant_id, expediente_id)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consent_records (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        expediente_id UUID NOT NULL,
        prospect_id UUID,
        consent_type VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL,
        accepted BOOLEAN,
        channel VARCHAR(120) NOT NULL,
        obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ip_address VARCHAR(64),
        legal_text_version TEXT NOT NULL,
        evidence_ref VARCHAR(255),
        revoked_at TIMESTAMPTZ,
        revoked_reason VARCHAR(255),
        revoked_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_consent_records PRIMARY KEY (id),
        CONSTRAINT fk_consent_records_expediente FOREIGN KEY (expediente_id)
          REFERENCES expediente_records (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consent_records_expediente
      ON consent_records (tenant_id, expediente_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_consent_records_type
      ON consent_records (tenant_id, consent_type)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consent_records_type`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_consent_records_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS consent_records`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_coverage_checks_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS coverage_checks`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contact_attempts_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS contact_attempts`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_status_changes_changed_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_status_changes_expediente`);
    await queryRunner.query(`DROP TABLE IF EXISTS status_changes`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_deleted_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_tenant_municipality`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_tenant_created`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_tenant_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS expediente_records`);
  }
}
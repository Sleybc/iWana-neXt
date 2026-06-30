import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialTenantSchema1700000000000 implements MigrationInterface {
  name = 'InitialTenantSchema1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        email VARCHAR(512) NOT NULL,
        email_hash VARCHAR(64) NOT NULL,
        password_hash VARCHAR(60) NOT NULL,
        role VARCHAR(20) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VERIFICATION',
        tenant_id UUID NOT NULL,
        mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_secret VARCHAR(512),
        mfa_required BOOLEAN NOT NULL DEFAULT FALSE,
        password_reset_required BOOLEAN NOT NULL DEFAULT FALSE,
        password_reset_token VARCHAR(512),
        password_reset_expires_at TIMESTAMPTZ,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        email_verified BOOLEAN NOT NULL DEFAULT FALSE,
        email_verification_token VARCHAR(512),
        first_name VARCHAR(512),
        last_name VARCHAR(512),
        phone VARCHAR(20),
        job_title VARCHAR(150),
        document_type VARCHAR(20),
        document_number VARCHAR(512),
        avatar_url VARCHAR(500),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_users PRIMARY KEY (id),
        CONSTRAINT uq_users_email_hash UNIQUE (email_hash)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_users_email_hash ON users(email_hash)`);
    await queryRunner.query(`CREATE INDEX idx_users_tenant_role ON users(tenant_id, role)`);
    await queryRunner.query(`CREATE INDEX idx_users_tenant_status ON users(tenant_id, status)`);
    await queryRunner.query(
      `CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        token_hash VARCHAR(64) NOT NULL,
        family_id UUID NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        revoke_reason VARCHAR(50),
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
        CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_rt_token_hash ON refresh_tokens(token_hash)`);
    await queryRunner.query(`CREATE INDEX idx_rt_family_id ON refresh_tokens(family_id)`);
    await queryRunner.query(
      `CREATE INDEX idx_rt_user_revoked ON refresh_tokens(user_id, revoked_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100) NOT NULL,
        old_value JSONB,
        new_value JSONB,
        ip_address VARCHAR(45),
        user_agent VARCHAR(512),
        request_id VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_audit_logs PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_al_tenant_created ON audit_logs(tenant_id, created_at)`,
    );
    await queryRunner.query(`CREATE INDEX idx_al_entity ON audit_logs(entity_type, entity_id)`);
    await queryRunner.query(`CREATE INDEX idx_al_user_created ON audit_logs(user_id, created_at)`);
    await queryRunner.query(`CREATE INDEX idx_al_action_tenant ON audit_logs(action, tenant_id)`);

    await queryRunner.query(`ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`DROP POLICY IF EXISTS audit_logs_no_mutate ON audit_logs`);
    await queryRunner.query(
      `CREATE POLICY audit_logs_no_mutate ON audit_logs AS RESTRICTIVE FOR ALL TO PUBLIC USING (TRUE)`,
    );
    await queryRunner.query(`REVOKE DELETE ON audit_logs FROM PUBLIC`);
    await queryRunner.query(`REVOKE UPDATE ON audit_logs FROM PUBLIC`);

    await queryRunner.query(`
      CREATE TABLE commercial_nodes (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_commercial_nodes PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_commercial_nodes_tenant_active ON commercial_nodes(tenant_id, is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_commercial_nodes_deleted_at ON commercial_nodes(deleted_at) WHERE deleted_at IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE coverage_zones (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(150) NOT NULL,
        center_latitude DOUBLE PRECISION NOT NULL,
        center_longitude DOUBLE PRECISION NOT NULL,
        radius_km NUMERIC(6,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_coverage_zones PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_coverage_zones_tenant_active ON coverage_zones(tenant_id, is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_coverage_zones_deleted_at ON coverage_zones(deleted_at) WHERE deleted_at IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE plan_catalog_items (
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name VARCHAR(140) NOT NULL,
        technology VARCHAR(100) NOT NULL,
        installation_rule VARCHAR(30) NOT NULL DEFAULT 'ALWAYS',
        download_speed_mbps INTEGER NOT NULL,
        upload_speed_mbps INTEGER NOT NULL,
        base_price NUMERIC(14,2) NOT NULL,
        installation_fee NUMERIC(14,2) NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ,
        valid_to TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ,
        CONSTRAINT pk_plan_catalog_items PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_plan_catalog_items_tenant_active ON plan_catalog_items(tenant_id, is_active)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_plan_catalog_items_deleted_at ON plan_catalog_items(deleted_at) WHERE deleted_at IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'down() not supported for initial schema migration. Use provisioning rollback.',
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 028: Crea el módulo CRM — tablas de cotizaciones y contratos.
 *
 * Tablas creadas:
 * - quotes: cotizaciones del proceso comercial (vinculadas a oportunidades/expedientes)
 * - contracts: contratos/servicios contratados por el subscriber
 *
 * Tipos ENUM creados:
 * - quote_status_enum: DRAFT | SENT | APPROVED | REJECTED | EXPIRED
 * - contract_status_enum: DRAFT | ACTIVE | SUSPENDED | TERMINATED
 *   (ARCHIVED se agrega en migración 029)
 *
 * Schema: tenant (search_path resuelto por runInTenantSchema — sin prefijo explícito)
 * Reversible: sí
 */
export class CreateCrmQuotesAndContracts1700000000028 implements MigrationInterface {
  name = 'CreateCrmQuotesAndContracts1700000000028';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum: estados de cotización ──────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE quote_status_enum AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ─── Enum: estados de contrato (sin ARCHIVED — se extiende en migración 029) ─
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE contract_status_enum AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ─── Tabla: quotes ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS quotes (
        id             UUID          NOT NULL DEFAULT gen_random_uuid(),
        tenant_id      UUID          NOT NULL,
        opportunity_id UUID,
        expediente_id  UUID,
        subscriber_id  UUID,
        plan_id        VARCHAR(120)  NOT NULL,
        plan_snapshot_json JSONB     NOT NULL,
        monthly_amount NUMERIC(14,2) NOT NULL,
        status         quote_status_enum NOT NULL DEFAULT 'DRAFT',
        expires_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        deleted_at     TIMESTAMPTZ,
        CONSTRAINT pk_quotes PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status
        ON quotes (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_opportunity
        ON quotes (opportunity_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_quotes_expediente
        ON quotes (expediente_id)
    `);

    // ─── Tabla: contracts ──────────────────────────────────────────────────────
    // Columnas base; la migración 029 hace quote_id nullable y agrega campos adicionales.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contracts (
        id                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        tenant_id          UUID         NOT NULL,
        quote_id           UUID         NOT NULL,
        subscriber_id      UUID         NOT NULL,
        plan_id            VARCHAR(120) NOT NULL,
        plan_snapshot_json JSONB        NOT NULL,
        status             contract_status_enum NOT NULL DEFAULT 'DRAFT',
        start_date         DATE,
        end_date           DATE,
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        deleted_at         TIMESTAMPTZ,
        CONSTRAINT pk_contracts PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contracts_tenant_status
        ON contracts (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contracts_quote
        ON contracts (quote_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contracts_quote`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contracts_tenant_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS contracts`);

    await queryRunner.query(`DROP INDEX IF EXISTS idx_quotes_expediente`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_quotes_opportunity`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_quotes_tenant_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS quotes`);

    await queryRunner.query(`DROP TYPE IF EXISTS contract_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS quote_status_enum`);
  }
}

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddSubscribersTable1700000000012 = void 0;
/**
 * Migración 012: Crear tabla subscribers con modelo de dos dimensiones.
 *
 * - personType (NATURAL | JURIDICA): dimensión fiscal
 * - customerSegment (6 segmentos ISP): dimensión de negocio
 * - vatTreatment y taxRegime calculados automáticamente
 * - PII cifrado con AES-256-GCM (mismo formato que expediente_records)
 * - Índices compuestos para consultas por tenant
 * - Constraint CHECK para campos obligatorios según personType
 */
class AddSubscribersTable1700000000012 {
  name = 'AddSubscribersTable1700000000012';
  async up(queryRunner) {
    // Crear enum types para PostgreSQL
    await queryRunner.query(`
      CREATE TYPE person_type_enum AS ENUM ('NATURAL', 'JURIDICA')
    `);
    await queryRunner.query(`
      CREATE TYPE customer_segment_enum AS ENUM (
        'RESIDENTIAL', 'SOHO', 'PYME', 'CORPORATE', 'GOVERNMENT', 'WHOLESALE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE vat_treatment_enum AS ENUM ('EXEMPT', 'EXCLUDED', 'STANDARD')
    `);
    await queryRunner.query(`
      CREATE TYPE tax_regime_enum AS ENUM ('SIMPLIFIED', 'COMMON')
    `);
    await queryRunner.query(`
      CREATE TYPE subscriber_status_enum AS ENUM (
        'LEAD', 'PROSPECT', 'ACTIVE', 'SUSPENDED', 'CANCELLED'
      )
    `);
    // Crear tabla subscribers
    await queryRunner.query(`
      CREATE TABLE subscribers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        user_id UUID NULL,

        -- Dimensión fiscal
        person_type person_type_enum NOT NULL,

        -- Dimensión de negocio
        customer_segment customer_segment_enum NOT NULL,

        -- Persona natural
        document_type VARCHAR(20) NULL,
        document_number_encrypted VARCHAR(500) NULL,
        first_name VARCHAR(300) NULL,
        last_name VARCHAR(300) NULL,
        stratum INTEGER NULL CHECK (stratum IS NULL OR (stratum >= 1 AND stratum <= 6)),
        birth_date DATE NULL,

        -- Persona jurídica
        nit VARCHAR(500) NULL,
        nit_verification_digit VARCHAR(1) NULL,
        business_name VARCHAR(300) NULL,
        commercial_name VARCHAR(300) NULL,
        legal_representative_id UUID NULL,

        -- Compartido (PII cifrado)
        email_encrypted VARCHAR(500) NOT NULL,
        phone_encrypted VARCHAR(100) NOT NULL,
        whatsapp VARCHAR(50) NULL,

        -- Fiscal (calculado automáticamente)
        vat_treatment vat_treatment_enum NOT NULL,
        tax_regime tax_regime_enum NOT NULL,

        -- Ubicación
        address VARCHAR(500) NOT NULL,
        neighborhood VARCHAR(100) NULL,
        city VARCHAR(50) NULL,
        department VARCHAR(50) NULL,
        postal_code VARCHAR(20) NULL,
        latitude NUMERIC(10, 7) NULL,
        longitude NUMERIC(10, 7) NULL,

        -- Cobertura
        coverage_node_id UUID NULL,

        -- Ciclo de vida
        status subscriber_status_enum NOT NULL DEFAULT 'LEAD',
        external_id VARCHAR(160) NULL,

        -- Auditoría
        created_by UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL,

        -- Constraint: campos obligatorios según personType
        CONSTRAINT chk_subscriber_person_fields CHECK (
          (person_type = 'NATURAL' AND document_type IS NOT NULL AND document_number_encrypted IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND stratum IS NOT NULL)
          OR
          (person_type = 'JURIDICA' AND nit IS NOT NULL AND business_name IS NOT NULL)
        )
      )
    `);
    // Índices compuestos
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_tenant_status ON subscribers (tenant_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_tenant_doc ON subscribers (tenant_id, document_number_encrypted)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_tenant_email ON subscribers (tenant_id, email_encrypted)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_tenant_stratum ON subscribers (tenant_id, stratum)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_tenant_segment ON subscribers (tenant_id, customer_segment)
    `);
    // Unique index para user_id (solo donde no sea NULL)
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_subscribers_user_id ON subscribers (user_id) WHERE user_id IS NOT NULL
    `);
  }
  async down(queryRunner) {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_segment`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_stratum`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_email`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_doc`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_status`);
    // Eliminar tabla
    await queryRunner.query(`DROP TABLE IF EXISTS subscribers`);
    // Eliminar enum types
    await queryRunner.query(`DROP TYPE IF EXISTS subscriber_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS tax_regime_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS vat_treatment_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS customer_segment_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS person_type_enum`);
  }
}
exports.AddSubscribersTable1700000000012 = AddSubscribersTable1700000000012;
//# sourceMappingURL=012_add_subscribers.js.map

'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ExtendContractsForServices1700000000029 = void 0;
/**
 * Migración 029: Extiende la tabla contracts para modelar servicios contratados.
 *
 * Cambios:
 * - quote_id pasa a ser nullable (contratos pueden crearse sin cotización previa).
 * - Nuevos campos: alias, dirección de instalación, segmento override,
 *   add-ons (productos y servicios), configuración de facturación.
 * - Nuevo índice por subscriber para listar servicios del cliente.
 * - El valor ARCHIVED se agrega al ENUM contract_status_enum.
 *
 * Schema: tenant (dinámico vía runInTenantSchema)
 * Reversible: sí
 */
class ExtendContractsForServices1700000000029 {
  name = 'ExtendContractsForServices1700000000029';
  async up(queryRunner) {
    // Agregar ARCHIVED al enum de estado del contrato
    await queryRunner.query(`
      ALTER TYPE contract_status_enum ADD VALUE IF NOT EXISTS 'ARCHIVED'
    `);
    // quote_id pasa a nullable: los contratos pueden crearse sin cotización previa
    await queryRunner.query(`
      ALTER TABLE contracts ALTER COLUMN quote_id DROP NOT NULL
    `);
    // Alias visible del servicio (obligatorio, autogenerado server-side si viene vacío)
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS alias VARCHAR(120)
    `);
    // Dirección de instalación propia del servicio (puede diferir de la dirección del subscriber)
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS installation_address VARCHAR(255),
        ADD COLUMN IF NOT EXISTS installation_city VARCHAR(120),
        ADD COLUMN IF NOT EXISTS installation_department VARCHAR(120),
        ADD COLUMN IF NOT EXISTS installation_postal_code VARCHAR(20),
        ADD COLUMN IF NOT EXISTS installation_notes TEXT
    `);
    // Segmento override por servicio (NULL → hereda el segmento del subscriber)
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS customer_segment VARCHAR(20)
    `);
    // Add-ons del catálogo seleccionados para este servicio
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS additional_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS additional_service_ids JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    // Configuración de facturación por servicio (puede diferir entre servicios del mismo cliente)
    await queryRunner.query(`
      ALTER TABLE contracts
        ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30),
        ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20),
        ADD COLUMN IF NOT EXISTS fiscal_name VARCHAR(200),
        ADD COLUMN IF NOT EXISTS fiscal_document VARCHAR(30),
        ADD COLUMN IF NOT EXISTS fiscal_address VARCHAR(255)
    `);
    // Índice para listar servicios de un subscriber de forma eficiente
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_contracts_tenant_subscriber
        ON contracts (tenant_id, subscriber_id)
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_contracts_tenant_subscriber`);
    await queryRunner.query(`
      ALTER TABLE contracts
        DROP COLUMN IF EXISTS fiscal_address,
        DROP COLUMN IF EXISTS fiscal_document,
        DROP COLUMN IF EXISTS fiscal_name,
        DROP COLUMN IF EXISTS billing_cycle,
        DROP COLUMN IF EXISTS payment_method,
        DROP COLUMN IF EXISTS additional_service_ids,
        DROP COLUMN IF EXISTS additional_product_ids,
        DROP COLUMN IF EXISTS customer_segment,
        DROP COLUMN IF EXISTS installation_notes,
        DROP COLUMN IF EXISTS installation_postal_code,
        DROP COLUMN IF EXISTS installation_department,
        DROP COLUMN IF EXISTS installation_city,
        DROP COLUMN IF EXISTS installation_address,
        DROP COLUMN IF EXISTS alias
    `);
    await queryRunner.query(`
      ALTER TABLE contracts ALTER COLUMN quote_id SET NOT NULL
    `);
    // Nota: PostgreSQL no soporta DROP VALUE en enums; el valor ARCHIVED queda en el tipo.
    // En producción, el rollback de este cambio requiere recrear el tipo si fuera necesario.
  }
}
exports.ExtendContractsForServices1700000000029 = ExtendContractsForServices1700000000029;
//# sourceMappingURL=029_extend_contracts_for_services.js.map

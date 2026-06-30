'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AddSubscriberConversionFields1700000000015 = void 0;
/**
 * Migración 015: agrega trazabilidad de conversión Expediente -> Subscriber.
 * Incluye soporte para override manual auditado.
 */
class AddSubscriberConversionFields1700000000015 {
  name = 'AddSubscriberConversionFields1700000000015';
  async up(queryRunner) {
    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS expediente_id UUID NULL,
      ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS manual_override_reason VARCHAR(500) NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_subscribers_tenant_expediente
      ON subscribers (tenant_id, expediente_id)
      WHERE deleted_at IS NULL
    `);
  }
  async down(queryRunner) {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_tenant_expediente`);
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS manual_override_reason,
      DROP COLUMN IF EXISTS activated_at,
      DROP COLUMN IF EXISTS converted_at,
      DROP COLUMN IF EXISTS expediente_id
    `);
  }
}
exports.AddSubscriberConversionFields1700000000015 = AddSubscriberConversionFields1700000000015;
//# sourceMappingURL=015_add_subscriber_conversion_fields.js.map

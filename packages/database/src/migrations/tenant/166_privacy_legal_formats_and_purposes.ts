import { MigrationInterface, QueryRunner } from 'typeorm';

/** Añade formato sin modificar las filas inmutables y configura las finalidades del tenant.
 * La reversión descarta formato y configuración; requiere autorización explícita si hay datos no predeterminados.
 */
export class PrivacyLegalFormatsAndPurposes1660000000000 implements MigrationInterface {
  name = 'PrivacyLegalFormatsAndPurposes1660000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE legal_texts ADD COLUMN format text NOT NULL DEFAULT 'PLAIN' CHECK (format IN ('PLAIN', 'MARKDOWN'))`,
    );
    await queryRunner.query(`CREATE TABLE privacy_purpose_settings (
      purpose text PRIMARY KEY CHECK (purpose IN ('TRATAMIENTO_CONTRACTUAL', 'CONTACTO_COMERCIAL', 'REPORTE_CENTRALES_RIESGO', 'DATOS_BIOMETRICOS')),
      enabled boolean NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid NULL
    )`);
    await queryRunner.query(`INSERT INTO privacy_purpose_settings (purpose, enabled) VALUES
      ('TRATAMIENTO_CONTRACTUAL', true), ('CONTACTO_COMERCIAL', true),
      ('REPORTE_CENTRALES_RIESGO', true), ('DATOS_BIOMETRICOS', true)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT
      EXISTS (SELECT 1 FROM legal_texts WHERE format <> 'PLAIN') OR
      EXISTS (SELECT 1 FROM privacy_purpose_settings WHERE NOT enabled) AS destructive`)) as Array<{
      destructive: boolean;
    }>;
    if (rows[0]?.destructive && process.env['IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN'] !== 'true') {
      throw new Error(
        'La reversión descarta formatos o finalidades configuradas; requiere IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true.',
      );
    }
    await queryRunner.query('DROP TABLE IF EXISTS privacy_purpose_settings');
    await queryRunner.query('ALTER TABLE legal_texts DROP COLUMN IF EXISTS format');
  }
}

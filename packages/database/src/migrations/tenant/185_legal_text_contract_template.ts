import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 185 — plantilla del contrato de servicio en textos legales (cierre de venta,
 * bloque A; ADR-109 D4, spec G2).
 *
 * Schema tenant, tabla `legal_texts` (146 y 166):
 * - `ck_legal_texts_type` admite `CONTRATO_SERVICIO`.
 * - El CHECK de formato (sin nombre en la 166) se reemplaza por `ck_legal_texts_format`,
 *   que admite `HTML`; HTML solo para el contrato y el contrato solo en HTML.
 * - Aprobación jurídica: `legal_approval_declaration`, `approved_by_user_id` (del JWT) y
 *   `approved_at` (del servidor). Sin datos del abogado (decisión del usuario 2026-11-11).
 *   Las tres van juntas, y el contrato no existe sin ellas.
 *
 * `down()` restaura los CHECK de la 146/166 y retira las columnas. Si hay plantillas de
 * contrato publicadas lo bloquea salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`, que
 * las borra (no caben en el CHECK anterior).
 */
export class LegalTextContractTemplate1850000000185 implements MigrationInterface {
  name = 'LegalTextContractTemplate1850000000185';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE legal_texts DROP CONSTRAINT IF EXISTS ck_legal_texts_type`,
    );
    await queryRunner.query(`
      ALTER TABLE legal_texts ADD CONSTRAINT ck_legal_texts_type
        CHECK (type IN ('POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION', 'CONTRATO_SERVICIO'))
    `);
    await queryRunner.query(
      `ALTER TABLE legal_texts DROP CONSTRAINT IF EXISTS legal_texts_format_check`,
    );
    await queryRunner.query(`
      ALTER TABLE legal_texts ADD CONSTRAINT ck_legal_texts_format
        CHECK (format IN ('PLAIN', 'MARKDOWN', 'HTML'))
    `);
    await queryRunner.query(`
      ALTER TABLE legal_texts
        ADD COLUMN legal_approval_declaration text NULL,
        ADD COLUMN approved_by_user_id uuid NULL,
        ADD COLUMN approved_at timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE legal_texts
        ADD CONSTRAINT ck_legal_texts_approval_declaration
          CHECK (legal_approval_declaration IS NULL
                 OR legal_approval_declaration = 'APROBADO_POR_ASESORIA_JURIDICA'),
        ADD CONSTRAINT ck_legal_texts_approval_complete
          CHECK ((legal_approval_declaration IS NULL AND approved_by_user_id IS NULL AND approved_at IS NULL)
                 OR (legal_approval_declaration IS NOT NULL AND approved_by_user_id IS NOT NULL
                     AND approved_at IS NOT NULL)),
        ADD CONSTRAINT ck_legal_texts_contract_approved
          CHECK (type <> 'CONTRATO_SERVICIO'
                 OR (legal_approval_declaration IS NOT NULL AND format = 'HTML')),
        ADD CONSTRAINT ck_legal_texts_html_only_contract
          CHECK (format <> 'HTML' OR type = 'CONTRATO_SERVICIO')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*)::int AS total FROM legal_texts WHERE type = 'CONTRATO_SERVICIO' OR format = 'HTML'`,
    )) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;
    if (total > 0) {
      if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
        throw new Error(
          `Rollback de LegalTextContractTemplate bloqueado: hay ${total} plantilla(s) de contrato publicadas. ` +
            `Para continuar de forma destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
      await queryRunner.query(
        `DELETE FROM legal_texts WHERE type = 'CONTRATO_SERVICIO' OR format = 'HTML'`,
      );
    }
    await queryRunner.query(`
      ALTER TABLE legal_texts
        DROP CONSTRAINT IF EXISTS ck_legal_texts_html_only_contract,
        DROP CONSTRAINT IF EXISTS ck_legal_texts_contract_approved,
        DROP CONSTRAINT IF EXISTS ck_legal_texts_approval_complete,
        DROP CONSTRAINT IF EXISTS ck_legal_texts_approval_declaration,
        DROP COLUMN IF EXISTS approved_at,
        DROP COLUMN IF EXISTS approved_by_user_id,
        DROP COLUMN IF EXISTS legal_approval_declaration
    `);
    await queryRunner.query(
      `ALTER TABLE legal_texts DROP CONSTRAINT IF EXISTS ck_legal_texts_format`,
    );
    await queryRunner.query(`
      ALTER TABLE legal_texts ADD CONSTRAINT legal_texts_format_check
        CHECK (format IN ('PLAIN', 'MARKDOWN'))
    `);
    await queryRunner.query(
      `ALTER TABLE legal_texts DROP CONSTRAINT IF EXISTS ck_legal_texts_type`,
    );
    await queryRunner.query(`
      ALTER TABLE legal_texts ADD CONSTRAINT ck_legal_texts_type
        CHECK (type IN ('POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD', 'AUTORIZACION'))
    `);
  }
}

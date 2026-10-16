import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';
const MARKER_TABLES = ['party', 'subscribers', 'expediente_records'] as const;

/**
 * Migración 150 — marca irreversible de anonimización del titular.
 * Schema tenant; enlaza Party, suscriptor y expediente con la solicitud sin FK hacia privacy.
 * `down()` exige `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true` cuando ya existen marcas,
 * porque quitar las columnas borraría el rastro de anonimización.
 */
export class TitularAnonymizationMarker1500000000000 implements MigrationInterface {
  name = 'TitularAnonymizationMarker1500000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE party
        ADD COLUMN anonymized_at timestamptz,
        ADD COLUMN anonymized_request_id uuid,
        ADD CONSTRAINT ck_party_anonymization_marker_pair
          CHECK ((anonymized_at IS NULL) = (anonymized_request_id IS NULL))
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        ADD COLUMN anonymized_at timestamptz,
        ADD COLUMN anonymized_request_id uuid,
        ADD CONSTRAINT ck_subscribers_anonymization_marker_pair
          CHECK ((anonymized_at IS NULL) = (anonymized_request_id IS NULL))
    `);
    await queryRunner.query(`
      ALTER TABLE expediente_records
        ADD COLUMN anonymized_at timestamptz,
        ADD COLUMN anonymized_request_id uuid,
        ADD CONSTRAINT ck_expediente_records_anonymization_marker_pair
          CHECK ((anonymized_at IS NULL) = (anonymized_request_id IS NULL))
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION titular_prevent_anonymization_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.anonymized_at IS NOT NULL AND (
          NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at OR
          NEW.anonymized_request_id IS DISTINCT FROM OLD.anonymized_request_id
        ) THEN
          RAISE EXCEPTION 'La marca de anonimización no se puede reescribir'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_party_anonymization_marker_immutable
        BEFORE UPDATE OF anonymized_at, anonymized_request_id ON party
        FOR EACH ROW EXECUTE FUNCTION titular_prevent_anonymization_rewrite()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_subscribers_anonymization_marker_immutable
        BEFORE UPDATE OF anonymized_at, anonymized_request_id ON subscribers
        FOR EACH ROW EXECUTE FUNCTION titular_prevent_anonymization_rewrite()
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_expediente_records_anonymization_marker_immutable
        BEFORE UPDATE OF anonymized_at, anonymized_request_id ON expediente_records
        FOR EACH ROW EXECUTE FUNCTION titular_prevent_anonymization_rewrite()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.assertDestructiveDownAllowed(queryRunner);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_party_anonymization_marker_immutable ON party
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_subscribers_anonymization_marker_immutable ON subscribers
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_expediente_records_anonymization_marker_immutable ON expediente_records
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS titular_prevent_anonymization_rewrite()`);
    await queryRunner.query(`
      ALTER TABLE party
        DROP CONSTRAINT IF EXISTS ck_party_anonymization_marker_pair,
        DROP COLUMN IF EXISTS anonymized_request_id,
        DROP COLUMN IF EXISTS anonymized_at
    `);
    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT IF EXISTS ck_subscribers_anonymization_marker_pair,
        DROP COLUMN IF EXISTS anonymized_request_id,
        DROP COLUMN IF EXISTS anonymized_at
    `);
    await queryRunner.query(`
      ALTER TABLE expediente_records
        DROP CONSTRAINT IF EXISTS ck_expediente_records_anonymization_marker_pair,
        DROP COLUMN IF EXISTS anonymized_request_id,
        DROP COLUMN IF EXISTS anonymized_at
    `);
  }

  private async assertDestructiveDownAllowed(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] === 'true') return;

    const populated: string[] = [];
    for (const table of MARKER_TABLES) {
      const rows = (await queryRunner.query(
        `SELECT COUNT(*)::int AS total FROM ${table}
         WHERE anonymized_at IS NOT NULL OR anonymized_request_id IS NOT NULL`,
      )) as Array<{ total: number }>;
      if ((rows[0]?.total ?? 0) > 0) populated.push(`${table}=${rows[0]?.total ?? 0}`);
    }

    if (populated.length > 0) {
      throw new Error(
        `Rollback de TitularAnonymizationMarker bloqueado: hay marcas de anonimización ` +
          `(${populated.join(', ')}). Para continuar de forma destructiva, exporte ` +
          `${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }
  }
}

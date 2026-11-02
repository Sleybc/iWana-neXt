import { MigrationInterface, QueryRunner } from 'typeorm';

const TRIGGER_TABLES = ['subscribers', 'expediente_records', 'contracts'] as const;

export class PreventAnonymizedCrmMutations1690000000000 implements MigrationInterface {
  name = 'PreventAnonymizedCrmMutations1690000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION titular_prevent_anonymized_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        titular_is_anonymized boolean := false;
      BEGIN
        IF current_setting('iwana.titular_erasure', true) = 'on' THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        IF TG_TABLE_NAME = 'contracts' THEN
          IF OLD.subscriber_id IS NOT NULL THEN
            SELECT anonymized_at IS NOT NULL
              INTO titular_is_anonymized
              FROM subscribers
             WHERE id = OLD.subscriber_id;
          END IF;
          IF NOT COALESCE(titular_is_anonymized, false) THEN
            IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
            RETURN NEW;
          END IF;

          IF TG_OP = 'UPDATE'
             AND OLD.status::text = 'TERMINATED'
             AND NEW.status::text = 'ARCHIVED'
             AND (to_jsonb(NEW) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at'])
                 IS NOT DISTINCT FROM
                 (to_jsonb(OLD) - ARRAY['status', 'status_reason_code', 'status_changed_at', 'updated_at']) THEN
            RETURN NEW;
          END IF;
        ELSIF OLD.anonymized_at IS NULL THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
          USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
      END;
      $function$
    `);

    for (const table of TRIGGER_TABLES) {
      await queryRunner.query(`
        CREATE TRIGGER trg_${table}_prevent_anonymized_mutation
        BEFORE UPDATE OR DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION titular_prevent_anonymized_mutation()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TRIGGER_TABLES) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS trg_${table}_prevent_anonymized_mutation ON ${table}`,
      );
    }
    await queryRunner.query('DROP FUNCTION IF EXISTS titular_prevent_anonymized_mutation()');
  }
}

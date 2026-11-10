import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 181 — guarda de `subscriber_note` (revisión de seguridad de 3fb15608, M-1 y M-2).
 *
 * - M-1: rechaza INSERT, UPDATE y DELETE cuando el suscriptor tiene `anonymized_at`
 *   (SQLSTATE 55000, HINT `PRIVACY_TITULAR_ANONYMIZED`, igual que la 169). El INSERT toma
 *   `FOR SHARE` sobre la fila del suscriptor para serializarse con la supresión.
 * - M-2: la tabla es de solo inserción; UPDATE y DELETE se rechazan siempre
 *   (SQLSTATE 55000, HINT `SUBSCRIBER_NOTE_APPEND_ONLY`).
 * - Excepción de supresión, mismo mecanismo que la 169: `iwana.titular_erasure = 'on'` en la
 *   transacción de la supresión del titular.
 * - Excepción K2: con `iwana.pii_reencrypt = 'on'` solo pasa un UPDATE que cambie únicamente
 *   `body_encrypted` (también en anonimizados); el resto falla con HINT `SUBSCRIBER_NOTE_REENCRYPT_ONLY`.
 *
 * `down()` retira el trigger y la función; no toca datos.
 */
export class SubscriberNoteGuard1810000000181 implements MigrationInterface {
  name = 'SubscriberNoteGuard1810000000181';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION subscriber_note_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $function$
      DECLARE
        target_subscriber uuid;
        titular_is_anonymized boolean := false;
      BEGIN
        IF current_setting('iwana.titular_erasure', true) = 'on' THEN
          IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
          RETURN NEW;
        END IF;

        IF current_setting('iwana.pii_reencrypt', true) = 'on' THEN
          IF TG_OP = 'UPDATE'
             AND NEW.id IS NOT DISTINCT FROM OLD.id
             AND NEW.subscriber_id IS NOT DISTINCT FROM OLD.subscriber_id
             AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
             AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
             AND (to_jsonb(NEW) - 'body_encrypted') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'body_encrypted') THEN
            RETURN NEW;
          END IF;
          RAISE EXCEPTION 'El recifrado solo puede cambiar body_encrypted de una nota.'
            USING ERRCODE = '55000', HINT = 'SUBSCRIBER_NOTE_REENCRYPT_ONLY';
        END IF;

        IF TG_OP = 'INSERT' THEN
          target_subscriber := NEW.subscriber_id;
        ELSE
          target_subscriber := OLD.subscriber_id;
        END IF;

        -- Schema del trigger, no el search_path de la sesión: la guarda no depende de él.
        EXECUTE format(
          'SELECT anonymized_at IS NOT NULL FROM %I.subscribers WHERE id = $1 FOR SHARE',
          TG_TABLE_SCHEMA
        )
          INTO titular_is_anonymized
          USING target_subscriber;

        IF COALESCE(titular_is_anonymized, false) THEN
          RAISE EXCEPTION 'La fila pertenece a un titular anonimizado y es de solo lectura.'
            USING ERRCODE = '55000', HINT = 'PRIVACY_TITULAR_ANONYMIZED';
        END IF;

        IF TG_OP = 'INSERT' THEN
          RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Las notas del suscriptor son de solo inserción.'
          USING ERRCODE = '55000', HINT = 'SUBSCRIBER_NOTE_APPEND_ONLY';
      END;
      $function$
    `);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_subscriber_note_guard ON subscriber_note`);
    await queryRunner.query(`
      CREATE TRIGGER trg_subscriber_note_guard
      BEFORE INSERT OR UPDATE OR DELETE ON subscriber_note
      FOR EACH ROW EXECUTE FUNCTION subscriber_note_guard()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_subscriber_note_guard ON subscriber_note`);
    await queryRunner.query('DROP FUNCTION IF EXISTS subscriber_note_guard()');
  }
}

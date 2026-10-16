import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 149 — registro de la supresión ejecutada (Fase 1b, R2).
 *
 * Agrega `erased_at` y `erasure_categories` a `data_subject_requests`, con
 * tres checks de alcance (solo SUPRIMIR+RESUELTA, par nulo/vacío y categorías
 * conocidas) y un trigger `privacy_prevent_erasure_rewrite` (patrón de
 * `privacy_prevent_verified_identity_change`, ERRCODE 55000): una vez fijada
 * la supresión, sus columnas no se pueden reescribir. Sin otras tablas.
 * Reversible: el `down` retira trigger, función, checks y columnas.
 */
export class PrivacyErasureRecord1490000000000 implements MigrationInterface {
  name = 'PrivacyErasureRecord1490000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        ADD COLUMN IF NOT EXISTS erased_at timestamptz,
        ADD COLUMN IF NOT EXISTS erasure_categories text[] NOT NULL DEFAULT '{}'
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        ADD CONSTRAINT ck_data_subject_requests_erasure_scope
          CHECK (erased_at IS NULL OR ("right" = 'SUPRIMIR' AND status = 'RESUELTA')),
        ADD CONSTRAINT ck_data_subject_requests_erasure_categories_pair
          CHECK (erased_at IS NOT NULL OR cardinality(erasure_categories) = 0),
        ADD CONSTRAINT ck_data_subject_requests_erasure_categories_known
          CHECK (erasure_categories <@ ARRAY['IDENTIFICACION','CONTACTO','UBICACION','FISCAL',
            'COMERCIAL','EVIDENCIA_CONSENTIMIENTO','CUENTA_USUARIO','EVIDENCIA_DOCUMENTAL',
            'OPERACION_CAMPO']::text[])
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION privacy_prevent_erasure_rewrite()
      RETURNS trigger LANGUAGE plpgsql AS $function$
      BEGIN
        IF OLD.erased_at IS NOT NULL AND (
          NEW.erased_at IS DISTINCT FROM OLD.erased_at OR
          NEW.erasure_categories IS DISTINCT FROM OLD.erasure_categories
        ) THEN
          RAISE EXCEPTION 'La supresión ejecutada no se puede reescribir'
            USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
      END;
      $function$
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_data_subject_requests_erasure_immutable ON data_subject_requests
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_data_subject_requests_erasure_immutable
        BEFORE UPDATE OF erased_at, erasure_categories
        ON data_subject_requests
        FOR EACH ROW EXECUTE FUNCTION privacy_prevent_erasure_rewrite()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_data_subject_requests_erasure_immutable ON data_subject_requests
    `);
    await queryRunner.query(`DROP FUNCTION IF EXISTS privacy_prevent_erasure_rewrite()`);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        DROP CONSTRAINT IF EXISTS ck_data_subject_requests_erasure_categories_known,
        DROP CONSTRAINT IF EXISTS ck_data_subject_requests_erasure_categories_pair,
        DROP CONSTRAINT IF EXISTS ck_data_subject_requests_erasure_scope
    `);
    await queryRunner.query(`
      ALTER TABLE data_subject_requests
        DROP COLUMN IF EXISTS erasure_categories,
        DROP COLUMN IF EXISTS erased_at
    `);
  }
}

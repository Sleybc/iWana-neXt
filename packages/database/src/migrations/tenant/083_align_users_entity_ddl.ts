import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 083 — MOD04 Ola C / H-03: cierra drift entidad↔DDL de `users`.
 *
 * Aplica el DDL estructural que antes vivía en la huérfana `005_simplify_user_fields`
 * (retirada 2026-07-22; nunca estuvo en TENANT_MIGRATIONS): estrecha longitudes,
 * UNIQUE(email) e índices de nombre.
 *
 * - Idempotente: solo altera si el estado actual difiere del contrato objetivo.
 * - No edita `000_initial_tenant_schema`.
 * - No descifra datos (el backfill de texto plano queda como evidencia H-14).
 * - Reversible up/down (vuelve a VARCHAR(512) + drop constraint/índices).
 * - Convergencia: tenant nuevo (000→…→083) y preexistente (083 alone) → mismo contrato.
 *
 * Contrato objetivo (alineado a `user.entity.ts`):
 * - email VARCHAR(255) + UNIQUE uq_users_email
 * - first_name / last_name VARCHAR(100) + idx_users_first_name / idx_users_last_name
 * - document_number VARCHAR(30)
 */
export class AlignUsersEntityDdl0830000000000 implements MigrationInterface {
  name = 'AlignUsersEntityDdl0830000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Estrechar tipos solo si aún son más anchos; falla si hay valores fuera de rango.
    await queryRunner.query(`
      DO $$
      DECLARE
        email_len int;
        first_len int;
        last_len int;
        doc_len int;
        overflow_count bigint;
      BEGIN
        SELECT character_maximum_length INTO email_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'email';

        SELECT character_maximum_length INTO first_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'first_name';

        SELECT character_maximum_length INTO last_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'last_name';

        SELECT character_maximum_length INTO doc_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'document_number';

        IF email_len IS DISTINCT FROM 255 THEN
          SELECT COUNT(*) INTO overflow_count FROM users WHERE length(email) > 255;
          IF overflow_count > 0 THEN
            RAISE EXCEPTION
              '083: % fila(s) con email > 255 en schema % — no se puede estrechar',
              overflow_count, current_schema();
          END IF;
          ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
        END IF;

        IF first_len IS DISTINCT FROM 100 THEN
          SELECT COUNT(*) INTO overflow_count
            FROM users WHERE first_name IS NOT NULL AND length(first_name) > 100;
          IF overflow_count > 0 THEN
            RAISE EXCEPTION
              '083: % fila(s) con first_name > 100 en schema % — no se puede estrechar',
              overflow_count, current_schema();
          END IF;
          ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(100);
        END IF;

        IF last_len IS DISTINCT FROM 100 THEN
          SELECT COUNT(*) INTO overflow_count
            FROM users WHERE last_name IS NOT NULL AND length(last_name) > 100;
          IF overflow_count > 0 THEN
            RAISE EXCEPTION
              '083: % fila(s) con last_name > 100 en schema % — no se puede estrechar',
              overflow_count, current_schema();
          END IF;
          ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(100);
        END IF;

        IF doc_len IS DISTINCT FROM 30 THEN
          SELECT COUNT(*) INTO overflow_count
            FROM users WHERE document_number IS NOT NULL AND length(document_number) > 30;
          IF overflow_count > 0 THEN
            RAISE EXCEPTION
              '083: % fila(s) con document_number > 30 en schema % — no se puede estrechar',
              overflow_count, current_schema();
          END IF;
          ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(30);
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        dup_count bigint;
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'uq_users_email'
             AND conrelid = 'users'::regclass
        ) THEN
          SELECT COUNT(*) INTO dup_count
            FROM (
              SELECT lower(email) AS e
                FROM users
               GROUP BY lower(email)
              HAVING COUNT(*) > 1
            ) d;
          IF dup_count > 0 THEN
            RAISE EXCEPTION
              '083: % email(s) duplicado(s) en schema % — no se puede crear uq_users_email',
              dup_count, current_schema();
          END IF;
          ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);
        END IF;
      END
      $$;
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_users_first_name ON users (first_name)`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_last_name ON users (last_name)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_last_name`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_first_name`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'uq_users_email'
             AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users DROP CONSTRAINT uq_users_email;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      DECLARE
        email_len int;
        first_len int;
        last_len int;
        doc_len int;
      BEGIN
        SELECT character_maximum_length INTO email_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'email';
        SELECT character_maximum_length INTO first_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'first_name';
        SELECT character_maximum_length INTO last_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'last_name';
        SELECT character_maximum_length INTO doc_len
          FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'document_number';

        IF email_len IS DISTINCT FROM 512 THEN
          ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(512);
        END IF;
        IF first_len IS DISTINCT FROM 512 THEN
          ALTER TABLE users ALTER COLUMN first_name TYPE VARCHAR(512);
        END IF;
        IF last_len IS DISTINCT FROM 512 THEN
          ALTER TABLE users ALTER COLUMN last_name TYPE VARCHAR(512);
        END IF;
        IF doc_len IS DISTINCT FROM 512 THEN
          ALTER TABLE users ALTER COLUMN document_number TYPE VARCHAR(512);
        END IF;
      END
      $$;
    `);
  }
}

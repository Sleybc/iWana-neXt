import { MigrationInterface, QueryRunner } from 'typeorm';

const NATURAL_WITH_DOCUMENT = `person_type = 'NATURAL' AND document_type IS NOT NULL AND document_number_encrypted IS NOT NULL AND first_name IS NOT NULL AND last_name IS NOT NULL AND stratum IS NOT NULL`;
const NATURAL_DOCUMENT_OR_ANONYMIZED = `person_type = 'NATURAL' AND document_type IS NOT NULL AND (document_number_encrypted IS NOT NULL OR anonymized_at IS NOT NULL) AND first_name IS NOT NULL AND last_name IS NOT NULL AND stratum IS NOT NULL`;
const JURIDICA_FIELDS = `person_type = 'JURIDICA' AND nit IS NOT NULL AND business_name IS NOT NULL`;

/**
 * Migracion 176: un titular anonimizado no conserva cifrado en `subscribers`
 * (spec K2 de anonimizados, D-K2A-2).
 *
 * `up` admite `document_number_encrypted` en NULL solo con `anonymized_at` fijado; una
 * fila NATURAL sin anonimizar sigue rechazada. No modifica filas ni toca la funcion de
 * la 169: el borrado es quien deja el NULL.
 *
 * `down` restaura el CHECK original con NOT VALID y sin tocar datos: SQL no puede
 * recrear un cifrado sin la clave. Una fila anonimizada en NULL impide validar la
 * restriccion (23514) hasta que vuelva a aplicarse esta migracion.
 */
export class SubscriberDocumentNullWhenAnonymized1760000000176 implements MigrationInterface {
  name = 'SubscriberDocumentNullWhenAnonymized1760000000176';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT chk_subscriber_person_fields,
        ADD CONSTRAINT chk_subscriber_person_fields CHECK (
          (${NATURAL_DOCUMENT_OR_ANONYMIZED})
          OR
          (${JURIDICA_FIELDS})
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE subscribers
        DROP CONSTRAINT chk_subscriber_person_fields,
        ADD CONSTRAINT chk_subscriber_person_fields CHECK (
          (${NATURAL_WITH_DOCUMENT})
          OR
          (${JURIDICA_FIELDS})
        ) NOT VALID
    `);
  }
}

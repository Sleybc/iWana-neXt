import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 014: Agregar columnas hash para búsqueda determinista sin descifrar.
 *
 * Permite buscar suscriptores por documento, email y teléfono sin necesidad
 * de descifrar todos los registros en memoria.
 *
 * - document_number_hash: SHA-256 del número de documento en texto plano
 * - email_hash: SHA-256 del email en texto plano
 * - phone_hash: SHA-256 del teléfono en texto plano
 *
 * Estos hashes se generan al crear/actualizar el subscriber y se usan
 * para búsquedas deterministas con índices B-tree.
 */
export class AddSubscriberHashColumns1700000000014 implements MigrationInterface {
  name = 'AddSubscriberHashColumns1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columnas hash
    await queryRunner.query(`
      ALTER TABLE subscribers
      ADD COLUMN document_number_hash VARCHAR(64) NULL,
      ADD COLUMN email_hash VARCHAR(64) NULL,
      ADD COLUMN phone_hash VARCHAR(64) NULL
    `);

    // Índices para búsqueda determinista
    await queryRunner.query(`
      CREATE INDEX idx_subscribers_doc_hash ON subscribers (document_number_hash)
      WHERE document_number_hash IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_subscribers_email_hash ON subscribers (email_hash)
      WHERE email_hash IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_subscribers_phone_hash ON subscribers (phone_hash)
      WHERE phone_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_phone_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_email_hash`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_subscribers_doc_hash`);

    // Eliminar columnas
    await queryRunner.query(`
      ALTER TABLE subscribers
      DROP COLUMN IF EXISTS document_number_hash,
      DROP COLUMN IF EXISTS email_hash,
      DROP COLUMN IF EXISTS phone_hash
    `);
  }
}

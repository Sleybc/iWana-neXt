import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 087: hash determinista de documento en expediente_records (D-4 / O-6).
 *
 * Permite filtrar por `documentNumber` con WHERE + índice, sin scan AES en memoria.
 * Espejo de `subscribers.document_number_hash` (migración 014).
 *
 * - Columna `document_number_hash VARCHAR(64) NULL`
 * - Índice parcial `WHERE document_number_hash IS NOT NULL`
 * - `transactional = true` (DDL estándar; no CONCURRENTLY — ADR-066)
 *
 * El schema solo no rellena hashes legacy: filas con ciphertext y hash NULL
 * se rellenan en la migración 088 (`BackfillExpedienteDocumentNumberHash088…`).
 * `ExpedienteService.backfillDocumentNumberHashes` permanece como reintento ops.
 */
export class AddExpedienteDocumentNumberHash0870000000000 implements MigrationInterface {
  name = 'AddExpedienteDocumentNumberHash0870000000000';

  /** Default ADR-066: ejecutar dentro de transacción del runner. */
  transactional = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE expediente_records
      ADD COLUMN document_number_hash VARCHAR(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX idx_expediente_doc_hash ON expediente_records (document_number_hash)
      WHERE document_number_hash IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expediente_doc_hash`);

    await queryRunner.query(`
      ALTER TABLE expediente_records
      DROP COLUMN IF EXISTS document_number_hash
    `);
  }
}

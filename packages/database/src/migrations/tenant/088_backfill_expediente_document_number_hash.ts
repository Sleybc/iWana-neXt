import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillExpedienteDocumentNumberHashes } from '../shared/backfill-expediente-document-number-hash.util';

/**
 * Migración 088: backfill de `document_number_hash` en expediente_records (R-3 / D-4).
 *
 * Depende de 087 (columna + índice parcial). Idempotente:
 * solo filas `document_number_hash IS NULL AND document_number_encrypted IS NOT NULL`.
 *
 * - Descifrado AES-256-GCM + SHA-256 en Node (misma semántica que ExpedienteService).
 * - Por lotes keyset; `transactional = true` (DML; no CONCURRENTLY).
 * - Umbral ~50.000 filas por tenant: considerar `transactional = false` + commit
 *   por lote (ADR-066). Hoy se mantiene `transactional = true`.
 * - Cero PII en logs (solo id de fila ante fallo de decrypt).
 *
 * DOWN: no-op documentado — el backfill no destruye ciphertext; revertir el hash
 * a NULL dejaría la búsqueda por documento rota sin ganancia de seguridad.
 *
 * Requiere `MFA_ENCRYPTION_KEY` (y opcionalmente `MFA_ENCRYPTION_KEY_PREVIOUS`)
 * en el entorno del runner de migraciones tenant.
 */
export class BackfillExpedienteDocumentNumberHash0880000000000 implements MigrationInterface {
  name = 'BackfillExpedienteDocumentNumberHash0880000000000';

  /** Default ADR-066: DML dentro de transacción del runner. */
  transactional = true;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const result = await backfillExpedienteDocumentNumberHashes(queryRunner, {
      warn: (message) => {
        // TypeORM MigrationInterface no expone logger tipado; stderr sin PII.
        process.stderr.write(`${message}\n`);
      },
    });

    process.stderr.write(
      `088 backfill document_number_hash: processed=${result.processed} updated=${result.updated} skipped=${result.skipped}\n`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: el backfill es aditivo sobre ciphertext existente.
    // No se hace SET document_number_hash = NULL (rompería listados por documento).
  }
}

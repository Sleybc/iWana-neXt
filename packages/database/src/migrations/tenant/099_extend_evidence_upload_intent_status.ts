import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

/**
 * Migración 099: completa el CHECK de `execution_order_evidence_upload_intents`.
 *
 * La migración 095 fijó el CHECK con los cuatro estados del recibo PÚBLICO
 * (`PENDING_ANALYSIS`, `AVAILABLE`, `REJECTED`, `EXPIRED`), que son el ciclo de
 * análisis del asset en Media/Assets. Pero el intento existe antes que el asset
 * — ADR-068 §48: "MOD11 crea un upload-intent tenant-aware con `intentId`;
 * Media/Assets genera `mediaAssetId`" — y MOD11 persiste esas dos fases previas:
 *
 * - `PENDING`: clave reservada, binario todavía no subido.
 * - `FAILED`:  la subida a Media falló de forma definitiva.
 *
 * Ambas implican `media_asset_id IS NULL`, así que no alcanzan el contrato
 * público: `toEvidenceAssetReceipt` responde 409 ante cualquier intento sin
 * `media_asset_id`. El contrato de `@iwana/shared` no cambia.
 *
 * Los literales van escritos a mano y no importados de la entidad: una
 * migración es una foto inmutable del schema y no puede cambiar de significado
 * porque alguien edite una constante.
 *
 * No se toca la 095: ya está aplicada en bases existentes.
 *
 * Schema: tenant
 * Reversible: sí (down exige el flag destructivo si hay intents transitorios)
 */
export class ExtendEvidenceUploadIntentStatus0990000000000 implements MigrationInterface {
  name = 'ExtendEvidenceUploadIntentStatus0990000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE execution_order_evidence_upload_intents
        DROP CONSTRAINT IF EXISTS chk_execution_order_evidence_upload_intents_status
    `);

    await queryRunner.query(`
      ALTER TABLE execution_order_evidence_upload_intents
        ADD CONSTRAINT chk_execution_order_evidence_upload_intents_status
        CHECK (status IN (
          'PENDING',
          'PENDING_ANALYSIS',
          'AVAILABLE',
          'REJECTED',
          'EXPIRED',
          'FAILED'
        ))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Volver al CHECK de cuatro estados obliga a que no quede ninguna fila en
    // los dos estados transitorios. Esas filas no las creó la migración: las
    // creó la operación del tenant, así que borrarlas exige intención explícita.
    const rows = ((await queryRunner.query(
      `SELECT COUNT(*)::int AS total
       FROM execution_order_evidence_upload_intents
       WHERE status IN ('PENDING', 'FAILED')`,
    )) ?? []) as Array<{ total: number }>;
    const total = rows[0]?.total ?? 0;

    if (total > 0 && process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      throw new Error(
        `Rollback de ExtendEvidenceUploadIntentStatus bloqueado: ` +
          `${total} intent(s) siguen en PENDING o FAILED y el CHECK anterior los rechaza. ` +
          `Para continuar de forma destructiva, ` +
          `exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true de forma explícita.`,
      );
    }

    if (total > 0) {
      // Solo se borran reservas sin binario vinculado. Si alguna fila violara
      // ese invariante, sobrevive al DELETE y hace fallar el ADD CONSTRAINT de
      // abajo — preferible a destruir en silencio una evidencia enlazada.
      await queryRunner.query(
        `DELETE FROM execution_order_evidence_upload_intents
         WHERE status IN ('PENDING', 'FAILED') AND media_asset_id IS NULL`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE execution_order_evidence_upload_intents
        DROP CONSTRAINT IF EXISTS chk_execution_order_evidence_upload_intents_status
    `);

    await queryRunner.query(`
      ALTER TABLE execution_order_evidence_upload_intents
        ADD CONSTRAINT chk_execution_order_evidence_upload_intents_status
        CHECK (status IN ('PENDING_ANALYSIS', 'AVAILABLE', 'REJECTED', 'EXPIRED'))
    `);
  }
}

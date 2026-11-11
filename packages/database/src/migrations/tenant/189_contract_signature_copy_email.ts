import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración 189 — copia del contrato firmado al correo del titular (cierre de venta,
 * bloque G; spec §5 G, CA-9).
 *
 * Schema tenant. Añade a `contract_signatures` el resultado del envío de la copia, que hace
 * idempotente el trabajo por firma: con `copy_email_status` ya escrito no se vuelve a enviar.
 * - `SENT`: el correo salió con el PDF adjunto.
 * - `NO_EMAIL`: el titular no tiene correo registrado; no se envía y queda constancia.
 * - `TITULAR_RESTRICTED`: titular bloqueado o anonimizado; no se envía.
 * Sin datos personales: ni el correo ni el destinatario se guardan.
 *
 * `down()` elimina las columnas (solo constancia operativa; no hay evidencia que perder).
 */
export class ContractSignatureCopyEmail1890000000189 implements MigrationInterface {
  name = 'ContractSignatureCopyEmail1890000000189';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_signatures
        ADD COLUMN IF NOT EXISTS copy_email_status varchar(24) NULL,
        ADD COLUMN IF NOT EXISTS copy_email_processed_at timestamptz NULL
    `);
    await queryRunner.query(`
      ALTER TABLE contract_signatures
        DROP CONSTRAINT IF EXISTS chk_cs_copy_email
    `);
    await queryRunner.query(`
      ALTER TABLE contract_signatures
        ADD CONSTRAINT chk_cs_copy_email CHECK (
          (copy_email_status IS NULL) = (copy_email_processed_at IS NULL)
          AND (copy_email_status IS NULL
               OR copy_email_status IN ('SENT', 'NO_EMAIL', 'TITULAR_RESTRICTED'))
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_signatures DROP CONSTRAINT IF EXISTS chk_cs_copy_email
    `);
    await queryRunner.query(`
      ALTER TABLE contract_signatures
        DROP COLUMN IF EXISTS copy_email_processed_at,
        DROP COLUMN IF EXISTS copy_email_status
    `);
  }
}

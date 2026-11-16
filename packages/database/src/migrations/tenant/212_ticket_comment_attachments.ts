import { MigrationInterface, QueryRunner } from 'typeorm';

const DESTRUCTIVE_DOWN_ENV_VAR = 'IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN';

const MIB = 1024 * 1024;
/** Fotos y PDF: 25 MB; MP4: 100 MB (`TICKET_ATTACHMENT_MAX_BYTES_BY_CONTENT_TYPE`). */
const DOCUMENT_MAX_BYTES = 25 * MIB;
const VIDEO_MAX_BYTES = 100 * MIB;

/**
 * Migración 212 — adjuntos de comentarios de tickets (spec MOD09 2026-11-16 «adjuntos en
 * tickets» §2.1, §2.3 y §2.4).
 *
 * - `ticket_comment_attachments`: una fila por archivo de un comentario. El archivo vive en
 *   `public.media_assets` (uso `ticket_attachment`, migración public 032); `media_asset_id` no
 *   lleva FK porque cruza de schema (ADR-068), y es único por tenant.
 * - FK compuesta `(comment_id, ticket_id)` → `ticket_comments (id, ticket_id)`: el adjunto
 *   pertenece al comentario y a su ticket. Para ello `ticket_comments` gana
 *   `uq_ticket_comments_id_ticket UNIQUE (id, ticket_id)`. `ON DELETE RESTRICT`: quien retira un
 *   comentario (reversión del lote, supresión) retira antes sus adjuntos y sus archivos; un
 *   CASCADE dejaría objetos huérfanos en el almacenamiento.
 * - Tipos y límites por tipo, y nombre sin rutas ni caracteres de control, también en CHECK
 *   (defensa: la API ya valida firma y sanea el nombre).
 * - `external_id` (`uisp:ticket_attachment:<id>`) único parcial por tenant; `import_batch_id`
 *   sin FK, como el resto de filas importadas (196).
 * - Sin RLS: el aislamiento de las tablas tenant es por schema y `search_path` por transacción,
 *   como en las tablas hermanas de Soporte (031).
 *
 * `down()` borra la tabla y la restricción única del comentario. Si hay adjuntos, lo bloquea
 * salvo `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN=true`: no hay backfill que reconstruya las filas y
 * sus archivos quedarían sin referencia en el almacenamiento.
 */
export class TicketCommentAttachments2120000000212 implements MigrationInterface {
  name = 'TicketCommentAttachments2120000000212';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'uq_ticket_comments_id_ticket'
             AND conrelid = 'ticket_comments'::regclass
        ) THEN
          ALTER TABLE ticket_comments
            ADD CONSTRAINT uq_ticket_comments_id_ticket UNIQUE (id, ticket_id);
        END IF;
      END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ticket_comment_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        ticket_id uuid NOT NULL,
        comment_id uuid NOT NULL,
        media_asset_id uuid NOT NULL,
        filename varchar(200) NOT NULL,
        content_type varchar(100) NOT NULL,
        size_bytes integer NOT NULL,
        uploaded_by_user_id uuid NOT NULL,
        external_id varchar(160) NULL,
        import_batch_id uuid NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_ticket_comment_attachments_comment
          FOREIGN KEY (comment_id, ticket_id)
          REFERENCES ticket_comments (id, ticket_id) ON DELETE RESTRICT,
        CONSTRAINT uq_ticket_comment_attachments_media_asset
          UNIQUE (tenant_id, media_asset_id),
        CONSTRAINT chk_ticket_comment_attachments_content_type
          CHECK (content_type IN ('image/jpeg','image/png','image/webp','image/gif',
                                  'application/pdf','video/mp4')),
        CONSTRAINT chk_ticket_comment_attachments_size
          CHECK (size_bytes > 0
                 AND size_bytes <= CASE WHEN content_type = 'video/mp4'
                                        THEN ${VIDEO_MAX_BYTES} ELSE ${DOCUMENT_MAX_BYTES} END),
        CONSTRAINT chk_ticket_comment_attachments_filename
          CHECK (length(btrim(filename)) > 0
                 AND filename !~ '[/\\\\[:cntrl:]]'),
        CONSTRAINT chk_ticket_comment_attachments_external_id
          CHECK (external_id IS NULL OR length(external_id) > 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_comment_attachments_ticket
        ON ticket_comment_attachments (tenant_id, ticket_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_comment_attachments_comment
        ON ticket_comment_attachments (comment_id)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_comment_attachments_external_id
        ON ticket_comment_attachments (tenant_id, external_id)
        WHERE external_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_ticket_comment_attachments_import_batch
        ON ticket_comment_attachments (import_batch_id)
        WHERE import_batch_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (process.env[DESTRUCTIVE_DOWN_ENV_VAR] !== 'true') {
      const [row] = (await queryRunner.query(`
        SELECT (CASE WHEN to_regclass('ticket_comment_attachments') IS NULL THEN 0
                     ELSE (SELECT COUNT(*) FROM ticket_comment_attachments) END)::int AS total
      `)) as Array<{ total: number }>;
      if ((row?.total ?? 0) > 0) {
        throw new Error(
          `Migración 212 down bloqueada: hay ${row?.total} adjunto(s) de comentarios de tickets. ` +
            `Para una reversión destructiva, exporte ${DESTRUCTIVE_DOWN_ENV_VAR}=true.`,
        );
      }
    }
    await queryRunner.query(`DROP TABLE IF EXISTS ticket_comment_attachments`);
    await queryRunner.query(`
      ALTER TABLE ticket_comments DROP CONSTRAINT IF EXISTS uq_ticket_comments_id_ticket
    `);
  }
}

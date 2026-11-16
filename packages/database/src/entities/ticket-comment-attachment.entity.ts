import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Entidad TicketCommentAttachment — schema por tenant (dinámico vía search_path).
 *
 * Archivo adjunto a un comentario de ticket (spec MOD09 2026-11-16 «adjuntos en tickets»
 * §2.1; migración tenant 212). Hereda la visibilidad del comentario (`is_internal`).
 * Append-only: sin UpdateDateColumn ni soft-delete; solo la supresión del titular o la
 * reversión de un lote importado retiran filas (y antes sus archivos).
 *
 * El archivo vive en `public.media_assets` con uso `ticket_attachment`; el estado visible
 * (`IN_REVIEW` / `AVAILABLE` / `BLOCKED`) se deriva de `media_assets.asset_status` con
 * `ticketAttachmentStatusFromMediaStatus` de `@iwana/shared`, no se persiste aquí.
 */
@Index('idx_ticket_comment_attachments_ticket', ['tenantId', 'ticketId'])
@Index('idx_ticket_comment_attachments_comment', ['commentId'])
@Entity({ name: 'ticket_comment_attachments' })
export class TicketCommentAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Ticket del comentario (FK compuesta con `comment_id`). */
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  /** FK a `ticket_comments.id` (ON DELETE RESTRICT). */
  @Column({ name: 'comment_id', type: 'uuid' })
  commentId: string;

  /** `public.media_assets.id`; sin FK por cruzar de schema (ADR-068). Único por tenant. */
  @Column({ name: 'media_asset_id', type: 'uuid' })
  mediaAssetId: string;

  /** Nombre saneado (≤ 200, sin rutas ni controles). Texto libre del titular: supresión. */
  @Column({ type: 'varchar', length: 200 })
  filename: string;

  /** MIME por firma real: `TICKET_ATTACHMENT_CONTENT_TYPES`. */
  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'integer' })
  sizeBytes: number;

  /** Quien subió el archivo; en la importación, el autor resuelto del comentario o quien importa. */
  @Column({ name: 'uploaded_by_user_id', type: 'uuid' })
  uploadedByUserId: string;

  /** `uisp:ticket_attachment:<id>` en adjuntos importados; null en los subidos en iWana. */
  @Column({ name: 'external_id', type: 'varchar', length: 160, nullable: true })
  externalId: string | null;

  /** Lote de importación que lo creó (sin FK, como el resto de filas importadas). */
  @Column({ name: 'import_batch_id', type: 'uuid', nullable: true })
  importBatchId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

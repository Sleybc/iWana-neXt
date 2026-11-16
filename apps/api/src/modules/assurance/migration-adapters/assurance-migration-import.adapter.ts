import { Injectable } from '@nestjs/common';
import {
  isTicketAttachmentContentType,
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  type MigrationRevertBlocker,
  type MigrationTicketAttachmentSkipReason,
} from '@iwana/shared';
import {
  MigrationSupportImportPort,
  type ImportedTicketAttachmentInput,
  type ImportedTicketAttachmentResult,
  type ImportedAuthorsRefreshContext,
  type ImportedTicketAuthors,
  type ImportedTicketAuthorsResult,
  type ImportedTicketCreated,
  type ImportedTicketInput,
  type MigrationBatchEntityIds,
  type MigrationReadContext,
  type MigrationWriteContext,
} from '../../migration/ports/migration-import.ports';
import { matchImportedComments } from './imported-comment-matching';
import {
  TicketAttachmentMediaPort,
  type TicketAttachmentRejectionCode,
} from '../ports/ticket-attachment-media.port';

/** Motivo del informe del lote por cada rechazo de la validación de medios. */
const SKIP_REASON_BY_REJECTION: Readonly<
  Record<TicketAttachmentRejectionCode, MigrationTicketAttachmentSkipReason>
> = {
  ARCHIVO_VACIO: 'ARCHIVO_AUSENTE',
  TIPO_NO_PERMITIDO: 'TIPO_NO_PERMITIDO',
  FIRMA_NO_COINCIDE: 'TIPO_NO_PERMITIDO',
  TAMANO_EXCEDIDO: 'TAMANO_EXCEDIDO',
};

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return Array.isArray(result) ? (result as T[]) : [];
}

/**
 * Adaptador de Soporte (MOD09) de la importación desde UISP (ADR-110 D3, D7; spec §3.2).
 * Crea tickets históricos con `source = 'MIGRATION'`, número `UISP-<id>` (no consume la
 * numeración `TK-`) y sus comentarios; el comentario no público de UISP queda interno.
 */
@Injectable()
export class AssuranceMigrationImportAdapter extends MigrationSupportImportPort {
  /** Obligatorio: sin el puerto de medios la API no arranca (lo exporta `MediaModule`). */
  constructor(private readonly media: TicketAttachmentMediaPort) {
    super();
  }

  async findTickets(
    ctx: MigrationReadContext,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (externalIds.length === 0) return result;
    const rows = (await ctx.manager.query(
      `SELECT id::text, external_id FROM support_tickets
        WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
      [ctx.tenantId, externalIds],
    )) as Array<{ id: string; external_id: string }>;
    for (const row of rows) result.set(row.external_id, row.id);
    return result;
  }

  async findAttachments(ctx: MigrationReadContext, externalIds: string[]): Promise<Set<string>> {
    const result = new Set<string>();
    if (externalIds.length === 0) return result;
    const rows = rowsOf<{ external_id: string }>(
      await ctx.manager.query(
        `SELECT external_id FROM ticket_comment_attachments
          WHERE tenant_id = $1 AND external_id = ANY($2::varchar[])`,
        [ctx.tenantId, externalIds],
      ),
    );
    for (const row of rows) result.add(row.external_id);
    return result;
  }

  async createImportedTicket(
    ctx: MigrationWriteContext,
    input: ImportedTicketInput,
  ): Promise<ImportedTicketCreated> {
    const closed = input.status === 'CLOSED';
    const rows = (await ctx.manager.query(
      `INSERT INTO support_tickets (
         tenant_id, ticket_number, type, status, source, subject, requester_type,
         requester_ref_id, subject_type, subject_ref_id, created_by_user_id, created_at,
         closed_at, external_id, import_batch_id, assigned_user_id)
       VALUES ($1, $2, 'CUSTOMER_INCIDENT', $3::ticket_status, 'MIGRATION', $4, 'SUBSCRIBER',
         $5, 'SUBSCRIBER', $5, $6, COALESCE($7::timestamptz, now()),
         CASE WHEN $8 THEN COALESCE($7::timestamptz, now()) END, $9, $10, $11::uuid)
       RETURNING id::text`,
      [
        ctx.tenantId,
        `UISP-${input.sourceId}`.slice(0, 30),
        input.status,
        (input.subject.trim() || 'Ticket importado').slice(0, 200),
        input.subscriberId,
        input.createdByUserId ?? ctx.actorId,
        input.createdAt,
        closed,
        input.externalId,
        ctx.batchId,
        // Asignación histórica por SQL: no pasa por TicketsService, no notifica ni emite eventos.
        input.assignedUserId ?? null,
      ],
    )) as Array<{ id: string }>;
    const ticketId = rows[0]!.id;
    const commentIds: Array<string | null> = [];
    // El mapeo solo entrega texto vacío en comentarios con adjuntos (D4): se insertan igual.
    for (const comment of input.comments) {
      const inserted = rowsOf<{ id: string }>(
        await ctx.manager.query(
          `INSERT INTO ticket_comments (ticket_id, tenant_id, body, is_internal, author_user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
           RETURNING id::text AS id`,
          [
            ticketId,
            ctx.tenantId,
            comment.body,
            comment.internal,
            comment.authorUserId ?? ctx.actorId,
            comment.createdAt,
          ],
        ),
      );
      commentIds.push(inserted[0]?.id ?? null);
    }
    return { ticketId, commentIds };
  }

  /**
   * «Actualizar autores» (spec «usuarios» §2.7). Solo tickets de este lote. El asignado se fija
   * solo si sigue vacío (la importación lo dejaba vacío); creador y autores, solo si siguen a
   * nombre de quien importó. Lo que alguien cambió después se respeta y se cuenta. Sin eventos,
   * timeline ni notificaciones; `updated_at` no cambia (es atribución histórica).
   */
  async refreshImportedAuthors(
    ctx: ImportedAuthorsRefreshContext,
    tickets: ImportedTicketAuthors[],
  ): Promise<ImportedTicketAuthorsResult> {
    const importers = new Set(ctx.importerIds);
    const result: ImportedTicketAuthorsResult = {
      tickets: 0,
      comments: 0,
      respected: 0,
      changes: [],
    };
    for (const item of tickets) {
      const rows = (await ctx.manager.query(
        `SELECT assigned_user_id::text AS assigned, created_by_user_id::text AS created_by
           FROM support_tickets
          WHERE id = $1 AND tenant_id = $2 AND import_batch_id = $3
          FOR UPDATE`,
        [item.ticketId, ctx.tenantId, ctx.batchId],
      )) as Array<{ assigned: string | null; created_by: string }>;
      const ticket = rows[0];
      if (!ticket) continue;
      let assigned: string | null = null;
      if (item.assignedUserId !== null && ticket.assigned !== item.assignedUserId) {
        if (ticket.assigned === null) assigned = item.assignedUserId;
        else result.respected += 1;
      }
      let createdBy: string | null = null;
      if (item.createdByUserId !== null && ticket.created_by !== item.createdByUserId) {
        if (importers.has(ticket.created_by)) createdBy = item.createdByUserId;
        else result.respected += 1;
      }
      if (assigned !== null || createdBy !== null) {
        await ctx.manager.query(
          `UPDATE support_tickets
              SET assigned_user_id = COALESCE($4::uuid, assigned_user_id),
                  created_by_user_id = COALESCE($5::uuid, created_by_user_id)
            WHERE id = $1 AND tenant_id = $2 AND import_batch_id = $3`,
          [item.ticketId, ctx.tenantId, ctx.batchId, assigned, createdBy],
        );
        result.tickets += 1;
        if (assigned !== null) {
          result.changes.push({
            entity: 'TICKET',
            id: item.ticketId,
            field: 'assigned_user_id',
            from: ticket.assigned,
            to: assigned,
          });
        }
        if (createdBy !== null) {
          result.changes.push({
            entity: 'TICKET',
            id: item.ticketId,
            field: 'created_by_user_id',
            from: ticket.created_by,
            to: createdBy,
          });
        }
      }

      if (!item.comments.some((comment) => comment.authorUserId !== null)) continue;
      const stored = (await ctx.manager.query(
        `SELECT id::text, body, created_at, author_user_id::text AS author
           FROM ticket_comments WHERE ticket_id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [item.ticketId, ctx.tenantId],
      )) as Array<{ id: string; body: string; created_at: Date; author: string }>;
      const matches = matchImportedComments(
        stored.map((row) => ({
          id: row.id,
          body: row.body,
          createdAt: row.created_at,
          authorUserId: row.author,
        })),
        item.comments,
        ctx.importerIds,
      );
      for (const match of matches) {
        if (match.current === match.target) continue;
        if (!importers.has(match.current)) {
          result.respected += 1;
          continue;
        }
        await ctx.manager.query(
          `UPDATE ticket_comments SET author_user_id = $3::uuid
            WHERE id = $1 AND tenant_id = $2`,
          [match.id, ctx.tenantId, match.target],
        );
        result.comments += 1;
        result.changes.push({
          entity: 'TICKET_COMMENT',
          id: match.id,
          field: 'author_user_id',
          from: match.current,
          to: match.target,
        });
        await this.refreshImportedAttachmentAuthors(ctx, match.id, match.target, importers, result);
      }
    }
    return result;
  }

  /**
   * M3: los adjuntos importados del comentario siguen a su autor. Solo los de este lote y solo
   * si siguen a nombre de quien importó; un cambio posterior se respeta y se cuenta.
   */
  private async refreshImportedAttachmentAuthors(
    ctx: ImportedAuthorsRefreshContext,
    commentId: string,
    target: string,
    importers: ReadonlySet<string>,
    result: ImportedTicketAuthorsResult,
  ): Promise<void> {
    const rows = rowsOf<{ id: string; uploaded_by: string }>(
      await ctx.manager.query(
        `SELECT id::text AS id, uploaded_by_user_id::text AS uploaded_by
           FROM ticket_comment_attachments
          WHERE tenant_id = $1 AND comment_id = $2 AND import_batch_id = $3
          FOR UPDATE`,
        [ctx.tenantId, commentId, ctx.batchId],
      ),
    );
    const changed: Array<{ id: string; from: string }> = [];
    for (const row of rows) {
      if (row.uploaded_by === target) continue;
      if (!importers.has(row.uploaded_by)) {
        result.respected += 1;
        continue;
      }
      changed.push({ id: row.id, from: row.uploaded_by });
    }
    if (changed.length === 0) return;
    await ctx.manager.query(
      `UPDATE ticket_comment_attachments SET uploaded_by_user_id = $3::uuid
        WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [ctx.tenantId, changed.map((row) => row.id), target],
    );
    for (const row of changed) {
      result.changes.push({
        entity: 'TICKET_COMMENT_ATTACHMENT',
        id: row.id,
        field: 'uploaded_by_user_id',
        from: row.from,
        to: target,
      });
    }
  }

  async revertBlockers(
    ctx: MigrationReadContext,
    batchId: string,
    ids: MigrationBatchEntityIds,
  ): Promise<MigrationRevertBlocker[]> {
    const refs = [...ids.subscriberIds, ...ids.contractIds];
    if (refs.length === 0) return [];
    const rows = (await ctx.manager.query(
      `SELECT
         (SELECT COUNT(*) FROM support_tickets
           WHERE tenant_id = $1 AND import_batch_id IS DISTINCT FROM $3
             AND (requester_ref_id = ANY($2::varchar[]) OR subject_ref_id = ANY($2::varchar[])))::int
           AS tickets,
         ((SELECT COUNT(*) FROM support_tickets
            WHERE tenant_id = $1 AND import_batch_id = $3 AND work_order_id IS NOT NULL)
        + (SELECT COUNT(*) FROM ticket_work_order_links l
             JOIN support_tickets t ON t.id = l.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3))::int AS work_orders,
         ((SELECT COUNT(*) FROM ticket_pqr_records r
             JOIN support_tickets t ON t.id = r.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3)
        + (SELECT COUNT(*) FROM ticket_timeline_events e
             JOIN support_tickets t ON t.id = e.ticket_id
            WHERE t.tenant_id = $1 AND t.import_batch_id = $3))::int AS activity`,
      [ctx.tenantId, refs, batchId],
    )) as Array<{ tickets: number; work_orders: number; activity: number }>;
    const row = rows[0] ?? { tickets: 0, work_orders: 0, activity: 0 };
    const result: MigrationRevertBlocker[] = [];
    const tickets = Number(row.tickets) + Number(row.activity);
    if (tickets > 0) result.push({ motivo: 'TICKET_POSTERIOR', cantidad: tickets });
    if (Number(row.work_orders) > 0) {
      result.push({ motivo: 'ORDEN_DE_TRABAJO', cantidad: Number(row.work_orders) });
    }
    return result;
  }

  async createImportedAttachment(
    ctx: MigrationWriteContext,
    input: ImportedTicketAttachmentInput,
  ): Promise<ImportedTicketAttachmentResult> {
    const media = this.media;
    const existing = rowsOf<{ id: string }>(
      await ctx.manager.query(
        `SELECT id::text AS id FROM ticket_comment_attachments
          WHERE tenant_id = $1 AND external_id = $2`,
        [ctx.tenantId, input.externalId],
      ),
    );
    if (existing[0]) return { status: 'EXISTING', attachmentId: existing[0].id };

    const counted = rowsOf<{ total: number }>(
      await ctx.manager.query(
        `SELECT COUNT(*)::int AS total FROM ticket_comment_attachments
          WHERE tenant_id = $1 AND comment_id = $2`,
        [ctx.tenantId, input.commentId],
      ),
    );
    if (Number(counted[0]?.total ?? 0) >= TICKET_ATTACHMENTS_MAX_PER_COMMENT) {
      return { status: 'SKIPPED', reason: 'EXCEDE_MAXIMO_POR_COMENTARIO' };
    }

    // El `mimeType` de UISP no es confiable y a veces no es estándar (`image/jpg`): solo se
    // contrasta con la firma si es uno de los tipos admitidos; si no, decide la firma.
    const declared = (input.declaredContentType ?? '').trim().toLowerCase();
    const file = {
      buffer: input.buffer,
      declaredContentType: isTicketAttachmentContentType(declared) ? declared : null,
      originalName: input.filename,
    };
    const inspection = media.inspect(file);
    if (!inspection.ok) {
      return { status: 'SKIPPED', reason: SKIP_REASON_BY_REJECTION[inspection.code] };
    }

    // Importado: entra AVAILABLE tras la validación de firma, como los PDF de facturas
    // importados (spec §2.3). El objeto se borra con `purgeImportedAttachmentFiles` si la
    // transacción del lote se revierte.
    const { mediaAssetId } = await media.store(
      {
        manager: ctx.manager,
        tenantSchema: ctx.schemaName,
        actorId: input.uploadedByUserId ?? ctx.actorId,
        initialStatus: 'AVAILABLE',
      },
      file,
      inspection,
    );
    const inserted = rowsOf<{ id: string }>(
      await ctx.manager.query(
        `INSERT INTO ticket_comment_attachments (
           tenant_id, ticket_id, comment_id, media_asset_id, filename, content_type, size_bytes,
           uploaded_by_user_id, external_id, import_batch_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, clock_timestamp())
         RETURNING id::text AS id`,
        [
          ctx.tenantId,
          input.ticketId,
          input.commentId,
          mediaAssetId,
          inspection.filename,
          inspection.contentType,
          inspection.sizeBytes,
          input.uploadedByUserId ?? ctx.actorId,
          input.externalId,
          ctx.batchId,
        ],
      ),
    );
    return { status: 'CREATED', attachmentId: inserted[0]!.id, mediaAssetId };
  }

  async retireBatchAttachments(
    ctx: MigrationWriteContext,
  ): Promise<{ attachments: number; manual: number; mediaAssetIds: string[] }> {
    const media = this.media;
    const rows = rowsOf<{ id: string; media_asset_id: string; imported: boolean }>(
      await ctx.manager.query(
        `SELECT a.id::text AS id, a.media_asset_id::text AS media_asset_id,
                (a.import_batch_id IS NOT DISTINCT FROM $2::uuid) AS imported
           FROM ticket_comment_attachments a
           JOIN support_tickets t ON t.id = a.ticket_id
          WHERE t.tenant_id = $1 AND t.import_batch_id = $2
          FOR UPDATE OF a`,
        [ctx.tenantId, ctx.batchId],
      ),
    );
    if (rows.length === 0) return { attachments: 0, manual: 0, mediaAssetIds: [] };
    await ctx.manager.query(
      `DELETE FROM ticket_comment_attachments WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [ctx.tenantId, rows.map((row) => row.id)],
    );
    const mediaAssetIds = rows.map((row) => row.media_asset_id);
    await media.retire(ctx.manager, ctx.schemaName, mediaAssetIds);
    return {
      attachments: rows.filter((row) => row.imported).length,
      manual: rows.filter((row) => !row.imported).length,
      mediaAssetIds,
    };
  }

  purgeImportedAttachmentFiles(schemaName: string, mediaAssetIds: string[]): Promise<number> {
    return this.media.removeObjects(schemaName, mediaAssetIds);
  }

  async revertBatch(ctx: MigrationWriteContext): Promise<{ tickets: number }> {
    await ctx.manager.query(
      `DELETE FROM ticket_comments c
        USING support_tickets t
        WHERE c.ticket_id = t.id AND t.tenant_id = $1 AND t.import_batch_id = $2`,
      [ctx.tenantId, ctx.batchId],
    );
    const deleted = (await ctx.manager.query(
      `DELETE FROM support_tickets WHERE tenant_id = $1 AND import_batch_id = $2 RETURNING id`,
      [ctx.tenantId, ctx.batchId],
    )) as unknown;
    const rows = Array.isArray(deleted) && Array.isArray(deleted[0]) ? deleted[0] : deleted;
    return { tickets: Array.isArray(rows) ? rows.length : 0 };
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager } from 'typeorm';
import {
  SupportTicket,
  TenantContext,
  TicketComment,
  TicketCommentAttachment,
  runInTenantSchema,
  summarizeErrorForLog,
} from '@iwana/db';
import {
  TICKET_ATTACHMENTS_MAX_PER_COMMENT,
  TicketTimelineEventType,
  UserRole,
  ticketAttachmentStatusFromMediaStatus,
  type TicketAttachmentContentType,
  type TicketCommentAttachment as TicketCommentAttachmentView,
} from '@iwana/shared';
import { CrmSubscriberReadPort } from '../../crm/ports/crm-subscriber-read.port';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { AddCommentWithAttachmentsInput } from '../dto';
import { ticketTitularReferences } from '../privacy/ticket-titular-references';
import {
  TicketAttachmentMediaPort,
  type TicketAttachmentAccepted,
  type TicketAttachmentFileInput,
} from '../ports/ticket-attachment-media.port';
import { TimelineService } from './timeline.service';

/** Mismos roles que `CommentsService`: solo ven tickets asignados y nunca comentarios internos. */
const RESTRICTED_ROLES: readonly string[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];
const RESTRICTED_FROM_INTERNAL: readonly string[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

export interface UploadedTicketAttachmentFile {
  buffer: Buffer;
  mimetype?: string | null;
  originalname: string;
}

export interface TicketAttachmentRejection {
  /** Posición del archivo en la petición (desde 0). */
  index: number;
  /** Nombre mostrado (saneado para el mensaje). */
  filename: string;
  code: string;
  message: string;
}

export type CommentWithAttachments = TicketComment & { attachments: TicketCommentAttachmentView[] };

export interface TicketAttachmentLink {
  url: string;
  expiresAt: string;
  filename: string;
  contentType: TicketAttachmentContentType;
}

/**
 * Adjuntos en comentarios de tickets (spec MOD09 adjuntos 2026-11-16 §2.2). El adjunto hereda
 * la visibilidad del comentario: quien no ve comentarios internos tampoco ve, cuenta ni
 * descarga sus adjuntos. El archivo vive en el módulo de medios y se usa solo por su puerto.
 */
@Injectable()
export class TicketAttachmentsService {
  private readonly logger = new Logger(TicketAttachmentsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TimelineService,
    private readonly crmSubscriberReadPort: CrmSubscriberReadPort,
    private readonly media: TicketAttachmentMediaPort,
  ) {}

  /**
   * Crea el comentario y sus adjuntos en una sola operación. Todo o nada: si un archivo se
   * rechaza no se guarda nada y el mensaje dice cuál y por qué; si falla el almacenamiento, la
   * transacción se revierte y se borran los objetos ya subidos.
   */
  async createCommentWithAttachments(
    ticketId: string,
    input: AddCommentWithAttachmentsInput,
    files: UploadedTicketAttachmentFile[],
    actor: JwtPayload,
  ): Promise<CommentWithAttachments> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    if (files.length > TICKET_ATTACHMENTS_MAX_PER_COMMENT) {
      throw new BadRequestException({
        code: 'TICKET_ATTACHMENTS_TOO_MANY',
        message: `Un comentario admite como máximo ${TICKET_ATTACHMENTS_MAX_PER_COMMENT} archivos. No se guardó nada.`,
      });
    }

    const inputs: TicketAttachmentFileInput[] = files.map((file) => ({
      buffer: file.buffer,
      declaredContentType: file.mimetype ?? null,
      originalName: file.originalname,
    }));
    const accepted: TicketAttachmentAccepted[] = [];
    const rejected: TicketAttachmentRejection[] = [];
    inputs.forEach((file, index) => {
      const result = this.media.inspect(file);
      if (result.ok) accepted.push(result);
      else {
        rejected.push({
          index,
          filename: displayName(file.originalName),
          code: result.code,
          message: result.message,
        });
      }
    });
    if (rejected.length > 0) {
      throw new BadRequestException({
        code: 'TICKET_ATTACHMENT_REJECTED',
        message: `${rejected
          .map((item) => `«${item.filename}»: ${item.message}`)
          .join(' ')} No se guardó el comentario ni sus archivos.`,
        rejected,
      });
    }

    const stored: string[] = [];
    let result: CommentWithAttachments;
    try {
      result = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
        const ticket = await qr.manager.findOne(SupportTicket, {
          where: { id: ticketId, tenantId },
        });
        if (!ticket) throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
        assertTicketAccess(ticket, actor);
        await this.crmSubscriberReadPort.assertWritableReferences(
          ticketTitularReferences(ticket),
          qr,
        );

        const comment = await qr.manager.save(
          TicketComment,
          qr.manager.create(TicketComment, {
            ticketId,
            tenantId,
            body: input.body,
            isInternal: input.isInternal,
            authorUserId: actor.sub,
          }),
        );

        const attachments: TicketCommentAttachmentView[] = [];
        const uploadedAt = Date.now();
        for (const [index, file] of inputs.entries()) {
          const accept = accepted[index] as TicketAttachmentAccepted;
          const { mediaAssetId } = await this.storeFile(
            qr.manager,
            schemaName,
            actor,
            file,
            accept,
          );
          stored.push(mediaAssetId);
          const row = await qr.manager.save(
            TicketCommentAttachment,
            qr.manager.create(TicketCommentAttachment, {
              tenantId,
              ticketId,
              commentId: comment.id,
              mediaAssetId,
              filename: accept.filename,
              contentType: accept.contentType,
              sizeBytes: accept.sizeBytes,
              uploadedByUserId: actor.sub,
              externalId: null,
              importBatchId: null,
              // Misma transacción = mismo now(): un milisegundo por posición conserva el orden
              // de subida al listar (`ORDER BY created_at, id`).
              createdAt: new Date(uploadedAt + index),
            }),
          );
          attachments.push({
            id: row.id,
            filename: accept.filename,
            contentType: accept.contentType,
            sizeBytes: accept.sizeBytes,
            status: ticketAttachmentStatusFromMediaStatus('QUARANTINED'),
          });
        }

        await this.timelineService.recordWithManager(qr.manager, {
          ticketId,
          tenantId,
          eventType: TicketTimelineEventType.COMMENT_ADDED,
          payload: {
            commentId: comment.id,
            isInternal: comment.isInternal,
            attachmentCount: attachments.length,
          },
          actorUserId: actor.sub,
        });
        return { ...comment, attachments };
      });
    } catch (error: unknown) {
      if (stored.length > 0) await this.media.removeObjects(schemaName, stored);
      throw error;
    }

    await this.media.startAnalysis(schemaName, stored);
    return result;
  }

  /** Añade `attachments` a cada comentario ya filtrado por visibilidad. */
  async decorateComments<T extends { id: string }>(
    comments: T[],
  ): Promise<Array<T & { attachments: TicketCommentAttachmentView[] }>> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const ids = comments.map((comment) => comment.id);
    const rows =
      ids.length === 0
        ? []
        : await runInTenantSchema(this.dataSource, schemaName, (qr) =>
            qr.manager
              .createQueryBuilder(TicketCommentAttachment, 'a')
              .where('a.tenant_id = :tenantId', { tenantId })
              .andWhere('a.comment_id IN (:...ids)', { ids })
              .orderBy('a.created_at', 'ASC')
              .addOrderBy('a.id', 'ASC')
              .getMany(),
          );
    const views = await this.toViews(schemaName, rows);
    const byComment = new Map<string, TicketCommentAttachmentView[]>();
    rows.forEach((row, index) => {
      const list = byComment.get(row.commentId) ?? [];
      list.push(views[index] as TicketCommentAttachmentView);
      byComment.set(row.commentId, list);
    });
    return comments.map((comment) => ({
      ...comment,
      attachments: byComment.get(comment.id) ?? [],
    }));
  }

  /** Todos los adjuntos visibles del ticket (sección «Adjuntos (N)» del detalle). */
  async listForTicket(ticketId: string, actor: JwtPayload): Promise<TicketCommentAttachmentView[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const rows = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
      assertTicketAccess(ticket, actor);
      const qb = qr.manager
        .createQueryBuilder(TicketCommentAttachment, 'a')
        .innerJoin(TicketComment, 'c', 'c.id = a.comment_id AND c.ticket_id = a.ticket_id')
        .where('a.tenant_id = :tenantId', { tenantId })
        .andWhere('a.ticket_id = :ticketId', { ticketId })
        .orderBy('a.created_at', 'ASC')
        .addOrderBy('a.id', 'ASC');
      if (!canSeeInternal(actor)) qb.andWhere('c.is_internal = FALSE');
      return qb.getMany();
    });
    return this.toViews(schemaName, rows);
  }

  /** `attachmentCount` de cada ticket del listado (cuenta solo lo que el actor puede ver). */
  async decorateTicketList<T extends { data: unknown[] }>(
    result: T,
    actor: JwtPayload,
  ): Promise<T> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const ids = result.data
      .map((ticket) => (ticket as { id?: unknown }).id)
      .filter((id): id is string => typeof id === 'string');
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const rows = await runInTenantSchema(
        this.dataSource,
        schemaName,
        (qr) =>
          qr.query(
            `SELECT a.ticket_id::text AS ticket_id, COUNT(*)::int AS total
             FROM ticket_comment_attachments a
             JOIN ticket_comments c ON c.id = a.comment_id AND c.ticket_id = a.ticket_id
            WHERE a.tenant_id = $1 AND a.ticket_id = ANY($2::uuid[])
              AND ($3::boolean OR c.is_internal = FALSE)
            GROUP BY a.ticket_id`,
            [tenantId, ids, canSeeInternal(actor)],
          ) as Promise<Array<{ ticket_id: string; total: number }>>,
      );
      for (const row of rows) counts.set(row.ticket_id, Number(row.total));
    }
    return {
      ...result,
      data: result.data.map((ticket) => ({
        ...(ticket as object),
        attachmentCount: counts.get((ticket as { id?: string }).id ?? '') ?? 0,
      })),
    };
  }

  /**
   * Enlace firmado de un adjunto con los mismos permisos que su comentario. Un adjunto de
   * comentario interno responde 404 a quien no ve internos (no revela que existe). En revisión o
   * bloqueado no se firma (409).
   */
  async signLink(
    ticketId: string,
    attachmentId: string,
    disposition: 'inline' | 'attachment',
    actor: JwtPayload,
  ): Promise<TicketAttachmentLink> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const attachment = await runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
      assertTicketAccess(ticket, actor);
      const qb = qr.manager
        .createQueryBuilder(TicketCommentAttachment, 'a')
        .innerJoin(TicketComment, 'c', 'c.id = a.comment_id AND c.ticket_id = a.ticket_id')
        .where('a.id = :attachmentId', { attachmentId })
        .andWhere('a.ticket_id = :ticketId', { ticketId })
        .andWhere('a.tenant_id = :tenantId', { tenantId });
      if (!canSeeInternal(actor)) qb.andWhere('c.is_internal = FALSE');
      return qb.getOne();
    });
    if (!attachment) {
      throw new NotFoundException({
        code: 'TICKET_ATTACHMENT_NOT_FOUND',
        message: 'Adjunto no encontrado.',
      });
    }

    const statuses = await this.media.readStatuses(schemaName, [attachment.mediaAssetId]);
    const status = ticketAttachmentStatusFromMediaStatus(statuses.get(attachment.mediaAssetId));
    if (status === 'IN_REVIEW') {
      throw new ConflictException({
        code: 'TICKET_ATTACHMENT_IN_REVIEW',
        message: 'El archivo está en revisión. Podrás abrirlo cuando termine.',
      });
    }
    const contentType = attachment.contentType as TicketAttachmentContentType;
    const signed =
      status === 'AVAILABLE'
        ? await this.media.signDownload(schemaName, attachment.mediaAssetId, {
            filename: attachment.filename,
            contentType,
            disposition,
          })
        : null;
    if (!signed) {
      throw new ConflictException({
        code: 'TICKET_ATTACHMENT_BLOCKED',
        message: 'Archivo bloqueado: no se puede abrir ni descargar.',
      });
    }
    return {
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      filename: attachment.filename,
      contentType,
    };
  }

  private async storeFile(
    manager: EntityManager,
    tenantSchema: string,
    actor: JwtPayload,
    file: TicketAttachmentFileInput,
    accepted: TicketAttachmentAccepted,
  ): Promise<{ mediaAssetId: string }> {
    try {
      return await this.media.store(
        { manager, tenantSchema, actorId: actor.sub, initialStatus: 'QUARANTINED' },
        file,
        accepted,
      );
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`No se pudo guardar un adjunto: ${summarizeErrorForLog(error)}`);
      throw new ServiceUnavailableException({
        code: 'TICKET_ATTACHMENT_STORAGE_FAILED',
        message: `No se pudo guardar «${accepted.filename}». No se guardó el comentario ni sus archivos; intenta de nuevo.`,
      });
    }
  }

  private async toViews(
    tenantSchema: string,
    rows: TicketCommentAttachment[],
  ): Promise<TicketCommentAttachmentView[]> {
    const statuses = await this.media.readStatuses(
      tenantSchema,
      rows.map((row) => row.mediaAssetId),
    );
    return rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      contentType: row.contentType as TicketAttachmentContentType,
      sizeBytes: row.sizeBytes,
      status: ticketAttachmentStatusFromMediaStatus(statuses.get(row.mediaAssetId)),
    }));
  }
}

export function canSeeInternal(actor: JwtPayload): boolean {
  return !RESTRICTED_FROM_INTERNAL.includes(actor.role);
}

function assertTicketAccess(ticket: SupportTicket, actor: JwtPayload): void {
  if (RESTRICTED_ROLES.includes(actor.role) && ticket.assignedUserId !== actor.sub) {
    throw new ForbiddenException('No tienes acceso a este ticket');
  }
}

/** Nombre para el mensaje de error: sin rutas ni control, corto. */
function displayName(original: string): string {
  const segments = String(original ?? '').split(/[/\\]/u);
  const name = (segments[segments.length - 1] ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/gu, '')
    .trim();
  const short = name.length > 80 ? `${name.slice(0, 77)}...` : name;
  return short || 'archivo sin nombre';
}

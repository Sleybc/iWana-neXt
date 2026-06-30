import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupportTicket, TenantContext, TicketComment, runInTenantSchema } from '@iwana/db';
import { AddCommentInput, AddCommentSchema } from '../dto';
import { TicketTimelineEventType, UserRole } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { TimelineService } from './timeline.service';

const RESTRICTED_ROLES: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];
const RESTRICTED_FROM_INTERNAL: UserRole[] = [UserRole.TECHNICIAN, UserRole.CONTRACTOR];

@Injectable()
export class CommentsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TimelineService,
  ) {}

  async addComment(
    ticketId: string,
    input: AddCommentInput,
    actor: JwtPayload,
  ): Promise<TicketComment> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();
    const validated = AddCommentSchema.parse(input);

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id: ticketId, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
      }

      if (
        RESTRICTED_ROLES.includes(actor.role as UserRole) &&
        ticket.assignedUserId !== actor.sub
      ) {
        throw new ForbiddenException('No tienes acceso a este ticket');
      }

      const comment = qr.manager.create(TicketComment, {
        ticketId,
        tenantId,
        body: validated.body,
        isInternal: validated.isInternal ?? false,
        authorUserId: actor.sub,
      });

      const saved = await qr.manager.save(TicketComment, comment);

      await this.timelineService.recordWithManager(qr.manager, {
        ticketId,
        tenantId,
        eventType: TicketTimelineEventType.COMMENT_ADDED,
        payload: { commentId: saved.id, isInternal: saved.isInternal },
        actorUserId: actor.sub,
      });

      return saved;
    });
  }

  async listComments(ticketId: string, actor: JwtPayload): Promise<TicketComment[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const ticket = await qr.manager.findOne(SupportTicket, { where: { id: ticketId, tenantId } });

      if (!ticket) {
        throw new NotFoundException(`Ticket ${ticketId} no encontrado`);
      }

      if (
        RESTRICTED_ROLES.includes(actor.role as UserRole) &&
        ticket.assignedUserId !== actor.sub
      ) {
        throw new ForbiddenException('No tienes acceso a este ticket');
      }

      const qb = qr.manager
        .createQueryBuilder(TicketComment, 'c')
        .where('c.ticket_id = :ticketId', { ticketId })
        .andWhere('c.tenant_id = :tenantId', { tenantId })
        .orderBy('c.created_at', 'ASC');

      if (RESTRICTED_FROM_INTERNAL.includes(actor.role as UserRole)) {
        qb.andWhere('c.is_internal = FALSE');
      }

      return qb.getMany();
    });
  }
}

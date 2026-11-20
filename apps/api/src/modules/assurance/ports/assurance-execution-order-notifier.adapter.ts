import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantSchema, SupportTicket } from '@iwana/db';
import {
  ExecutionOrderResult,
  TicketStatus,
  TicketSubjectType,
  TicketTimelineEventType,
  TicketType,
} from '@iwana/shared';
import type { AssuranceExecutionOrderNotifierPort } from '../../tasks/ports/assurance-execution-order-notifier.port';
import { SlaService } from '../services/sla.service';
import { TimelineService } from '../services/timeline.service';

/** Estados desde los que el cierre de la orden ya no mueve el ticket. */
const SETTLED_TICKET_STATUSES: readonly TicketStatus[] = [
  TicketStatus.RESOLVED,
  TicketStatus.CLOSED,
  TicketStatus.CANCELLED,
];

@Injectable()
export class AssuranceExecutionOrderNotifierAdapter implements AssuranceExecutionOrderNotifierPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TimelineService,
    private readonly slaService: SlaService,
  ) {}

  async notifyClosedWithManager(
    manager: EntityManager,
    input: {
      ticketId: string;
      executionOrderId: string;
      result: ExecutionOrderResult;
      tenantId: string;
      actorUserId: string;
    },
  ): Promise<void> {
    await this.timelineService.recordWithManager(manager, {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      eventType: TicketTimelineEventType.EXECUTION_ORDER_CLOSED,
      payload: {
        executionOrderId: input.executionOrderId,
        result: input.result,
      },
      actorUserId: input.actorUserId,
    });
    await this.resolveInstallationTicket(manager, input);
  }

  /**
   * El ticket de instalación automático (tarea operativa sobre un expediente) no lo atiende
   * nadie a mano: se resuelve cuando su orden cierra como ejecutada. Cualquier otro resultado
   * (con observaciones, requiere seguimiento, no ejecutada, cancelada) lo deja abierto: es la
   * forma de decir que algo queda pendiente. Es una transición del sistema, por eso no pasa por
   * `VALID_TRANSITIONS`; «Resuelto» sigue pudiendo reabrirse o cerrarse a mano.
   */
  private async resolveInstallationTicket(
    manager: EntityManager,
    input: {
      ticketId: string;
      executionOrderId: string;
      result: ExecutionOrderResult;
      tenantId: string;
      actorUserId: string;
    },
  ): Promise<void> {
    if (input.result !== ExecutionOrderResult.EXECUTED) return;

    const ticket = await manager.findOne(SupportTicket, {
      where: { id: input.ticketId, tenantId: input.tenantId },
    });
    if (
      !ticket ||
      ticket.type !== TicketType.OPERATIONAL_TASK ||
      ticket.subjectType !== TicketSubjectType.EXPEDIENTE ||
      SETTLED_TICKET_STATUSES.includes(ticket.status)
    ) {
      return;
    }

    const now = new Date();
    const updates: Partial<SupportTicket> = { status: TicketStatus.RESOLVED, resolvedAt: now };
    if (!ticket.firstRespondedAt) updates.firstRespondedAt = now;
    updates.slaBreachStatus = this.slaService.deriveBreachStatus(
      Object.assign(new SupportTicket(), ticket, updates),
    );
    await manager.update(SupportTicket, { id: ticket.id, tenantId: input.tenantId }, updates);

    await this.timelineService.recordWithManager(manager, {
      ticketId: ticket.id,
      tenantId: input.tenantId,
      eventType: TicketTimelineEventType.STATUS_CHANGED,
      payload: {
        from: ticket.status,
        to: TicketStatus.RESOLVED,
        notes: 'Resuelto automáticamente: la orden de instalación cerró como ejecutada.',
        automatic: true,
        executionOrderId: input.executionOrderId,
      },
      actorUserId: input.actorUserId,
    });
  }

  async notifyClosed(input: {
    ticketId: string;
    executionOrderId: string;
    result: ExecutionOrderResult;
    tenantId: string;
    schemaName: string;
    actorUserId: string;
  }): Promise<void> {
    await runInTenantSchema(this.dataSource, input.schemaName, async (qr) => {
      await this.notifyClosedWithManager(qr.manager, {
        ticketId: input.ticketId,
        executionOrderId: input.executionOrderId,
        result: input.result,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
      });
    });
  }
}

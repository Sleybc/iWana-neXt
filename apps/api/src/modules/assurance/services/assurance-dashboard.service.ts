import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SupportTicket, TenantContext, runInTenantSchema } from '@iwana/db';
import { SlaBreachStatus, TicketStatus } from '@iwana/shared';
import { SlaService } from './sla.service';

export interface AssuranceDashboardSummary {
  openCount: number;
  assignedCount: number;
  inProgressCount: number;
  atRiskCount: number;
  breachedCount: number;
  resolvedTodayCount: number;
  fieldServicePendingCount: number;
  byPriority: Record<string, number>;
  byType: Record<string, number>;
  byQueue: Record<string, number>;
}

@Injectable()
export class AssuranceDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly slaService: SlaService,
  ) {}

  async getSummary(): Promise<AssuranceDashboardSummary> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      const tickets = await qr.manager.find(SupportTicket, { where: { tenantId } });
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const byPriority: Record<string, number> = {};
      const byType: Record<string, number> = {};
      const byQueue: Record<string, number> = {};
      let atRiskCount = 0;
      let breachedCount = 0;
      let resolvedTodayCount = 0;

      for (const ticket of tickets) {
        const derivedStatus = this.slaService.deriveBreachStatus(ticket);

        if (derivedStatus === SlaBreachStatus.AT_RISK) {
          atRiskCount += 1;
        }

        if (
          derivedStatus === SlaBreachStatus.FIRST_RESPONSE_BREACHED ||
          derivedStatus === SlaBreachStatus.RESOLUTION_BREACHED
        ) {
          breachedCount += 1;
        }

        if (ticket.resolvedAt && ticket.resolvedAt >= todayStart && ticket.resolvedAt <= todayEnd) {
          resolvedTodayCount += 1;
        }

        // RESOLVED = solución registrada, pendiente cierre — no cuenta como carga activa de cola
        if (
          ![TicketStatus.CLOSED, TicketStatus.CANCELLED, TicketStatus.RESOLVED].includes(
            ticket.status,
          )
        ) {
          byPriority[ticket.priority] = (byPriority[ticket.priority] ?? 0) + 1;
          byType[ticket.type] = (byType[ticket.type] ?? 0) + 1;
          if (ticket.queueName) {
            byQueue[ticket.queueName] = (byQueue[ticket.queueName] ?? 0) + 1;
          }
        }
      }

      return {
        openCount: tickets.filter((ticket) => ticket.status === TicketStatus.OPEN).length,
        assignedCount: tickets.filter((ticket) => ticket.status === TicketStatus.ASSIGNED).length,
        inProgressCount: tickets.filter((ticket) => ticket.status === TicketStatus.IN_PROGRESS)
          .length,
        atRiskCount,
        breachedCount,
        resolvedTodayCount,
        fieldServicePendingCount: tickets.filter(
          (ticket) => ticket.status === TicketStatus.FIELD_SERVICE_REQUESTED,
        ).length,
        byPriority,
        byType,
        byQueue,
      };
    });
  }
}

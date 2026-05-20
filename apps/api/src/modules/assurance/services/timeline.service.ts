import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { TenantContext, runInTenantSchema, TicketTimelineEvent } from '@iwana/db';
import { TicketTimelineEventType } from '@iwana/shared';

export interface RecordTimelineEventInput {
  ticketId: string;
  tenantId: string;
  eventType: TicketTimelineEventType;
  payload?: Record<string, unknown>;
  actorUserId: string | null;
}

@Injectable()
export class TimelineService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Registra un evento en la timeline usando un EntityManager existente (dentro de transaccion). */
  async recordWithManager(
    manager: EntityManager,
    input: RecordTimelineEventInput,
  ): Promise<TicketTimelineEvent> {
    const event = manager.create(TicketTimelineEvent, {
      ticketId: input.ticketId,
      tenantId: input.tenantId,
      eventType: input.eventType,
      payload: input.payload ?? {},
      actorUserId: input.actorUserId,
      occurredAt: new Date(),
    });

    return manager.save(TicketTimelineEvent, event);
  }

  /** Lista todos los eventos de la timeline de un ticket, ordenados cronologicamente. */
  async listTimeline(ticketId: string): Promise<TicketTimelineEvent[]> {
    const { tenantId, schemaName } = TenantContext.getOrThrow();

    return runInTenantSchema(this.dataSource, schemaName, async (qr) => {
      return qr.manager
        .createQueryBuilder(TicketTimelineEvent, 'tte')
        .where('tte.ticket_id = :ticketId', { ticketId })
        .andWhere('tte.tenant_id = :tenantId', { tenantId })
        .orderBy('tte.occurred_at', 'ASC')
        .getMany();
    });
  }
}

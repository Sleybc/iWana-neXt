import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { runInTenantSchema } from '@iwana/db';
import { ExecutionOrderResult, TicketTimelineEventType } from '@iwana/shared';
import type { AssuranceExecutionOrderNotifierPort } from '../../tasks/ports/assurance-execution-order-notifier.port';
import { TimelineService } from '../services/timeline.service';

@Injectable()
export class AssuranceExecutionOrderNotifierAdapter implements AssuranceExecutionOrderNotifierPort {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly timelineService: TimelineService,
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

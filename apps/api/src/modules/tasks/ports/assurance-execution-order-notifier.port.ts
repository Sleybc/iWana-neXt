import { ExecutionOrderResult } from '@iwana/shared';
import { EntityManager } from 'typeorm';

export interface AssuranceExecutionOrderNotifierPort {
  notifyClosed(input: {
    ticketId: string;
    executionOrderId: string;
    result: ExecutionOrderResult;
    tenantId: string;
    schemaName: string;
    actorUserId: string;
  }): Promise<void>;

  notifyClosedWithManager(
    manager: EntityManager,
    input: {
      ticketId: string;
      executionOrderId: string;
      result: ExecutionOrderResult;
      tenantId: string;
      actorUserId: string;
    },
  ): Promise<void>;
}

export const ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT = 'ASSURANCE_EXECUTION_ORDER_NOTIFIER_PORT';

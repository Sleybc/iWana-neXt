import { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';
export declare class ExecutionOrder {
  id: string;
  tenantId: string;
  executionOrderNumber: string;
  visitRequestId: string | null;
  scheduleEventId: string;
  assignedTechnicianId: string | null;
  assignedCrewId: string | null;
  originContext: string;
  originRefId: string | null;
  taskId: string | null;
  ticketId: string | null;
  subscriberId: string | null;
  customerDisplayLabel: string;
  serviceAddress: string | null;
  municipality: string | null;
  sector: string | null;
  workType: WfmWorkType;
  workSummary: string;
  workInstructions: string | null;
  plannedWindowStartAt: Date;
  plannedWindowEndAt: Date;
  status: ExecutionOrderStatus;
  result: ExecutionOrderResult | null;
  startedAt: Date | null;
  closedAt: Date | null;
  closeNotes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
//# sourceMappingURL=execution-order.entity.d.ts.map

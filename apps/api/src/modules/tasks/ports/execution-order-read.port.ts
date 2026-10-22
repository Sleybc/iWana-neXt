import type { ExecutionOrderResult, ExecutionOrderStatus, WfmWorkType } from '@iwana/shared';

/** Puerto tipado de lectura de MOD11 consumido por otros módulos. */
export const EXECUTION_ORDER_READ_PORT = Symbol('EXECUTION_ORDER_READ_PORT');

export interface ExecutionSnapshot {
  id: string;
  executionOrderNumber: string;
  status: ExecutionOrderStatus;
  workType: WfmWorkType;
  isAnnulled: boolean;
  subscriberId: string | null;
  assignedTechnicianId: string | null;
  customerDisplayLabel: string;
  closedAt: string | null;
  result: ExecutionOrderResult | null;
}

export interface InstallationOrdersQuery {
  group: 'IN_PROGRESS' | 'CLOSED_EXECUTED';
  excludeIds: string[];
  page: number;
  limit: number;
}

export interface ExecutionOrderReadPort {
  /** Indica si el suscriptor tiene una OT de retiro abierta en su tenant actual. */
  hasOpenWithdrawalOrders(subscriberId: string): Promise<boolean>;

  getExecutionSnapshot(executionOrderId: string): Promise<ExecutionSnapshot | null>;
  getExecutionSnapshots(executionOrderIds: string[]): Promise<ExecutionSnapshot[]>;
  hasEvidence(
    executionOrderId: string,
    evidenceId: string,
    types: Array<'PHOTO' | 'DOCUMENT'>,
  ): Promise<boolean>;
  listInstallationOrders(
    query: InstallationOrdersQuery,
  ): Promise<{ rows: ExecutionSnapshot[]; total: number }>;
}

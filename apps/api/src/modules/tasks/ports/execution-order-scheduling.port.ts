import { EntityManager } from 'typeorm';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CreateExecutionOrderFromSchedulingInput } from '../services/execution-orders.service';

export const EXECUTION_ORDER_SCHEDULING_PORT = Symbol('EXECUTION_ORDER_SCHEDULING_PORT');

/** Puerto tipado MOD09→MOD11; MOD09 no importa servicios ni entidades de MOD11. */
export interface ExecutionOrderSchedulingPort {
  createFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<{ id: string; executionOrderNumber: string; status: string }>;

  /** Cancela una OT desde la agenda de WFM usando el manager transaccional activo. */
  cancelFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    executionOrderId: string,
    scheduleEventId: string,
    reason: string,
    actor: JwtPayload,
  ): Promise<{ id: string; status: string }>;
}

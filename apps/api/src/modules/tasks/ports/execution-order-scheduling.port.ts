import { EntityManager } from 'typeorm';
import { WfmWorkType } from '@iwana/shared';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import type { CreateExecutionOrderFromSchedulingInput } from '../services/execution-orders.service';

export const EXECUTION_ORDER_SCHEDULING_PORT = Symbol('EXECUTION_ORDER_SCHEDULING_PORT');

export interface LinkExecutionOrderToScheduleInput {
  executionOrderId: string;
  scheduleEventId: string;
  organizationSiteId: string | null;
  assignedTechnicianId: string;
  workType: WfmWorkType;
  plannedWindowStartAt: string;
  plannedWindowEndAt: string;
}

export interface RescheduleExecutionOrderInput {
  executionOrderId: string;
  scheduleEventId: string;
  plannedWindowStartAt: string;
  plannedWindowEndAt: string;
}

/** Puerto tipado MOD09→MOD11; MOD09 no importa servicios ni entidades de MOD11. */
export interface ExecutionOrderSchedulingPort {
  createFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: CreateExecutionOrderFromSchedulingInput,
    actor: JwtPayload,
  ): Promise<{ id: string; executionOrderNumber: string; status: string }>;

  /** Vincula por MOD11 una OT despachada a un evento ya creado por MOD09. */
  linkFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: LinkExecutionOrderToScheduleInput,
    actor: JwtPayload,
  ): Promise<{ id: string; status: string }>;

  /** Propaga una reprogramación de MOD09 a la OT ya vinculada. */
  rescheduleFromSchedulingWithManager(
    manager: EntityManager,
    tenantId: string,
    input: RescheduleExecutionOrderInput,
    actor: JwtPayload,
  ): Promise<{ id: string; status: string }>;

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

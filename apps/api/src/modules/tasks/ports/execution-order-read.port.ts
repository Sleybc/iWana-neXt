import type { EntityManager } from 'typeorm';
import type {
  ExecutionOrderResult,
  ExecutionOrderStatus,
  LinkExecutionOrderOutcome,
  WfmWorkType,
} from '@iwana/shared';

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

/** Referencia mínima para validar existencia y asignación sin exponer datos del cliente. */
export interface ExecutionOrderReference {
  id: string;
  assignedTechnicianId: string | null;
}

export interface InstallationOrdersQuery {
  group: 'IN_PROGRESS' | 'CLOSED_EXECUTED';
  excludeIds: string[];
  page: number;
  limit: number;
}

/** Proyección mínima de evidencia de OT autorizada para el contexto de aprovisionamiento. */
export interface ProvisioningEvidenceSummary {
  id: string;
  evidenceType: 'PHOTO' | 'DOCUMENT';
  requirementKey: string | null;
  createdAt: string;
}

/**
 * Orden de ejecución vista desde un ticket (MOD10 paso 2, D4). Sin datos del cliente:
 * ni `customerDisplayLabel`, ni `subscriberId`, ni dirección.
 */
export interface TicketExecutionOrderSummary {
  id: string;
  executionOrderNumber: string;
  status: ExecutionOrderStatus;
  result: ExecutionOrderResult | null;
  closedAt: string | null;
}

/** Búsqueda por número: añade la anulación y el ticket al que ya pertenece. */
export interface ExecutionOrderTicketLookup extends TicketExecutionOrderSummary {
  isAnnulled: boolean;
  ticketId: string | null;
}

export interface LinkExecutionOrderToTicketInput {
  executionOrderId: string;
  ticketId: string;
  actorUserId: string;
}

/**
 * LINKED: MOD11 escribió `ticket_id`. ALREADY_LINKED: ya era de este ticket (idempotente).
 * Una orden de otro ticket lanza 409; inexistente o anulada, 404.
 */
export interface LinkExecutionOrderToTicketResult {
  order: TicketExecutionOrderSummary;
  outcome: LinkExecutionOrderOutcome;
}

export interface ExecutionOrderReadPort {
  /**
   * La orden no anulada más reciente con `ticket_id` = ticket y el total de no anuladas.
   * Corre con el manager de la transacción del llamante.
   */
  findLatestForTicketWithManager(
    manager: EntityManager,
    tenantId: string,
    ticketId: string,
  ): Promise<{ latest: TicketExecutionOrderSummary; count: number } | null>;

  /**
   * La orden no anulada más reciente de cada ticket de una página del listado (spec MOD05
   * Soporte §16 B-2), en una sola consulta. Los tickets sin orden quedan fuera del mapa.
   */
  findLatestForTicketsWithManager(
    manager: EntityManager,
    tenantId: string,
    ticketIds: readonly string[],
  ): Promise<ReadonlyMap<string, TicketExecutionOrderSummary>>;

  /** Búsqueda exacta por número en el tenant de la petición. */
  findByNumber(executionOrderNumber: string): Promise<ExecutionOrderTicketLookup | null>;

  /** MOD11 escribe el vínculo de la orden con el ticket (dueño de `execution_orders`). */
  linkTicketWithManager(
    manager: EntityManager,
    tenantId: string,
    input: LinkExecutionOrderToTicketInput,
  ): Promise<LinkExecutionOrderToTicketResult>;

  /** Indica si el suscriptor tiene una OT de retiro abierta en su tenant actual. */
  hasOpenWithdrawalOrders(subscriberId: string): Promise<boolean>;

  getExecutionSnapshot(executionOrderId: string): Promise<ExecutionSnapshot | null>;
  getExecutionReference(executionOrderId: string): Promise<ExecutionOrderReference | null>;
  getExecutionSnapshots(executionOrderIds: string[]): Promise<ExecutionSnapshot[]>;
  hasEvidence(
    executionOrderId: string,
    evidenceId: string,
    types: Array<'PHOTO' | 'DOCUMENT'>,
  ): Promise<boolean>;
  listProvisioningEvidence(executionOrderId: string): Promise<ProvisioningEvidenceSummary[]>;
  listInstallationOrders(
    query: InstallationOrdersQuery,
  ): Promise<{ rows: ExecutionSnapshot[]; total: number }>;
}
